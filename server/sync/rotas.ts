import { and, eq, gt, inArray, isNull, lt, min, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  caixaMovimento,
  caixaSessao,
  configProducao,
  despesa,
  estoqueContagem,
  fichaItem,
  fichaPerda,
  fichaTecnica,
  insumo,
  precificacao,
  produto,
  venda,
} from '../../src/db/schema'
import { validarVenda } from '../../src/dominio/venda'
import { autenticar } from '../auth/rotas'
import { db } from '../db'
import {
  num,
  zPush,
  type ContagemEstoqueSync,
  type DespesaSync,
  type FichaSync,
  type InsumoSync,
  type MovimentoCaixaSync,
  type ProdutoSync,
  type SessaoCaixaSync,
  type VendaSync,
} from './mapeamento'

/**
 * No primeiro pull de um aparelho (desde = 0) so desce o historico recente de
 * caixa e vendas. Catalogo desce inteiro, mas vendas crescem sem limite: uma
 * loja com um ano de movimento nao pode travar o login baixando tudo.
 */
const JANELA_PRIMEIRO_PULL_MS = 60 * 24 * 60 * 60 * 1000

/**
 * O pull de fatos volta alguns minutos alem do cursor. Um push em andamento
 * carimba `sincronizado_em` no inicio da transacao e so aparece no commit; sem
 * a folga, um pull que caisse nesse intervalo avancaria o cursor e nunca mais
 * veria aquela venda. Reentregar e inofensivo: o cliente aplica por id.
 */
const FOLGA_PULL_MS = 5 * 60 * 1000

/**
 * Sincronizacao.
 *
 * Modelo: last-write-wins por registro, comparando `atualizado_em`. Isso e
 * suficiente porque cada conta tem UMA usuaria — nao existem duas pessoas
 * editando a mesma ficha ao mesmo tempo. CRDT aqui seria complexidade sem
 * problema correspondente.
 *
 * O cliente e a fonte de verdade do que mudou nele; o servidor e a fonte de
 * verdade do que sobrevive. Deletes viajam como soft delete (`excluidoEm`),
 * entao "apagado" e apenas mais um estado que segue a mesma regra de LWW.
 */
