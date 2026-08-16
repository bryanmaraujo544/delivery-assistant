import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  configProducao,
  fichaItem,
  fichaPerda,
  fichaTecnica,
  insumo,
  precificacao,
} from '../../src/db/schema'
import { autenticar } from '../auth/rotas'
import { db } from '../db'
import { num, zPush, type FichaSync, type InsumoSync } from './mapeamento'

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
    const { insumos, fichas, config } = parse.data

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
    })

    return { ok: true, recebidos: { insumos: insumos.length, fichas: fichas.length } }
  })

  app.get('/sync/pull', async (req, reply) => {
    const ctx = req.ctx!
    const parse = z.object({ desde: z.coerce.number().int().min(0).default(0) }).safeParse(req.query)
    if (!parse.success) return reply.code(400).send({ erro: 'parâmetro "desde" inválido' })
    const desde = new Date(parse.data.desde)

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
