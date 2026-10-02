import { api, lerSessao } from '../auth/sessao'
import type { MovimentoCaixa, SessaoCaixa, Venda } from '../dominio/venda'
import {
  CONFIG_PADRAO,
  db,
  unidadePorCodigo,
  type FichaLocal,
  type InsumoLocal,
  type ProdutoLocal,
} from './local'

/**
 * Sincronização.
 *
 * NÃO é uma fila de outbox clássica. Como cada conta tem UMA usuária e a
 * resolução é last-write-wins, sincronizar o REGISTRO INTEIRO por
 * `atualizadoEm` é equivalente e bem mais simples:
 *
 *  - idempotente por construção (reenviar o mesmo registro não faz mal);
 *  - não duplica payload (a fila guardaria uma cópia de cada mutação);
 *  - deletes já viajam como soft delete (`excluidoEm`), sem operação especial.
 *
 * Uma fila de verdade só se justificaria com operações não-idempotentes ou
 * ordem relevante entre mutações — nada disso existe aqui.
 *
 * REGRA DE OURO mantida: o servidor é a fonte da verdade; o IndexedDB é cache.
 *
 * CAIXA E VENDAS seguem outra regra. São fatos imutáveis, então não há "última
 * escrita" a comparar: sobem enquanto estiverem marcados `pendente` e o
 * servidor os insere de forma idempotente. A marca só é limpa quando o servidor
 * confirma, por contagem, que recebeu aquele tipo de registro.
 */

const CHAVE_ULTIMO = 'precifica.ultimoSync'

const lerUltimoSync = () => Number(localStorage.getItem(CHAVE_ULTIMO) ?? 0)
const gravarUltimoSync = (t: number) => localStorage.setItem(CHAVE_ULTIMO, String(t))

export type EstadoSync = 'ocioso' | 'sincronizando' | 'offline' | 'erro'

/**
 * Ja houve pelo menos uma sincronizacao bem-sucedida?
 *
 * Existe para o onboarding nao aparecer no lugar errado: banco local vazio
 * pode significar "conta nova" OU "dispositivo novo, o pull ainda nao chegou".
 * Mostrar "o que voce mais faz?" para quem ja tem 40 fichas no servidor seria
 * assustador — e aceitar a resposta criaria dado duplicado.
 */
export const jaSincronizou = () => lerUltimoSync() > 0

/**
 * Conta criada agora neste dispositivo.
 *
 * Complementa `jaSincronizou`: banco local vazio pode ser "conta nova" OU
 * "dispositivo novo esperando o pull". Depender so do sync deixava a usuaria
 * sem onboarding quando a API estava fora do ar — e foi exatamente o que
 * aconteceu quando uma migration ficou pendente.
 */
export const ehContaNova = () => localStorage.getItem('precifica.contaNova') === '1'
export const esquecerContaNova = () => localStorage.removeItem('precifica.contaNova')

/**
 * Sair TEM de limpar o banco local.
 *
 * VAZAMENTO ENTRE CONTAS que isto fecha: antes, sair limpava so a sessao e o
 * `ultimoSync`, deixando insumos e fichas no IndexedDB. Quando outra pessoa
 * entrasse no mesmo aparelho, `ultimoSync` voltaria a 0, `atualizadoEm > 0`
 * casaria com TODOS os registros, e o catalogo inteiro da primeira subiria
 * para o tenant da segunda.
 *
 * O servidor e a fonte da verdade: o que ja sincronizou volta no proximo login.
 * O que nao subiu se perde — por isso a confirmacao avisa quantos sao.
 */
export async function limparDadosLocais() {
  await db.delete()
  localStorage.removeItem(CHAVE_ULTIMO)
  localStorage.removeItem('precifica.contaNova')
}

/** Só o que mudou desde a última sincronização bem-sucedida. */
async function coletarPendentes(desde: number) {
  const [insumos, fichas, config, produtos, sessoes, movimentos, vendas] = await Promise.all([
    db.insumos.filter((i) => i.atualizadoEm > desde).toArray(),
    db.fichas.filter((f) => f.atualizadoEm > desde).toArray(),
    db.config.get('default'),
    db.produtos.filter((p) => p.atualizadoEm > desde).toArray(),
    db.caixaSessoes.where('pendente').equals(1).toArray(),
    db.caixaMovimentos.where('pendente').equals(1).toArray(),
    db.vendas.where('pendente').equals(1).toArray(),
  ])
  return { insumos, fichas, config, produtos, sessoes, movimentos, vendas }
}

export async function contarPendentes(): Promise<number> {
  const p = await coletarPendentes(lerUltimoSync())
  return (
    p.insumos.length +
    p.fichas.length +
    p.produtos.length +
    p.sessoes.length +
    p.movimentos.length +
    p.vendas.length
  )
}

/**
 * Sincroniza nos dois sentidos.
 *
 * Ordem importa: PUSH antes de PULL. O contrário faria o servidor devolver uma
 * versão antiga por cima de edição local ainda não enviada.
 */
