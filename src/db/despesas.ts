import { parcelar, repeticoesPendentes, type Despesa } from '../dominio/financeiro'
import { db, type DespesaLocal } from './local'
import { pedirSync } from './sync'

/** Escritas de despesa. Toda gravacao carimba `atualizadoEm` e pede o sync. */

type Nova = Omit<Despesa, 'id' | 'serieId'>

const carimbar = (d: Despesa): DespesaLocal => ({ ...d, atualizadoEm: Date.now(), excluidoEm: null })

/**
 * Id derivado do conteudo, em formato de UUID.
 *
 * Serve para "trazer as despesas do mes passado": se o balcao e o celular
 * fizerem isso offline, cada um criaria a sua copia do aluguel de outubro, e
 * depois do sync o mes teria dois alugueis. Com o id saindo de serie + mes, os
 * dois aparelhos geram o MESMO registro e o sync os funde.
 */
async function idDerivado(texto: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))).slice(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x50 // versao 5
  b[8] = (b[8]! & 0x3f) | 0x80 // variante RFC 4122
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Cria uma despesa; com `parcelas`, cria uma por mes a partir do mes informado. */
export async function criarDespesa(nova: Nova, parcelas?: number) {
  const serieId = crypto.randomUUID()
  const base = { ...nova, serieId }
  const registros = parcelas && parcelas > 1 ? parcelar(base, parcelas) : [base]
  await db.despesas.bulkPut(registros.map((r) => carimbar({ ...r, id: crypto.randomUUID() })))
  pedirSync()
}

export async function atualizarDespesa(id: string, mudancas: Partial<Nova>) {
  const atual = await db.despesas.get(id)
  if (!atual) return
  await db.despesas.put({ ...atual, ...mudancas, atualizadoEm: Date.now() })
  pedirSync()
}

export async function excluirDespesa(id: string) {
  const atual = await db.despesas.get(id)
  if (!atual) return
  await db.despesas.put({ ...atual, excluidoEm: Date.now(), atualizadoEm: Date.now() })
  pedirSync()
  return atual
}

export async function restaurarDespesa(d: DespesaLocal) {
  await db.despesas.put({ ...d, excluidoEm: null, atualizadoEm: Date.now() })
  pedirSync()
}

/** Copia para `mes` as despesas que se repetem e ainda nao estao nele. Devolve quantas trouxe. */
export async function trazerRepeticoes(mes: string): Promise<number> {
  const todas = await db.despesas.filter((d) => !d.excluidoEm).toArray()
  const pendentes = repeticoesPendentes(mes, todas)
  const registros = await Promise.all(
    pendentes.map(async (p) => carimbar({ ...p, id: await idDerivado(`${p.serieId}:${mes}`) })),
  )
  await db.despesas.bulkPut(registros)
  pedirSync()
  return registros.length
}