export async function registrarRotasSync(app: FastifyInstance) {
  /** Toda rota daqui exige sessao E escopo de tenant. */
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/sync')) return
    const ctx = await autenticar(req.headers.authorization)
    if (!ctx) return reply.code(401).send({ erro: 'não autenticado' })
    // o tenant vem SEMPRE da sessao, nunca do corpo da requisicao: confiar no
    // cliente para dizer de quem sao os dados e vazamento garantido
    req.ctx = ctx
  })

  app.post('/sync/push', async (req, reply) => {
    const ctx = req.ctx!
    const parse = zPush.safeParse(req.body)
    if (!parse.success) {
      return reply.code(400).send({ erro: 'payload inválido', detalhe: parse.error.issues.slice(0, 5) })
    }
    const { insumos, fichas, config, produtos, sessoes, movimentos, vendas, contagens, despesas } =
      parse.data

    // a aritmetica da venda e conferida aqui, com a MESMA funcao do cliente:
    // o servidor nunca grava um total so porque ele veio no corpo
    try {
      for (const v of vendas) validarVenda(v)
    } catch (e) {
      return reply.code(400).send({ erro: `venda inválida: ${(e as Error).message}` })
    }

    // venda e movimento apontam para uma sessao. A FK garante que ela existe,
    // mas nao que e DESTE tenant — sem esta checagem daria para pendurar uma
    // venda no caixa de outra conta.
    const idsSessao = [...new Set([...vendas, ...movimentos].map((x) => x.sessaoId))]
    const noLote = new Set(sessoes.map((s) => s.id))
    const faltam = idsSessao.filter((id) => !noLote.has(id))
    if (faltam.length > 0) {
      const achadas = await db
        .select({ id: caixaSessao.id })
        .from(caixaSessao)
        .where(and(eq(caixaSessao.tenantId, ctx.tenantId), inArray(caixaSessao.id, faltam)))
      if (achadas.length !== faltam.length) {
        return reply.code(400).send({ erro: 'sessão de caixa desconhecida' })
      }
    }

    await db.transaction(async (tx) => {
      for (const i of insumos) await gravarInsumo(tx, ctx.tenantId, i)
      // insumos primeiro: uma ficha pode referenciar insumo criado no mesmo lote
      for (const f of fichas) await gravarFicha(tx, ctx.tenantId, f)
      if (config) {
        await tx
          .insert(configProducao)
          .values({ tenantId: ctx.tenantId, ...config, perdaPadraoPercentual: '4.000' })
          .onConflictDoUpdate({ target: configProducao.tenantId, set: config })
      }
      for (const p of produtos) await gravarProduto(tx, ctx.tenantId, p)
      // sessoes antes de movimentos e vendas, que apontam para elas
      for (const s of sessoes) await gravarSessao(tx, ctx.tenantId, s)
      for (const m of movimentos) await gravarMovimento(tx, ctx.tenantId, m)
      for (const v of vendas) await gravarVenda(tx, ctx.tenantId, v)
      for (const c of contagens) await gravarContagem(tx, ctx.tenantId, c)
      for (const d of despesas) await gravarDespesa(tx, ctx.tenantId, d)
    })

    return {
      ok: true,
      // o cliente so da uma venda por entregue se ESTE servidor disser que a
      // recebeu: um servidor de versao anterior ignoraria os campos novos e
      // responderia ok mesmo assim
      recebidos: {
        insumos: insumos.length,
        fichas: fichas.length,
        produtos: produtos.length,
        sessoes: sessoes.length,
        movimentos: movimentos.length,
        vendas: vendas.length,
        contagens: contagens.length,
        despesas: despesas.length,
      },
    }
  })

  app.get('/sync/pull', async (req, reply) => {
    const ctx = req.ctx!
    const parse = z.object({ desde: z.coerce.number().int().min(0).default(0) }).safeParse(req.query)
    if (!parse.success) return reply.code(400).send({ erro: 'parâmetro "desde" inválido' })
    const desde = new Date(parse.data.desde)

    const desdeEventos =
      parse.data.desde === 0
        ? new Date(Date.now() - JANELA_PRIMEIRO_PULL_MS)
        : new Date(parse.data.desde - FOLGA_PULL_MS)

    // Contagens de estoque descem TODAS no primeiro pull: sao poucas (uma por
    // reposicao) e o saldo depende da ultima de cada produto, por mais antiga
    // que seja.
    const contagensDb = await db
      .select()
      .from(estoqueContagem)
      .where(
        and(
          eq(estoqueContagem.tenantId, ctx.tenantId),
          gt(estoqueContagem.sincronizadoEm, parse.data.desde === 0 ? new Date(0) : desdeEventos),
        ),
      )

    // O saldo e "ultima contagem − vendas depois dela". Se um produto foi
    // contado ha mais tempo que a janela, as vendas desde entao precisam
    // descer tambem — senao o aparelho novo mostraria estoque a mais.
    let desdeVendas = desdeEventos
    if (parse.data.desde === 0) {
      const ultimaPorProduto = db
        .select({ ultima: sql<Date>`max(${estoqueContagem.criadoEm})`.as('ultima') })
        .from(estoqueContagem)
        .where(eq(estoqueContagem.tenantId, ctx.tenantId))
        .groupBy(estoqueContagem.produtoId)
        .as('u')
      const [{ maisAntiga } = { maisAntiga: null }] = await db
        .select({ maisAntiga: min(ultimaPorProduto.ultima) })
        .from(ultimaPorProduto)
      if (maisAntiga && new Date(maisAntiga) < desdeVendas) desdeVendas = new Date(maisAntiga)
    }
    const [produtosDb, sessoesDb, movimentosDb, vendasDb] = await Promise.all([
      db
        .select()
        .from(produto)
        .where(and(eq(produto.tenantId, ctx.tenantId), gt(produto.atualizadoEm, desde))),
      db
        .select()
        .from(caixaSessao)
        .where(and(eq(caixaSessao.tenantId, ctx.tenantId), gt(caixaSessao.sincronizadoEm, desdeEventos))),
      db
        .select()
        .from(caixaMovimento)
        .where(
          and(eq(caixaMovimento.tenantId, ctx.tenantId), gt(caixaMovimento.sincronizadoEm, desdeEventos)),
        ),
      db
        .select()
        .from(venda)
        .where(
          and(
            eq(venda.tenantId, ctx.tenantId),
            // no primeiro pull o corte e pela data da VENDA; nos seguintes, pelo carimbo do servidor
            parse.data.desde === 0 ? gt(venda.criadaEm, desdeVendas) : gt(venda.sincronizadoEm, desdeEventos),
          ),
        ),
    ])

    const despesasDb = await db
      .select()
      .from(despesa)
      .where(and(eq(despesa.tenantId, ctx.tenantId), gt(despesa.atualizadoEm, desde)))

    const [insumosDb, fichasDb, cfg] = await Promise.all([
      db
        .select()
        .from(insumo)
        .where(and(eq(insumo.tenantId, ctx.tenantId), gt(insumo.atualizadoEm, desde))),
      db
        .select()
        .from(fichaTecnica)
        .where(and(eq(fichaTecnica.tenantId, ctx.tenantId), gt(fichaTecnica.atualizadoEm, desde))),
      db.select().from(configProducao).where(eq(configProducao.tenantId, ctx.tenantId)).limit(1),
    ])

    const ids = fichasDb.map((f) => f.id)
    const [itens, perdas, precos] = ids.length
      ? await Promise.all([
          db.select().from(fichaItem).where(inArray(fichaItem.fichaId, ids)),
          db.select().from(fichaPerda).where(inArray(fichaPerda.fichaId, ids)),
          db.select().from(precificacao).where(inArray(precificacao.fichaId, ids)),
        ])
      : [[], [], []]

    return {
      // carimbo do SERVIDOR, nunca do cliente: relogio de celular erra, e um
      // relogio adiantado faria o cliente pular mudancas na proxima sincronizacao
      servidorEm: Date.now(),
      insumos: insumosDb.map((i) => ({
        id: i.id,
        nome: i.nome,
        nomeNormalizado: i.nomeNormalizado,
        categoria: i.categoria,
        embalagemQuantidade: num(i.embalagemQuantidade)!,
        embalagemUnidade: i.embalagemUnidade,
        precoEmbalagemCentavos: i.precoEmbalagemCentavos,
        quantidadeBase: num(i.quantidadeBase)!,
        fatorCorrecao: num(i.fatorCorrecao)!,
        precoEstimado: i.precoEstimado,
        origemSeed: i.origemSeed,
        favorito: i.favorito,
        atualizadoEm: i.atualizadoEm.getTime(),
        excluidoEm: i.excluidoEm?.getTime() ?? null,
      })),
      fichas: fichasDb.map((f) => ({
        id: f.id,
        nome: f.nome,
        categoria: f.categoria,
        rendimentoTeorico: num(f.rendimentoTeorico)!,
        rendimentoReal: num(f.rendimentoReal),
        unidadeRendimento: f.unidadeRendimento,
        tempoPreparoMin: f.tempoPreparoMin,
        ehBase: f.ehBase,
        itens: itens
          .filter((it) => it.fichaId === f.id)
          .sort((a, b) => a.ordem - b.ordem)
          .map((it) =>
            it.insumoId
              ? {
                  tipo: 'insumo' as const,
                  insumoId: it.insumoId,
                  quantidade: num(it.quantidade)!,
                  unidade: it.unidade,
                }
              : {
                  tipo: 'subficha' as const,
                  fichaId: it.subFichaId!,
                  quantidade: num(it.quantidade)!,
                  unidade: it.unidade,
                },
          ),
        perdas: perdas
          .filter((p) => p.fichaId === f.id)
          .map((p) => ({ tipo: p.tipo, percentual: num(p.percentual)! })),
        canalTaxaPercentual: num(f.canalTaxaPercentual) ?? 0,
        markupBase: precos.find((p) => p.fichaId === f.id)?.base ?? ('materiais' as const),
        markupMultiplicador: num(precos.find((p) => p.fichaId === f.id)?.multiplicador ?? '2.5')!,
        atualizadoEm: f.atualizadoEm.getTime(),
        excluidoEm: f.excluidoEm?.getTime() ?? null,
      })),
      config: cfg[0]
        ? {
            salarioDesejadoCentavos: cfg[0].salarioDesejadoCentavos,
            horasMes: cfg[0].horasMes,
            custoFixoMensalCentavos: cfg[0].custoFixoMensalCentavos,
            unidadesMes: cfg[0].unidadesMes,
          }
        : null,
      produtos: produtosDb.map((p) => ({
        id: p.id,
        nome: p.nome,
        nomeNormalizado: p.nomeNormalizado,
        categoria: p.categoria,
        precoCentavos: p.precoCentavos,
        fichaId: p.fichaId,
        ordem: p.ordem,
        atualizadoEm: p.atualizadoEm.getTime(),
        excluidoEm: p.excluidoEm?.getTime() ?? null,
      })),
      sessoes: sessoesDb.map((s) => ({
        id: s.id,
        abertaEm: s.abertaEm.getTime(),
        fundoTrocoCentavos: s.fundoTrocoCentavos,
        fechadaEm: s.fechadaEm?.getTime() ?? null,
        contadoCentavos: s.contadoCentavos,
        observacao: s.observacao,
      })),
      movimentos: movimentosDb.map((m) => ({
        id: m.id,
        sessaoId: m.sessaoId,
        tipo: m.tipo,
        valorCentavos: m.valorCentavos,
        motivo: m.motivo,
        criadoEm: m.criadoEm.getTime(),
      })),
      vendas: vendasDb.map((v) => ({
        id: v.id,
        sessaoId: v.sessaoId,
        itens: v.itens,
        descontoCentavos: v.descontoCentavos,
        totalCentavos: v.totalCentavos,
        pagamentos: v.pagamentos,
        trocoCentavos: v.trocoCentavos,
        criadaEm: v.criadaEm.getTime(),
        canceladaEm: v.canceladaEm?.getTime() ?? null,
        motivoCancelamento: v.motivoCancelamento,
      })),
      despesas: despesasDb.map((d) => ({
        id: d.id,
        descricao: d.descricao,
        categoria: d.categoria,
        valorCentavos: d.valorCentavos,
        mes: d.mes,
        repete: d.repete,
        serieId: d.serieId,
        parcela: d.parcela,
        parcelas: d.parcelas,
        pagoEm: d.pagoEm?.getTime() ?? null,
        atualizadoEm: d.atualizadoEm.getTime(),
        excluidoEm: d.excluidoEm?.getTime() ?? null,
      })),
      contagens: contagensDb.map((c) => ({
        id: c.id,
        produtoId: c.produtoId,
        quantidade: c.quantidade,
        criadoEm: c.criadoEm.getTime(),
      })),
    }
  })
}

