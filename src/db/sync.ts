import { api, lerSessao } from '../auth/sessao'
import { CONFIG_PADRAO, db, unidadePorCodigo, type FichaLocal, type InsumoLocal } from './local'

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

/** Só o que mudou desde a última sincronização bem-sucedida. */
async function coletarPendentes(desde: number) {
  const [insumos, fichas, config] = await Promise.all([
    db.insumos.filter((i) => i.atualizadoEm > desde).toArray(),
    db.fichas.filter((f) => f.atualizadoEm > desde).toArray(),
    db.config.get('default'),
  ])
  return { insumos, fichas, config }
}

export async function contarPendentes(): Promise<number> {
  const { insumos, fichas } = await coletarPendentes(lerUltimoSync())
  return insumos.length + fichas.length
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
    const { insumos, fichas, config } = await coletarPendentes(desde)

    if (insumos.length > 0 || fichas.length > 0 || desde === 0) {
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
        }),
      })
      if (!rPush.ok) throw new Error(`push falhou: ${rPush.status}`)
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
      enviados: insumos.length + fichas.length,
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
}

async function aplicarPull(d: RespostaPull) {
  await db.transaction('rw', db.insumos, db.fichas, db.config, async () => {
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
  atualizadoEm: i.atualizadoEm,
  excluidoEm: i.excluidoEm ?? null,
})

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
  document.addEventListener('visibilitychange', aoVoltarAoApp)
  const timer = setInterval(rodar, 60_000)
  void rodar()

  return () => {
    window.removeEventListener('online', rodar)
    document.removeEventListener('visibilitychange', aoVoltarAoApp)
    clearInterval(timer)
  }
}
