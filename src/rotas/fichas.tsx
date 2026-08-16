import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useOutletContext } from 'react-router'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { Comecar } from '../componentes/Comecar'
import { db, type FichaLocal } from '../db/local'
import type { ContextoApp } from '../componentes/Guardiao'
import { calcularCustoFicha, calcularPreco } from '../dominio/custo'
import { formatarBRL } from '../dominio/dinheiro'

export function Fichas() {
  const navigate = useNavigate()
  const { sincronizado } = useOutletContext<ContextoApp>()

  const dados = useLiveQuery(async () => {
    const [insumos, fichas, config] = await Promise.all([
      db.insumos.filter((i) => !i.excluidoEm).toArray(),
      db.fichas.filter((f) => !f.excluidoEm).toArray(),
      db.config.get('default'),
    ])
    return { insumos, fichas, config }
  }, [])

  async function criar() {
    const nova: FichaLocal = {
      id: crypto.randomUUID(),
      nome: 'Nova ficha',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      ehBase: false,
      itens: [],
      perdas: [],
      markupBase: 'materiais',
      markupMultiplicador: 2.5,
      atualizadoEm: Date.now(),
      excluidoEm: null,
    }
    await db.fichas.put(nova)
    navigate(`/fichas/${nova.id}`)
  }

  /** Duplicar e caminho primario: o trabalho de confeitaria e variacao sobre base. */
  async function duplicar(f: FichaLocal, e: React.MouseEvent) {
    e.stopPropagation()
    const copia: FichaLocal = {
      ...f,
      id: crypto.randomUUID(),
      nome: `${f.nome} (cópia)`,
      atualizadoEm: Date.now(),
    }
    await db.fichas.put(copia)
    navigate(`/fichas/${copia.id}`)
  }

  const carregando = !dados
  const catalogo = dados ? montarCatalogo(dados.insumos, dados.fichas) : null
  const config = paraConfigDominio(dados?.config)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50 pb-32">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Fichas técnicas</h1>
      </header>

      <div className="flex-1 px-4">
        {carregando && <p className="py-10 text-center text-slate-400">Carregando…</p>}

        {/* Conta nova (nada aqui NEM no servidor) -> onboarding.
            Dispositivo novo com dados no servidor -> espera o pull. */}
        {dados && dados.fichas.length === 0 && dados.insumos.length === 0 && sincronizado && (
          <Comecar onPronto={(fichaId) => (fichaId ? navigate(`/fichas/${fichaId}`) : criar())} />
        )}

        {dados && dados.fichas.length === 0 && !(dados.insumos.length === 0 && sincronizado) && (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <h2 className="text-lg font-semibold">Nenhuma ficha ainda</h2>
            <p className="mt-2 text-sm text-slate-600">
              A ficha técnica é onde você monta o produto e descobre quanto ele custa.
            </p>
            <button
              onClick={criar}
              className="mt-5 h-12 w-full rounded-xl bg-marca-600 font-semibold text-white"
            >
              Criar primeira ficha
            </button>
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {dados?.fichas.map((f) => (
            <LinhaFicha
              key={f.id}
              ficha={f}
              catalogo={catalogo!}
              config={config}
              onAbrir={() => navigate(`/fichas/${f.id}`)}
              onDuplicar={(e) => duplicar(f, e)}
            />
          ))}
        </ul>
      </div>

      {dados && dados.fichas.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-12 mx-auto max-w-md px-4 pt-6 pb-2"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={criar}
            className="h-14 w-full rounded-xl bg-marca-600 font-semibold text-white shadow-lg"
          >
            Nova ficha
          </button>
        </div>
      )}

    </main>
  )
}

function LinhaFicha({
  ficha,
  catalogo,
  config,
  onAbrir,
  onDuplicar,
}: {
  ficha: FichaLocal
  catalogo: ReturnType<typeof montarCatalogo>
  config: ReturnType<typeof paraConfigDominio>
  onAbrir: () => void
  onDuplicar: (e: React.MouseEvent) => void
}) {
  let custoUnit: number | null = null
  let preco: number | null = null
  try {
    const c = calcularCustoFicha(ficha.id, catalogo, config)
    custoUnit = c.custoUnitario
    preco = calcularPreco(c, {
      base: ficha.markupBase,
      multiplicador: ficha.markupMultiplicador,
    }).precoUnitario
  } catch {
    // ficha incompleta ou com ciclo — a lista nao e o lugar de gritar erro
  }

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={onAbrir} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">
            {ficha.nome}
            {ficha.ehBase && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                base
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">
            {ficha.itens.length} {ficha.itens.length === 1 ? 'item' : 'itens'} · rende{' '}
            {ficha.rendimentoReal ?? ficha.rendimentoTeorico} {ficha.unidadeRendimento}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {preco !== null ? (
            <>
              <p className="font-semibold tabular-nums text-marca-700">{formatarBRL(preco)}</p>
              <p className="text-xs text-slate-500">custo {formatarBRL(custoUnit!)}</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">sem itens</p>
          )}
        </div>
        <button
          onClick={onDuplicar}
          aria-label={`Duplicar ${ficha.nome}`}
          title="Duplicar"
          className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-slate-100"
        >
          ⧉
        </button>
      </button>
    </li>
  )
}