/* ─────────────────────────── gravacao ─────────────────────────── */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function gravarInsumo(tx: Tx, tenantId: string, i: InsumoSync) {
  const linha = {
    id: i.id,
    tenantId,
    nome: i.nome,
    nomeNormalizado: i.nomeNormalizado,
    categoria: i.categoria ?? null,
    embalagemQuantidade: String(i.embalagemQuantidade),
    embalagemUnidade: i.embalagemUnidade,
    precoEmbalagemCentavos: i.precoEmbalagemCentavos,
    quantidadeBase: String(i.quantidadeBase),
    fatorCorrecao: String(i.fatorCorrecao),
    precoEstimado: i.precoEstimado,
    origemSeed: i.origemSeed,
    favorito: i.favorito ?? false,
    atualizadoEm: new Date(i.atualizadoEm),
    excluidoEm: i.excluidoEm ? new Date(i.excluidoEm) : null,
  }
  await tx
    .insert(insumo)
    .values(linha)
    .onConflictDoUpdate({
      target: insumo.id,
      set: linha,
      // LWW: so sobrescreve se o que esta no banco for MAIS ANTIGO que o
      // que chegou. Sem isso, um cliente que ficou offline uma semana
      // sobrescreveria edicoes recentes feitas em outro dispositivo.
      setWhere: lt(insumo.atualizadoEm, new Date(i.atualizadoEm)),
    })
}