export async function sincronizar(): Promise<{ estado: EstadoSync; enviados: number; recebidos: number }> {
  if (!lerSessao()) return { estado: 'ocioso', enviados: 0, recebidos: 0 }
  if (!navigator.onLine) return { estado: 'offline', enviados: 0, recebidos: 0 }

  const desde = lerUltimoSync()

  try {
    const { insumos, fichas, config, produtos, sessoes, movimentos, vendas } =
      await coletarPendentes(desde)
    const fatos = sessoes.length + movimentos.length + vendas.length

    if (insumos.length > 0 || fichas.length > 0 || produtos.length > 0 || fatos > 0 || desde === 0) {
      const rPush = await api('/sync/push', {
        method: 'POST',
        body: JSON.stringify({
          insumos: insumos.map(paraEnvioInsumo),
          fichas: fichas.map(paraEnvioFicha),
          config: config
            ? {
                salarioDesejadoCentavos: config.salarioDesejadoCentavos,
                horasMes: config.horasMes,
                custoFixoMensalCentavos: config.custoFixoMensalCentavos,
                unidadesMes: config.unidadesMes,
              }
            : null,
          produtos: produtos.map(paraEnvioProduto),
          sessoes: sessoes.map(semPendencia),
          movimentos: movimentos.map(semPendencia),
          vendas: vendas.map(semPendencia),
        }),
      })
      if (!rPush.ok) throw new Error(`push falhou: ${rPush.status}`)

      // Um servidor de versão anterior ignora os campos que não conhece e
      // responde ok. Sem conferir a contagem, o app daria as vendas por
      // entregues e elas existiriam só neste aparelho.
      const { recebidos } = (await rPush.json()) as { recebidos?: Record<string, number> }
      if (
        (recebidos?.produtos ?? 0) !== produtos.length ||
        (recebidos?.sessoes ?? 0) !== sessoes.length ||
        (recebidos?.movimentos ?? 0) !== movimentos.length ||
        (recebidos?.vendas ?? 0) !== vendas.length
      ) {
        throw new Error('servidor não confirmou o recebimento de produtos/caixa/vendas')
      }
      await confirmarFatos(sessoes, movimentos, vendas)
    }

    const rPull = await api(`/sync/pull?desde=${desde}`)
    if (!rPull.ok) throw new Error(`pull falhou: ${rPull.status}`)
    const dados = (await rPull.json()) as RespostaPull

    await aplicarPull(dados)

    // carimbo do SERVIDOR: relógio de celular erra, e um adiantado faria o
    // cliente pular mudanças na próxima rodada
    gravarUltimoSync(dados.servidorEm)

    return {
      estado: 'ocioso',
      enviados: insumos.length + fichas.length + produtos.length + fatos,
      recebidos: dados.insumos.length + dados.fichas.length,
    }
  } catch (e) {
    console.warn('[sync] falhou:', e)
    return { estado: navigator.onLine ? 'erro' : 'offline', enviados: 0, recebidos: 0 }
  }
}

interface RespostaPull {
  servidorEm: number
  insumos: Omit<InsumoLocal, 'dimensao'>[]
  fichas: FichaLocal[]
  config: Omit<(typeof CONFIG_PADRAO), 'id'> | null
  produtos?: ProdutoLocal[]
  sessoes?: SessaoCaixa[]
  movimentos?: MovimentoCaixa[]
  vendas?: Venda[]
}

/**
 * Limpa `pendente` do que acabou de subir — mas só se o registro não mudou
 * enquanto a requisição estava no ar. Uma venda cancelada nesse intervalo
 * precisa continuar pendente para o cancelamento subir na próxima rodada.
 */
async function confirmarFatos(sessoes: SessaoCaixa[], movimentos: MovimentoCaixa[], vendas: Venda[]) {
  await db.transaction('rw', db.caixaSessoes, db.caixaMovimentos, db.vendas, async () => {
    for (const s of sessoes) {
      await db.caixaSessoes
        .where('id')
        .equals(s.id)
        .and((l) => (l.fechadaEm ?? null) === (s.fechadaEm ?? null))
        .modify({ pendente: 0 })
    }
    await db.caixaMovimentos.where('id').anyOf(movimentos.map((m) => m.id)).modify({ pendente: 0 })
    for (const v of vendas) {
      await db.vendas
        .where('id')
        .equals(v.id)
        .and((l) => (l.canceladaEm ?? null) === (v.canceladaEm ?? null))
        .modify({ pendente: 0 })
    }
  })
}

