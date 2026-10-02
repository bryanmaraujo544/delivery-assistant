import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { BottomSheet } from '../componentes/BottomSheet'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { mostrarAviso } from '../componentes/Snackbar'
import { custoDoProduto, registrarContagem } from '../db/caixa'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { db, normalizar, type FichaLocal, type ProdutoLocal } from '../db/local'
import { pedirSync } from '../db/sync'
import {
  aplicarTaxaDeCanal,
  calcularCustoFicha,
  calcularPreco,
  type Catalogo,
  type ConfigProducao,
} from '../dominio/custo'
import { formatarBRL } from '../dominio/dinheiro'
import { estoqueAtual } from '../dominio/estoque'

const SEM_CATEGORIA = 'Outros'

/** Preco que a ficha tecnica sugere, ja com a taxa do canal. null se a ficha nao fecha. */
function precoSugerido(ficha: FichaLocal, catalogo: Catalogo, config: ConfigProducao): number | null {
  try {
    const custo = calcularCustoFicha(ficha.id, catalogo, config)
    return aplicarTaxaDeCanal(
      calcularPreco(custo, { base: ficha.markupBase, multiplicador: ficha.markupMultiplicador })
        .precoUnitario,
      ficha.canalTaxaPercentual ?? 0,
    )
  } catch {
    return null
  }
}

interface Rascunho {
  id: string | null
  nome: string
  precoCentavos: number
  categoria: string
  fichaId: string | null
  /** null = estoque nao controlado (encomenda, item feito na hora) */
  estoque: number | null
}

const RASCUNHO_VAZIO: Rascunho = {
  id: null,
  nome: '',
  precoCentavos: 0,
  categoria: '',
  fichaId: null,
  estoque: null,
}

export function Produtos() {
  const [busca, setBusca] = useState('')
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)

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

  const categorias = [...new Set((dados?.produtos ?? []).map((p) => p.categoria).filter(Boolean))] as string[]

  // fichas vendaveis que ainda nao viraram produto: base (massa, recheio) nao
  // se vende sozinha
  const fichasSemProduto = (dados?.fichas ?? []).filter(
    (f) => !f.ehBase && !dados!.produtos.some((p) => p.fichaId === f.id),
  )

  async function salvar(r: Rascunho) {
    const nome = r.nome.trim()
    if (!nome) return
    const id = r.id ?? crypto.randomUUID()
    await db.produtos.put({
      id,
      nome,
      nomeNormalizado: normalizar(nome),
      categoria: r.categoria.trim() || undefined,
      precoCentavos: r.precoCentavos,
      fichaId: r.fichaId,
      atualizadoEm: Date.now(),
      excluidoEm: null,
    })
    // So grava contagem quando o numero mudou de verdade: salvar o produto
    // para trocar o preco nao pode "recontar" o estoque e apagar as vendas
    // feitas desde a ultima contagem.
    const atual = dados?.estoque.get(id) ?? null
    if (r.estoque !== atual) await registrarContagem(id, r.estoque)
    pedirSync()
    setRascunho(null)
  }

  async function excluir(id: string) {
    const p = await db.produtos.get(id)
    if (!p) return
    await db.produtos.put({ ...p, excluidoEm: Date.now(), atualizadoEm: Date.now() })
    pedirSync()
    setRascunho(null)
    // vendas antigas guardam nome e preco proprios, entao excluir nao as afeta
    mostrarAviso(`“${p.nome}” excluído`, async () => {
      await db.produtos.put({ ...p, excluidoEm: null, atualizadoEm: Date.now() })
      pedirSync()
    })
  }

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
                      onClick={() =>
                        setRascunho({
                          id: p.id,
                          nome: p.nome,
                          precoCentavos: p.precoCentavos,
                          categoria: p.categoria ?? '',
                          fichaId: p.fichaId ?? null,
                          estoque: dados!.estoque.get(p.id) ?? null,
                        })
                      }
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
            onClick={() => setRascunho({ ...RASCUNHO_VAZIO, nome: busca })}
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
          onClick={() => setRascunho(RASCUNHO_VAZIO)}
          className="h-14 w-full rounded-2xl bg-marca-600 font-semibold text-white shadow-lg active:bg-marca-700"
        >
          Novo produto
        </button>
      </div>

      {rascunho && catalogo && (
        <FormProduto
          inicial={rascunho}
          categorias={categorias}
          fichas={dados!.fichas.filter((f) => !f.ehBase)}
          catalogo={catalogo}
          config={config}
          onFechar={() => setRascunho(null)}
          onSalvar={salvar}
          onExcluir={excluir}
        />
      )}
    </main>
  )
}

/** Nada quando o estoque nao e controlado: ausencia de numero nao e zero. */
export function SeloEstoque({ quantidade }: { quantidade: number | undefined }) {
  if (quantidade === undefined) return null
  const cor = quantidade <= 0 ? 'text-red-700' : quantidade <= 3 ? 'text-amber-700' : 'text-slate-500'
  return (
    <span className={`block text-xs font-medium ${cor}`}>
      {quantidade <= 0 ? 'Sem estoque' : `${quantidade} em estoque`}
      {quantidade < 0 && ` (${quantidade})`}
    </span>
  )
}

/**
 * So mostra margem quando ha custo. Sem ficha nao existe custo conhecido, e
 * "margem 100%" seria mentira.
 */
