import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { custoDoProduto, registrarContagem } from '../db/caixa'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { db, normalizar, type FichaLocal } from '../db/local'
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
import { BottomSheet } from './BottomSheet'
import { CampoDinheiro } from './CampoDinheiro'
import { mostrarAviso } from './Snackbar'

/**
 * Criar e editar produto.
 *
 * E um componente que carrega os proprios dados, e nao um formulario
 * alimentado pela tela de Produtos, porque abre de dois lugares: da lista de
 * produtos e direto do balcao (repor o estoque de um bolo que acabou sem sair
 * da tela de venda).
 */

/** Preco que a ficha tecnica sugere, ja com a taxa do canal. null se a ficha nao fecha. */
export function precoSugerido(ficha: FichaLocal, catalogo: Catalogo, config: ConfigProducao): number | null {
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
  /** custo por unidade informado a mao; so vale para produto sem ficha */
  custoCentavos: number
}

const RASCUNHO_VAZIO: Rascunho = {
  id: null,
  nome: '',
  precoCentavos: 0,
  categoria: '',
  fichaId: null,
  estoque: null,
  custoCentavos: 0,
}

export function EditorProduto({
  produtoId,
  nomeInicial = '',
  onFechar,
}: {
  /** null = produto novo */
  produtoId: string | null
  nomeInicial?: string
  onFechar: () => void
}) {
  const dados = useLiveQuery(async () => {
    const [produtos, fichas, insumos, config, contagens, vendas] = await Promise.all([
      db.produtos.filter((p) => !p.excluidoEm).toArray(),
      db.fichas.filter((f) => !f.excluidoEm).toArray(),
      db.insumos.filter((i) => !i.excluidoEm).toArray(),
      db.config.get('default'),
      db.estoqueContagens.toArray(),
      db.vendas.toArray(),
    ])
    return {
      produtos,
      fichas,
      catalogo: montarCatalogo(insumos, fichas),
      config: paraConfigDominio(config),
      estoque: estoqueAtual(contagens, vendas),
    }
  }, [])

  if (!dados) return null

  const produto = dados.produtos.find((p) => p.id === produtoId)
  const inicial: Rascunho = produto
    ? {
        id: produto.id,
        nome: produto.nome,
        precoCentavos: produto.precoCentavos,
        categoria: produto.categoria ?? '',
        fichaId: produto.fichaId ?? null,
        estoque: dados.estoque.get(produto.id) ?? null,
        custoCentavos: produto.custoCentavos ?? 0,
      }
    : { ...RASCUNHO_VAZIO, nome: nomeInicial }

  async function salvar(r: Rascunho) {
    const nome = r.nome.trim()
    if (!nome) return
    const id = r.id ?? crypto.randomUUID()
    await db.produtos.put({
      // preserva o que este formulario nao edita (a posicao na tela de venda)
      ...produto,
      id,
      nome,
      nomeNormalizado: normalizar(nome),
      categoria: r.categoria.trim() || undefined,
      precoCentavos: r.precoCentavos,
      fichaId: r.fichaId,
      // zero no campo = nao informado. Custo zero de verdade nao existe, e
      // gravar 0 faria o produto parecer ter 100% de lucro.
      custoCentavos: !r.fichaId && r.custoCentavos > 0 ? r.custoCentavos : null,
      atualizadoEm: Date.now(),
      excluidoEm: null,
    })
    // So grava contagem quando o numero mudou de verdade: salvar o produto
    // para trocar o preco nao pode "recontar" o estoque e apagar as vendas
    // feitas desde a ultima contagem.
    if (r.estoque !== inicial.estoque) await registrarContagem(id, r.estoque)
    pedirSync()
    onFechar()
  }

  async function excluir(id: string) {
    const p = await db.produtos.get(id)
    if (!p) return
    await db.produtos.put({ ...p, excluidoEm: Date.now(), atualizadoEm: Date.now() })
    pedirSync()
    onFechar()
    // vendas antigas guardam nome e preco proprios, entao excluir nao as afeta
    mostrarAviso(`“${p.nome}” excluído`, async () => {
      await db.produtos.put({ ...p, excluidoEm: null, atualizadoEm: Date.now() })
      pedirSync()
    })
  }

  return (
    <FormProduto
      inicial={inicial}
      categorias={[...new Set(dados.produtos.map((p) => p.categoria).filter(Boolean))] as string[]}
      // Todas as fichas, inclusive as marcadas como base. Esconder as base
      // deixava sem opcao quem marca o proprio bolo como base (ele tambem e
      // usado dentro de outras receitas) — e o seletor aparecia vazio sem
      // explicar por que. As vendaveis vem primeiro.
      fichas={[...dados.fichas].sort(
        (a, b) => Number(a.ehBase) - Number(b.ehBase) || a.nome.localeCompare(b.nome, 'pt-BR'),
      )}
      catalogo={dados.catalogo}
      config={dados.config}
      onFechar={onFechar}
      onSalvar={salvar}
      onExcluir={excluir}
    />
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
export function Margem({ precoCentavos, custoCentavos }: { precoCentavos: number; custoCentavos: number | null }) {
  if (custoCentavos == null) return <span className="block text-xs text-slate-400">sem custo</span>
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
  const custo = custoDoProduto({ fichaId: r.fichaId, custoCentavos: r.custoCentavos || null }, catalogo, config)
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
                {f.ehBase ? ' (base)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            Com a ficha, o sistema sabe o custo e mostra o lucro de cada venda.
          </p>
        </div>

        {/* Revenda nao tem receita, mas tem custo: sem ele o produto entra no
            resultado do mes como se fosse lucro puro. */}
        {!r.fichaId && (
          <div>
            <label htmlFor="p-custo" className="mb-1.5 block text-sm font-medium text-slate-700">
              Quanto custa cada unidade para você?
            </label>
            <CampoDinheiro
              id="p-custo"
              selecionarAoFocar
              valorCentavos={r.custoCentavos}
              onChange={(custoCentavos) => setR({ ...r, custoCentavos })}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Para produto comprado pronto, como refrigerante. Deixe em R$ 0,00 se não souber.
            </p>
          </div>
        )}

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
                {[4, 8, 12].map((n) => (
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
