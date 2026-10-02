import { useEffect, useState } from 'react'

/**
 * Undo em vez de "Tem certeza?".
 *
 * Confirmacao e proporcional ao custo de RECONSTRUIR, nao ao fato de ser um
 * delete. Modal em acao rotineira treina a pessoa a dispensar sem ler — o que
 * destroi justamente a protecao que ele deveria dar.
 *
 * POR QUE E GLOBAL, e nao um hook por tela:
 * excluir uma ficha navega de volta para a lista, o que DESMONTA o editor. Um
 * snackbar preso ao componente ia embora junto com ele, e o "Desfazer" nunca
 * chegava a aparecer — exatamente o que aconteceu na primeira versao. Vivendo
 * acima da rota, o aviso sobrevive a navegacao.
 *
 * Janela de 5s (padrao Material). Nunca e o UNICO caminho de recuperacao:
 * exclusao e soft delete, entao da para restaurar depois.
 */

interface Aviso {
  id: number
  mensagem: string
  onDesfazer?: () => void
}

type Ouvinte = (a: Aviso | null) => void

let ouvintes: Ouvinte[] = []
let sequencia = 0

/** Chamavel de qualquer lugar, inclusive de fora de componente React. */
export function mostrarAviso(mensagem: string, onDesfazer?: () => void) {
  const aviso = { id: ++sequencia, mensagem, onDesfazer }
  ouvintes.forEach((o) => o(aviso))
}

export function SnackbarGlobal() {
  const [aviso, setAviso] = useState<Aviso | null>(null)

  useEffect(() => {
    const ouvinte: Ouvinte = (a) => setAviso(a)
    ouvintes.push(ouvinte)
    return () => {
      ouvintes = ouvintes.filter((o) => o !== ouvinte)
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso?.id])

  if (!aviso) return null

  return (
    <div
      // polite (nao assertive) para nao interromper o leitor de tela no meio
      // de outra leitura — e um aviso, nao um alerta
      role="status"
      aria-live="polite"
      className="fixed right-0 left-[var(--nav-w)] z-60 mx-auto flex w-[calc(100%-var(--nav-w)-2rem)]
                 max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900/90 px-4 py-3
                 text-white shadow-lg backdrop-blur"
      style={{ bottom: 'calc(var(--nav-h) + 5.5rem + env(safe-area-inset-bottom))' }}
    >
      <span className="text-sm">{aviso.mensagem}</span>
      {aviso.onDesfazer && (
        <button
          onClick={() => {
            aviso.onDesfazer?.()
            setAviso(null)
          }}
          className="shrink-0 rounded-lg px-3 text-sm font-semibold text-marca-50 underline"
        >
          Desfazer
        </button>
      )}
    </div>
  )
}
