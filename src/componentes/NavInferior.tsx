import { NavLink } from 'react-router'

/**
 * Navegacao na base, nao no topo: em aparelhos de 6"+ o topo da tela e zona
 * "dificil" para o polegar. Os nomes seguem o vocabulario do nicho, que e
 * convergente entre todos os concorrentes — nao inventar sinonimo.
 */
export function NavInferior({ onSair }: { onSair?: () => void }) {
  const abas = [
    { para: '/fichas', rotulo: 'Fichas técnicas' },
    { para: '/insumos', rotulo: 'Insumos' },
  ]
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-slate-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {abas.map((a) => (
        <NavLink
          key={a.para}
          to={a.para}
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-sm font-medium ${
              isActive ? 'text-marca-700' : 'text-slate-500'
            }`
          }
        >
          {a.rotulo}
        </NavLink>
      ))}
      {onSair && (
        <button onClick={onSair} className="flex-1 py-3 text-center text-sm font-medium text-slate-400">
          Sair
        </button>
      )}
    </nav>
  )
}