async function gravarFicha(tx: Tx, tenantId: string, f: FichaSync) {
  const linha = {
    id: f.id,
    tenantId,
    nome: f.nome,
    categoria: f.categoria ?? null,
    rendimentoTeorico: String(f.rendimentoTeorico),
    rendimentoReal: f.rendimentoReal != null ? String(f.rendimentoReal) : null,
    unidadeRendimento: f.unidadeRendimento,
    tempoPreparoMin: f.tempoPreparoMin ?? null,
    ehBase: f.ehBase,
    canalTaxaPercentual: String(f.canalTaxaPercentual ?? 0),
    atualizadoEm: new Date(f.atualizadoEm),
    excluidoEm: f.excluidoEm ? new Date(f.excluidoEm) : null,
  }
  await tx.insert(fichaTecnica).values(linha).onConflictDoUpdate({
    target: fichaTecnica.id,
    set: linha,
    setWhere: lt(fichaTecnica.atualizadoEm, new Date(f.atualizadoEm)),
  })

  // itens e perdas: apagar e reinserir. A ficha e sempre editada inteira, entao
  // diff granular seria complexidade sem ganho — e o "delete + insert" garante
  // que item removido no cliente some do servidor.
  await tx.delete(fichaItem).where(eq(fichaItem.fichaId, f.id))
  if (f.itens.length > 0) {
    await tx.insert(fichaItem).values(
      f.itens.map((it, ordem) => ({
        fichaId: f.id,
        insumoId: it.tipo === 'insumo' ? it.insumoId : null,
        subFichaId: it.tipo === 'subficha' ? it.fichaId : null,
        quantidade: String(it.quantidade),
        unidade: it.unidade,
        ordem,
      })),
    )
  }

  await tx.delete(fichaPerda).where(eq(fichaPerda.fichaId, f.id))
  if (f.perdas.length > 0) {
    await tx
      .insert(fichaPerda)
      .values(f.perdas.map((p) => ({ fichaId: f.id, tipo: p.tipo, percentual: String(p.percentual) })))
  }

  const preco = {
    fichaId: f.id,
    base: f.markupBase,
    multiplicador: String(f.markupMultiplicador),
  }
  await tx.insert(precificacao).values(preco).onConflictDoUpdate({
    target: precificacao.fichaId,
    set: { base: preco.base, multiplicador: preco.multiplicador },
  })
}