function Margem({ precoCentavos, custoCentavos }: { precoCentavos: number; custoCentavos: number | null }) {
  if (custoCentavos == null) return <span className="block text-xs text-slate-400">sem ficha</span>
  if (precoCentavos <= 0) return <span className="block text-xs text-amber-700">sem preço</span>
  const margem = ((precoCentavos - custoCentavos) / precoCentavos) * 100
  return (
    <span className={`block text-xs ${margem < 0 ? 'text-red-700' : 'text-slate-500'}`}>
      custo {formatarBRL(custoCentavos)} · margem{' '}
      {margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

function FormProduto({
  inicial,
  categorias,
  fichas,
  catalogo,
  config,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  inicial: Rascunho
  categorias: string[]
  fichas: FichaLocal[]
  catalogo: Catalogo
  config: ConfigProducao
  onFechar: () => void
  onSalvar: (r: Rascunho) => void
  onExcluir: (id: string) => void
}) {
  const [r, setR] = useState(inicial)
  const ficha = fichas.find((f) => f.id === r.fichaId)
  const custo = custoDoProduto(r, catalogo, config)
  const sugerido = ficha ? precoSugerido(ficha, catalogo, config) : null

  function escolherFicha(id: string) {
    const f = fichas.find((x) => x.id === id)
    setR((a) => ({
      ...a,
      fichaId: f?.id ?? null,
      // escolher a ficha num produto em branco preenche o resto: zero digitacao
      nome: a.nome || f?.nome || '',
      categoria: a.categoria || f?.categoria || '',
      precoCentavos:
        a.precoCentavos || (f ? (precoSugerido(f, catalogo, config) ?? 0) : 0),
    }))
  }

  return (
    <BottomSheet
      aberto
      titulo={r.id ? 'Editar produto' : 'Novo produto'}
      onFechar={onFechar}
      rodape={
        <div className="flex gap-2">
          {r.id && (
            <button
              onClick={() => onExcluir(r.id!)}
              className="h-14 rounded-2xl border border-slate-300 px-5 font-medium text-red-700"
            >
              Excluir
            </button>
          )}
          <button
            onClick={() => onSalvar(r)}
            disabled={!r.nome.trim()}
            className="h-14 flex-1 rounded-2xl bg-marca-600 font-semibold text-white disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="p-nome" className="mb-1.5 block text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="p-nome"
            autoFocus={!r.id}
            value={r.nome}
            onChange={(e) => setR({ ...r, nome: e.target.value })}
            placeholder="Ex.: Bolo no pote de ninho"
            className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="p-preco" className="mb-1.5 block text-sm font-medium text-slate-700">
            Preço de venda
          </label>
          <CampoDinheiro
            id="p-preco"
            selecionarAoFocar
            valorCentavos={r.precoCentavos}
            onChange={(precoCentavos) => setR({ ...r, precoCentavos })}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
            <Margem precoCentavos={r.precoCentavos} custoCentavos={custo} />
            {sugerido != null && sugerido !== r.precoCentavos && (
              <button
                onClick={() => setR({ ...r, precoCentavos: sugerido })}
                className="shrink-0 rounded-lg px-2 font-medium text-marca-700 underline"
              >
                Usar o da ficha: {formatarBRL(sugerido)}
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="p-cat" className="mb-1.5 block text-sm font-medium text-slate-700">
            Categoria
          </label>
          {categorias.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => setR({ ...r, categoria: c })}
                  className={`rounded-full border px-4 text-sm font-medium ${
                    r.categoria === c
                      ? 'border-marca-600 bg-marca-50 text-marca-700'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <input
            id="p-cat"
            value={r.categoria}
            onChange={(e) => setR({ ...r, categoria: e.target.value })}
            placeholder="Ex.: Bolos, Doces, Bebidas"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="p-ficha" className="mb-1.5 block text-sm font-medium text-slate-700">
            Ficha técnica
          </label>
          <select
            id="p-ficha"
            value={r.fichaId ?? ''}
            onChange={(e) => escolherFicha(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3"
          >
            <option value="">Sem ficha (produto de revenda)</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            Com a ficha, o sistema sabe o custo e mostra o lucro de cada venda.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-3 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={r.estoque !== null}
              onChange={(e) => setR({ ...r, estoque: e.target.checked ? Math.max(0, inicial.estoque ?? 0) : null })}
              className="h-6 w-6 accent-marca-600"
            />
            Controlar estoque
          </label>
          {r.estoque === null ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Ligue para produtos de pronta entrega. Cada venda baixa o estoque sozinha.
            </p>
          ) : (
            <div className="mt-3">
              <label htmlFor="p-estoque" className="mb-1.5 block text-sm text-slate-700">
                Quantos tem agora?
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setR({ ...r, estoque: Math.max(0, r.estoque! - 1) })}
                  aria-label="Um a menos"
                  className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                >
                  −
                </button>
                <input
                  id="p-estoque"
                  inputMode="numeric"
                  value={r.estoque}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setR({ ...r, estoque: Math.min(Number(e.target.value.replace(/\D/g, '') || 0), 99_999) })
                  }
                  className="h-14 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-center
                             text-xl font-semibold tabular-nums focus:border-marca-600 focus:ring-2
                             focus:ring-marca-500/30 focus:outline-none"
                />
                <button
                  onClick={() => setR({ ...r, estoque: r.estoque! + 1 })}
                  aria-label="Um a mais"
                  className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                >
                  +
                </button>
              </div>
              {/* repor a fornada sem teclado */}
              <div className="mt-2 flex gap-2">
                {[5, 10, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setR({ ...r, estoque: r.estoque! + n })}
                    className="flex-1 rounded-full border border-slate-300 bg-white font-semibold text-slate-700"
                  >
                    + {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
