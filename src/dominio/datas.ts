/** Datas para exibicao — sempre no fuso do aparelho, que e o da loja. */

export const formatarHora = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const formatarDia = (ms: number) =>
  new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

export function inicioDoDia(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Soma dias pelo calendario, nao por 24h: sobrevive a virada de horario de verao. */
export function somarDias(inicioMs: number, dias: number): number {
  const d = new Date(inicioMs)
  d.setDate(d.getDate() + dias)
  return d.getTime()
}

export const ehHoje = (ms: number) => inicioDoDia(ms) === inicioDoDia(Date.now())
