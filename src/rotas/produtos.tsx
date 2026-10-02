import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { EditorProduto, Margem, SeloEstoque, precoSugerido } from '../componentes/EditorProduto'
import { mostrarAviso } from '../componentes/Snackbar'
import { custoDoProduto } from '../db/caixa'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { db, normalizar, type ProdutoLocal } from '../db/local'
import { pedirSync } from '../db/sync'
import { formatarBRL } from '../dominio/dinheiro'
import { estoqueAtual } from '../dominio/estoque'

const SEM_CATEGORIA = 'Outros'

export function Produtos() {
  const [busca, setBusca] = useState('')
  /** undefined = fechado · null = produto novo · string = editando aquele id */
  const [editando, setEditando] = useState<string | null | undefined>(undefined)
  const [nomeNovo, setNomeNovo] = useState('')

  const dados = useLiveQuery(async () => {
    const [produtos, fichas, insumos, config, contagens, vendas] = await Promise.all([
      db.produtos.filter((p) => !p.excluidoEm).toArray(),
      db.fichas.filter((f) => !f.excluidoEm).toArray(),
      db.insumos.filter((i) => !i.excluidoEm).toArray(),
      db.config.get('default'),
      db.estoqueContagens.toArray(),
      db.vendas.toArray(),
    ])
    return { produtos, fichas, insumos, config, estoque: estoqueAtual(contagens, vendas) }
  }, [])

  const catalogo = useMemo(
    () => (dados ? montarCatalogo(dados.insumos, dados.fichas) : null),
    [dados],
  )
  const config = paraConfigDominio(dados?.config)

  const buscaNorm = normalizar(busca)
  const visiveis = (dados?.produtos ?? []).filter((p) => p.nomeNormalizado.includes(buscaNorm))
  const agrupados = useMemo(() => {
    const grupos = new Map<string, ProdutoLocal[]>()
    for (const p of visiveis) {
      const c = p.categoria || SEM_CATEGORIA
      grupos.set(c, [...(grupos.get(c) ?? []), p])
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([c, ps]) => [c, ps.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))] as const)
  }, [visiveis])

  // fichas vendaveis que ainda nao viraram produto: base (massa, recheio) nao
  // se vende sozinha
  const fichasSemProduto = (dados?.fichas ?? []).filter(
    (f) => !f.ehBase && !dados!.produtos.some((p) => p.fichaId === f.id),
  )

  /** Um toque para quem ja tem as fichas: cada ficha vendavel vira produto com o preco sugerido. */
  async function importarDasFichas() {
    if (!catalogo) return
    const agora = Date.now()
    const novos = fichasSemProduto.map<ProdutoLocal>((f) => ({
      id: crypto.randomUUID(),
      nome: f.nome,
      nomeNormalizado: normalizar(f.nome),
      categoria: f.categoria,
      precoCentavos: precoSugerido(f, catalogo, config) ?? 0,
      fichaId: f.id,
      atualizadoEm: agora,
      excluidoEm: null,
    }))
    await db.produtos.bulkPut(novos)
    pedirSync()
    mostrarAviso(
      `${novos.length} ${novos.length === 1 ? 'produto criado' : 'produtos criados'} a partir das fichas. Confira os preços.`,
    )
  }

  const vazio = !!dados && dados.produtos.length === 0

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="vidro sticky top-3 z-10 mx-3 mt-3 rounded-3xl px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Produtos</h1>
        {(dados?.produtos.length ?? 0) > 4 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto"
            aria-label="Buscar produto"
            className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-white/80 px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        )}
      </header>

      <div className="flex-1 px-4 pb-48">
        {!dados && <p className="py-10 text-center text-slate-400">Carregando…</p>}

        {vazio && (
          <div className="vidro-cartao mt-10 rounded-3xl p-6 text-center">
            <h2 className="text-lg font-semibold">Nenhum produto ainda</h2>
            <p className="mt-2 text-sm text-slate-600">
              Produto é o que você vende no balcão, com o preço que a cliente paga.
            </p>
          </div>
        )}

        {dados && fichasSemProduto.length > 0 && !busca && (
          <button
            onClick={importarDasFichas}
            className="mt-5 w-full rounded-2xl border-2 border-dashed border-marca-500 bg-white/70
                       px-4 py-3 text-left font-medium text-marca-700"
          >
            + Criar {fichasSemProduto.length === 1 ? 'produto' : `${fichasSemProduto.length} produtos`}{' '}
            a partir das fichas técnicas
            <span className="block text-sm font-normal text-slate-600">
              Já vêm com o preço que a ficha sugere.
            </span>
          </button>
        )}

        {agrupados.map(([categoria, itens]) => (
          <section key={categoria} className="mt-5">
            <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              {categoria}
            </h2>
            <ul className="vidro-cartao divide-y divide-white/70 overflow-hidden rounded-2xl">
              {itens.map((p) => {
                const custo = catalogo ? custoDoProduto(p, catalogo, config) : null
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setEditando(p.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nome}</span>
                        <SeloEstoque quantidade={dados!.estoque.get(p.id)} />
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">
                          {formatarBRL(p.precoCentavos)}
                        </span>
                        <Margem precoCentavos={p.precoCentavos} custoCentavos={custo} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {busca && visiveis.length === 0 && (
          <button
            onClick={() => {
              setNomeNovo(busca)
              setEditando(null)
            }}
            className="mt-5 w-full rounded-2xl border-2 border-dashed border-marca-500 bg-white/70
                       px-4 py-4 text-left font-medium text-marca-700"
          >
            + Criar “{busca}”
          </button>
        )}
      </div>

      <div
        className="fixed right-0 bottom-[var(--nav-h)] left-[var(--nav-w)] mx-auto max-w-3xl px-4 pt-6 pb-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => {
            setNomeNovo('')
            setEditando(null)
          }}
          className="h-14 w-full rounded-2xl bg-marca-600 font-semibold text-white shadow-lg active:bg-marca-700"
        >
          Novo produto
        </button>
      </div>

      {editando !== undefined && (
        <EditorProduto produtoId={editando} nomeInicial={nomeNovo} onFechar={() => setEditando(undefined)} />
      )}
    </main>
  )
}