async function gravarProduto(tx: Tx, tenantId: string, p: ProdutoSync) {
  const linha = {
    id: p.id,
    tenantId,
    nome: p.nome,
    nomeNormalizado: p.nomeNormalizado,
    categoria: p.categoria ?? null,
    precoCentavos: p.precoCentavos,
    fichaId: p.fichaId ?? null,
    ordem: p.ordem ?? null,
    atualizadoEm: new Date(p.atualizadoEm),
    excluidoEm: p.excluidoEm ? new Date(p.excluidoEm) : null,
  }
  await tx
    .insert(produto)
    .values(linha)
    .onConflictDoUpdate({
      target: produto.id,
      set: linha,
      // LWW, e SO dentro do proprio tenant: sem o filtro, quem acertasse o id
      // de um produto alheio o sobrescreveria e o levaria para a propria conta
      setWhere: and(eq(produto.tenantId, tenantId), lt(produto.atualizadoEm, new Date(p.atualizadoEm))),
    })
}

/**
 * Fatos entram por insert idempotente: reenviar o mesmo lote (conexao caiu
 * antes da resposta) nao duplica nada. As transicoes — fechar, cancelar — so
 * acontecem uma vez (`IS NULL`) e sempre filtradas pelo tenant.
 */
async function gravarSessao(tx: Tx, tenantId: string, s: SessaoCaixaSync) {
  await tx
    .insert(caixaSessao)
    .values({
      id: s.id,
      tenantId,
      abertaEm: new Date(s.abertaEm),
      fundoTrocoCentavos: s.fundoTrocoCentavos,
    })
    .onConflictDoNothing()
  if (s.fechadaEm) {
    await tx
      .update(caixaSessao)
      .set({
        fechadaEm: new Date(s.fechadaEm),
        contadoCentavos: s.contadoCentavos ?? null,
        observacao: s.observacao ?? null,
        sincronizadoEm: sql`now()`,
      })
      .where(and(eq(caixaSessao.id, s.id), eq(caixaSessao.tenantId, tenantId), isNull(caixaSessao.fechadaEm)))
  }
}

