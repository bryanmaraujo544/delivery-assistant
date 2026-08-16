import { db, type UsoInsumoLocal } from './local'

/**
 * Frecency — modelo do Slack Quick Switcher, nao o do Firefox.
 *
 * Buckets discretos em vez de decaimento exponencial: o score so muda quando o
 * tempo cruza uma fronteira, entao da para calcular no cliente sem job de
 * recalculo. O modelo do Firefox so compensa com milhares de itens; aqui sao
 * 50-300 insumos.
 *
 * O termo de recencia satura em 100 e o de frequencia e ilimitado — e isso que
 * permite ao item MUITO usado eventualmente ultrapassar o item usado ONTEM.
 */

const HORA = 3_600_000
const DIA = 24 * HORA

const BUCKETS: [limite: number, pontos: number][] = [
  [4 * HORA, 100],
  [1 * DIA, 80],
  [3 * DIA, 60],
  [7 * DIA, 40],
  [30 * DIA, 20],
  [90 * DIA, 10],
]

const MAX_TIMESTAMPS = 10

export function pontosPorIdade(idadeMs: number): number {
  for (const [limite, pontos] of BUCKETS) if (idadeMs <= limite) return pontos
  return 0
}

export function scoreFrecency(uso: UsoInsumoLocal, agora = Date.now()): number {
  if (uso.ultimosUsos.length === 0) return 0
  const soma = uso.ultimosUsos.reduce((acc, ts) => acc + pontosPorIdade(agora - ts), 0)
  return uso.contagem * (soma / uso.ultimosUsos.length)
}

/**
 * `contexto` particiona o ranking: os insumos do topo em "Bolo" nao sao os
 * mesmos de "Brigadeiro". Custo: uma coluna a mais na chave.
 */
export async function registrarUso(insumoId: string, contexto = 'global', agora = Date.now()) {
  const id = `${insumoId}::${contexto}`
  const atual = await db.usoInsumos.get(id)
  const ultimosUsos = [agora, ...(atual?.ultimosUsos ?? [])].slice(0, MAX_TIMESTAMPS)
  await db.usoInsumos.put({
    id,
    insumoId,
    contexto,
    contagem: (atual?.contagem ?? 0) + 1,
    ultimosUsos,
  })
}

/**
 * Ranking para os chips. Consulta o contexto especifico E o global, somando —
 * assim uma ficha nova (contexto sem historico) ainda mostra sugestao util.
 */
export async function rankearInsumos(contexto: string, agora = Date.now()): Promise<string[]> {
  const usos = await db.usoInsumos
    .filter((u) => u.contexto === contexto || u.contexto === 'global')
    .toArray()

  const porInsumo = new Map<string, number>()
  for (const u of usos) {
    const peso = u.contexto === contexto ? 1 : 0.5
    porInsumo.set(u.insumoId, (porInsumo.get(u.insumoId) ?? 0) + scoreFrecency(u, agora) * peso)
  }

  return [...porInsumo.entries()].sort(([, a], [, b]) => b - a).map(([id]) => id)
}
