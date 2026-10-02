import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { BottomSheet } from './BottomSheet'

/**
 * Navegacao do app: barra lateral no desktop, barra na base no celular.
 *
 * O balcao da loja usa desktop; a cozinha usa celular. No celular a barra fica
 * na base porque em aparelhos de 6"+ o topo da tela e zona "dificil" para o
 * polegar. Os nomes seguem o vocabulario do nicho — nao inventar sinonimo.
 *
 * A ordem e a do dia de trabalho: vender vem primeiro porque e o que se faz
 * dezenas de vezes por dia; custos vem por ultimo porque e trabalho de
 * bastidor.
 */

interface Item {
  para: string
  rotulo: string
  icone: string
}

const LOJA: Item[] = [
  { para: '/vender', rotulo: 'Vender', icone: 'M3 6h18l-2 9H5L3 6zm3 13h.01M18 19h.01' },
  { para: '/caixa', rotulo: 'Caixa', icone: 'M3 7h18v12H3zM3 11h18M7 15h4' },
  { para: '/vendas', rotulo: 'Vendas', icone: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { para: '/produtos', rotulo: 'Produtos', icone: 'M4 8l8-4 8 4-8 4-8-4zm0 0v8l8 4 8-4V8m-8 4v8' },
]

const CUSTOS: Item[] = [
  { para: '/fichas', rotulo: 'Fichas técnicas', icone: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3' },
  { para: '/insumos', rotulo: 'Insumos', icone: 'M5 8h14l-1 13H6L5 8zm3 0a4 4 0 018 0' },
]

const ICONE_MAIS = 'M5 12h.01M12 12h.01M19 12h.01'

function Icone({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export function Navegacao({ email, onSair }: { email: string; onSair: () => void }) {
  const [maisAberto, setMaisAberto] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      {/* ─── desktop: barra lateral ─── */}
      <nav
        aria-label="Principal"
        className="vidro fixed inset-y-3 left-3 z-30 hidden w-[calc(var(--nav-w)-1.5rem)] flex-col rounded-3xl p-3 lg:flex"
      >
        <p className="px-3 pt-2 pb-4 text-xl font-bold text-marca-700">Precifica</p>

        <ul className="space-y-1">
          {LOJA.map((i) => (
            <LinkLateral key={i.para} item={i} />
          ))}
        </ul>

        <p className="px-3 pt-6 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Custos
        </p>
        <ul className="space-y-1">
          {CUSTOS.map((i) => (
            <LinkLateral key={i.para} item={i} />
          ))}
        </ul>

        <div className="mt-auto">
          <p className="truncate px-3 pb-1 text-xs text-slate-500" title={email}>
            {email}
          </p>
          <button
            onClick={onSair}
            className="w-full rounded-2xl px-3 text-left text-sm font-medium text-slate-600 hover:bg-white/60"
          >
            Sair
          </button>
        </div>
      </nav>

      {/* ─── celular: barra na base ─── */}
      <nav
        aria-label="Principal"
        className="vidro fixed inset-x-3 z-30 flex rounded-3xl px-1 lg:hidden"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {LOJA.map((i) => (
          <NavLink
            key={i.para}
            to={i.para}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-xs font-medium ${
                isActive ? 'text-marca-700' : 'text-slate-600'
              }`
            }
          >
            <Icone d={i.icone} />
            {i.rotulo}
          </NavLink>
        ))}
        <button
          onClick={() => setMaisAberto(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-xs font-medium text-slate-600"
        >
          <Icone d={ICONE_MAIS} />
          Mais
        </button>
      </nav>

      <BottomSheet aberto={maisAberto} titulo="Mais" onFechar={() => setMaisAberto(false)}>
        <ul className="space-y-2">
          {CUSTOS.map((i) => (
            <li key={i.para}>
              <button
                onClick={() => {
                  setMaisAberto(false)
                  navigate(i.para)
                }}
                className="vidro-cartao flex w-full items-center gap-3 rounded-2xl px-4 text-left font-medium"
              >
                <Icone d={i.icone} />
                {i.rotulo}
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={() => {
                setMaisAberto(false)
                onSair()
              }}
              className="w-full rounded-2xl px-4 text-left font-medium text-slate-600"
            >
              Sair ({email})
            </button>
          </li>
        </ul>
      </BottomSheet>
    </>
  )
}

function LinkLateral({ item }: { item: Item }) {
  return (
    <li>
      <NavLink
        to={item.para}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-2xl px-3 font-medium ${
            isActive
              ? 'bg-white/80 text-marca-700 shadow-sm'
              : 'text-slate-700 hover:bg-white/50'
          }`
        }
      >
        <Icone d={item.icone} />
        {item.rotulo}
      </NavLink>
    </li>
  )
}
