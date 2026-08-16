import { useCallback, useEffect, useRef, useState } from 'react'

interface Aviso {
  id: number
  mensagem: string
  onDesfazer?: () => void
}

/**
 * Undo em vez de "Tem certeza?".
 *
 * Confirmacao e proporcional ao custo de RECONSTRUIR, nao ao fato de ser um
 * delete. Modal em acao rotineira treina a pessoa a dispensar sem ler — o que
 * destroi justamente a protecao que ele deveria dar.
 *
 * Janela de 5s (padrao Material). O snackbar nunca e o UNICO caminho de
 * recuperacao: exclusao e soft delete, entao da para restaurar depois.
 */
export function useSnackbar() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((mensagem: string, onDesfazer?: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    setAviso({ id: Date.now(), mensagem, onDesfazer })
    timer.current = setTimeout(() => setAviso(null), 5000)
  }, [])

  const fechar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setAviso(null)
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const elemento = aviso ? (
    <div
      // polite (nao assertive) para nao interromper o leitor de tela no meio
      // de outra leitura — e um aviso, nao um alerta
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-60 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center
                 justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <span className="text-sm">{aviso.mensagem}</span>
      {aviso.onDesfazer && (
        <button
          onClick={() => {
            aviso.onDesfazer?.()
            fechar()
          }}
          className="shrink-0 rounded-lg px-3 text-sm font-semibold text-marca-50 underline"
        >
          Desfazer
        </button>
      )}
    </div>
  ) : null

  return { mostrar, elemento }
}
