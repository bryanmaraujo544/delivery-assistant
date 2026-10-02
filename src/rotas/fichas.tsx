import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { Comecar } from '../componentes/Comecar'
import { normalizar } from '../db/local'
import { db, type FichaLocal } from '../db/local'
import type { ContextoApp } from '../componentes/Guardiao'
import { esquecerContaNova } from '../db/sync'
import { aplicarTaxaDeCanal, calcularCustoFicha, calcularPreco } from '../dominio/custo'
import { formatarBRL } from '../dominio/dinheiro'

export function Fichas() {
  const navigate = useNavigate()
  const { sincronizado } = useOutletContext<ContextoApp>()

  /**
   * O onboarding NAO pode depender so de "banco vazio".
   *
   * Ele cria os proprios dados: ao semear os 57 insumos, a condicao que o
   * mantinha na tela vira falsa, o componente desmonta no meio do fluxo e leva
   * junto o estado da etapa de precos. Uma vez ativado, ele fica ate dizer que
   * terminou.
   */
  const [comecarAtivo, setComecarAtivo] = useState(false)
  const [busca, setBusca] = useState('')

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
      canalTaxaPercentual: 0,
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

  // busca sem acento, igual a de insumos: "cenoura" acha "Bolo de Cenoura"
  const buscaNorm = normalizar(busca)
  const fichasVisiveis = (dados?.fichas ?? []).filter((f) =>
    normalizar(f.nome).includes(buscaNorm),
  )

  const contaNova = !!dados && dados.fichas.length === 0 && dados.insumos.length === 0 && sincronizado
  useEffect(() => {
    if (contaNova) setComecarAtivo(true)
  }, [contaNova])

  const carregando = !dados
  const catalogo = dados ? montarCatalogo(dados.insumos, dados.fichas) : null
  const config = paraConfigDominio(dados?.config)

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col pb-40">
      <header className="vidro sticky top-3 z-10 mx-3 mt-3 rounded-3xl px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Fichas técnicas</h1>
        {/* so aparece quando ha o que buscar: campo de busca numa lista de 2
            itens e ruido que empurra o conteudo para baixo */}
        {(dados?.fichas.length ?? 0) > 4 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar ficha"
            aria-label="Buscar ficha"
            className="mt-3 h-12 w-full rounded-xl border border-slate-300 px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        )}
      </header>

      <div className="flex-1 px-4">
        {carregando && <p className="py-10 text-center text-slate-400">Carregando…</p>}

        {/* Conta nova (nada aqui NEM no servidor) -> onboarding.
            Dispositivo novo com dados no servidor -> espera o pull. */}
        {comecarAtivo && (
          <Comecar
            onPronto={(fichaId) => {
              esquecerContaNova()
              setComecarAtivo(false)
              if (fichaId) navigate(`/fichas/${fichaId}`)
              else criar()
            }}
          />
        )}

        {!comecarAtivo && dados && dados.fichas.length === 0 && (
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

        {busca && fichasVisiveis.length === 0 && (
          <p className="mt-8 text-center text-slate-500">Nenhuma ficha com “{busca}”.</p>
        )}

        <ul className="mt-4 space-y-2">
          {fichasVisiveis.map((f) => (
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

      {!comecarAtivo && dados && dados.fichas.length > 0 && (
        <div
          className="fixed right-0 bottom-[var(--nav-h)] left-[var(--nav-w)] mx-auto max-w-3xl px-4 pt-6 pb-2"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
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
    // a lista precisa mostrar o MESMO numero que a ficha mostrou. Ignorar o
    // canal aqui faria a usuaria ver um preco na ficha e outro na listagem.
    preco = aplicarTaxaDeCanal(
      calcularPreco(c, {
        base: ficha.markupBase,
        multiplicador: ficha.markupMultiplicador,
      }).precoUnitario,
      ficha.canalTaxaPercentual ?? 0,
    )
  } catch {
    // ficha incompleta ou com ciclo — a lista nao e o lugar de gritar erro
  }

  // O botao de duplicar e IRMAO do de abrir, nao aninhado: <button> dentro de
  // <button> e HTML invalido e o navegador decide sozinho qual recebe o toque.
  return (
    <li className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
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
      </button>
      <button
        onClick={onDuplicar}
        aria-label={`Duplicar ${ficha.nome}`}
        title="Duplicar"
        className="shrink-0 self-stretch px-4 text-slate-400 hover:bg-slate-100"
      >
        ⧉
      </button>
    </li>
  )
}