async function aplicarPull(d: RespostaPull) {
  await db.transaction('rw', db.caixaSessoes, db.caixaMovimentos, db.vendas, async () => {
    // Fato pendente local nunca é sobrescrito pelo que desce: ele carrega uma
    // transição (fechar, cancelar) que o servidor ainda não viu.
    for (const s of d.sessoes ?? []) {
      if ((await db.caixaSessoes.get(s.id))?.pendente) continue
      await db.caixaSessoes.put({ ...s, pendente: 0 })
    }
    for (const m of d.movimentos ?? []) {
      if ((await db.caixaMovimentos.get(m.id))?.pendente) continue
      await db.caixaMovimentos.put({ ...m, pendente: 0 })
    }
    for (const v of d.vendas ?? []) {
      if ((await db.vendas.get(v.id))?.pendente) continue
      await db.vendas.put({ ...v, pendente: 0 })
    }
  })

  await db.transaction('rw', db.insumos, db.fichas, db.config, db.produtos, async () => {
    for (const p of d.produtos ?? []) {
      const local = await db.produtos.get(p.id)
      if (local && local.atualizadoEm > p.atualizadoEm) continue
      await db.produtos.put(p)
    }
    for (const i of d.insumos) {
      const local = await db.insumos.get(i.id)
      // LWW também na descida: não sobrescrever edição local mais recente que
      // ainda não subiu
      if (local && local.atualizadoEm > i.atualizadoEm) continue
      await db.insumos.put({
        ...i,
        // `dimensao` não trafega: é derivável da unidade de compra, e ter dois
        // lugares guardando a mesma verdade é convite a dessincronizar
        dimensao: unidadePorCodigo(i.embalagemUnidade).dimensao,
      })
    }
    for (const f of d.fichas) {
      const local = await db.fichas.get(f.id)
      if (local && local.atualizadoEm > f.atualizadoEm) continue
      await db.fichas.put(f)
    }
    if (d.config) await db.config.put({ id: 'default', ...d.config })
  })
}

const paraEnvioInsumo = (i: InsumoLocal) => ({
  id: i.id,
  nome: i.nome,
  nomeNormalizado: i.nomeNormalizado,
  categoria: i.categoria ?? null,
  embalagemQuantidade: i.embalagemQuantidade,
  embalagemUnidade: i.embalagemUnidade,
  precoEmbalagemCentavos: i.precoEmbalagemCentavos,
  quantidadeBase: i.quantidadeBase,
  fatorCorrecao: i.fatorCorrecao,
  precoEstimado: i.precoEstimado,
  origemSeed: i.origemSeed,
  favorito: i.favorito ?? false,
  atualizadoEm: i.atualizadoEm,
  excluidoEm: i.excluidoEm ?? null,
})

const paraEnvioProduto = (p: ProdutoLocal) => ({
  id: p.id,
  nome: p.nome,
  nomeNormalizado: p.nomeNormalizado,
  categoria: p.categoria ?? null,
  precoCentavos: p.precoCentavos,
  fichaId: p.fichaId ?? null,
  atualizadoEm: p.atualizadoEm,
  excluidoEm: p.excluidoEm ?? null,
})

/** `pendente` é controle deste aparelho — não faz parte do fato. */
const semPendencia = <T extends { pendente: 0 | 1 }>({ pendente: _, ...resto }: T) => resto

const paraEnvioFicha = (f: FichaLocal) => ({
  id: f.id,
  nome: f.nome,
  categoria: f.categoria ?? null,
  rendimentoTeorico: f.rendimentoTeorico,
  rendimentoReal: f.rendimentoReal ?? null,
  unidadeRendimento: f.unidadeRendimento,
  tempoPreparoMin: f.tempoPreparoMin ?? null,
  ehBase: f.ehBase,
  itens: f.itens,
  perdas: f.perdas,
  markupBase: f.markupBase,
  markupMultiplicador: f.markupMultiplicador,
  canalTaxaPercentual: f.canalTaxaPercentual ?? 0,
  atualizadoEm: f.atualizadoEm,
  excluidoEm: f.excluidoEm ?? null,
})

/**
 * Dispara sincronização nos momentos em que ela tem chance de dar certo.
 *
 * NÃO usamos Background Sync API: só existe em Chromium e falha calada nos
 * demais. `online` + `visibilitychange` cobrem os casos reais — voltou a
 * conexão, ou a pessoa voltou ao app depois de trocar de aba.
 */
const EVENTO_PEDIR_SYNC = 'precifica:sync'

/**
 * Pede uma sincronização agora, sem esperar o intervalo.
 *
 * Existe para a venda: ela é o único exemplar de um fato enquanto não sobe,
 * então não faz sentido deixá-la até um minuto só no aparelho com a rede ali.
 */
export const pedirSync = () => window.dispatchEvent(new Event(EVENTO_PEDIR_SYNC))

export function iniciarSyncAutomatico(aoMudar: (e: EstadoSync) => void) {
  let rodando = false

  const rodar = async () => {
    if (rodando || !lerSessao()) return
    rodando = true
    aoMudar('sincronizando')
    const r = await sincronizar()
    aoMudar(r.estado)
    rodando = false
  }

  const aoVoltarAoApp = () => document.visibilityState === 'visible' && rodar()

  window.addEventListener('online', rodar)
  window.addEventListener(EVENTO_PEDIR_SYNC, rodar)
  document.addEventListener('visibilitychange', aoVoltarAoApp)
  const timer = setInterval(rodar, 60_000)
  void rodar()

  return () => {
    window.removeEventListener('online', rodar)
    window.removeEventListener(EVENTO_PEDIR_SYNC, rodar)
    document.removeEventListener('visibilitychange', aoVoltarAoApp)
    clearInterval(timer)
  }
}
