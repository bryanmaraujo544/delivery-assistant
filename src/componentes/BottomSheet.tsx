import { useEffect, type ReactNode } from 'react'

interface Props {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: ReactNode
  rodape?: ReactNode
}

/**
 * Todo fluxo de criacao acontece em bottom sheet — nunca em pagina nova nem
 * modal central.
 *
 * Motivo: em aparelhos de 6"+ o topo da tela e zona "dificil" para o polegar.
 * O sheet nasce na base, onde o polegar ja esta, e o teclado abre logo abaixo
 * do campo em foco. Modal central obriga a esticar a mao; pagina nova faz
 * perder o contexto da lista.
 *
 * No desktop nao existe polegar: a partir de `lg` o mesmo componente vira um
 * dialogo centralizado.
 */
export function BottomSheet({ aberto, titulo, onFechar, children, rodape }: Props) {
  useEffect(() => {
    if (!aberto) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onFechar}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="vidro-solido relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl lg:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-2 rounded-lg px-3 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {rodape && (
          <footer
            className="border-t border-slate-100 px-4 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {rodape}
          </footer>
        )}
      </div>
    </div>
  )
}