async function gravarMovimento(tx: Tx, tenantId: string, m: MovimentoCaixaSync) {
  await tx
    .insert(caixaMovimento)
    .values({
      id: m.id,
      tenantId,
      sessaoId: m.sessaoId,
      tipo: m.tipo,
      valorCentavos: m.valorCentavos,
      motivo: m.motivo,
      criadoEm: new Date(m.criadoEm),
    })
    .onConflictDoNothing()
}

async function gravarVenda(tx: Tx, tenantId: string, v: VendaSync) {
  await tx
    .insert(venda)
    .values({
      id: v.id,
      tenantId,
      sessaoId: v.sessaoId,
      itens: v.itens,
      descontoCentavos: v.descontoCentavos,
      totalCentavos: v.totalCentavos,
      pagamentos: v.pagamentos,
      trocoCentavos: v.trocoCentavos,
      criadaEm: new Date(v.criadaEm),
    })
    .onConflictDoNothing()
  if (v.canceladaEm) {
    await tx
      .update(venda)
      .set({
        canceladaEm: new Date(v.canceladaEm),
        motivoCancelamento: v.motivoCancelamento ?? null,
        // recarimba para o cancelamento descer no pull dos outros aparelhos
        sincronizadoEm: sql`now()`,
      })
      .where(and(eq(venda.id, v.id), eq(venda.tenantId, tenantId), isNull(venda.canceladaEm)))
  }
}

async function gravarContagem(tx: Tx, tenantId: string, c: ContagemEstoqueSync) {
  await tx
    .insert(estoqueContagem)
    .values({
      id: c.id,
      tenantId,
      produtoId: c.produtoId,
      quantidade: c.quantidade,
      criadoEm: new Date(c.criadoEm),
    })
    .onConflictDoNothing()
}

async function gravarDespesa(tx: Tx, tenantId: string, d: DespesaSync) {
  const linha = {
    id: d.id,
    tenantId,
    descricao: d.descricao,
    categoria: d.categoria,
    valorCentavos: d.valorCentavos,
    mes: d.mes,
    repete: d.repete,
    serieId: d.serieId,
    parcela: d.parcela ?? null,
    parcelas: d.parcelas ?? null,
    pagoEm: d.pagoEm ? new Date(d.pagoEm) : null,
    atualizadoEm: new Date(d.atualizadoEm),
    excluidoEm: d.excluidoEm ? new Date(d.excluidoEm) : null,
  }
  await tx
    .insert(despesa)
    .values(linha)
    .onConflictDoUpdate({
      target: despesa.id,
      set: linha,
      // LWW, e so dentro do proprio tenant
      setWhere: and(eq(despesa.tenantId, tenantId), lt(despesa.atualizadoEm, new Date(d.atualizadoEm))),
    })
}
