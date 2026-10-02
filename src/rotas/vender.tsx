import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AbrirCaixa } from '../componentes/AbrirCaixa'
import { BottomSheet } from '../componentes/BottomSheet'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { cancelarVenda, custoDoProduto, registrarVenda } from '../db/caixa'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { db, normalizar, type ProdutoLocal } from '../db/local'
import { ehHoje, formatarDia } from '../dominio/datas'
import { formatarBRL } from '../dominio/dinheiro'
import {
  FORMAS,
  ROTULO_FORMA,
  subtotalItens,
  sugestoesDeRecebido,
  totalPago,
  totalVenda,
  type FormaPagamento,
  type ItemVenda,
  type Pagamento,
  type Venda,
} from '../dominio/venda'

/**
 * Tela de venda. Desenhada para quem nao tem costume com tecnologia:
 *
 *   tocar nos produtos  ->  Cobrar  ->  tocar na forma de pagamento  ->  pronto
 *
 * Nada no caminho principal pede teclado. Cliente, desconto e pagamento
 * dividido existem, mas ficam fora do caminho — quem nao precisa nunca os ve
 * como obrigacao.
 */

/** produtoId -> quantidade */
type Carrinho = Record<string, number>

const CHAVE_CARRINHO = 'precifica.carrinho'

/**
 * O pedido em andamento sobrevive a trocar de tela (olhar o caixa no meio de
 * um atendimento) e a um recarregamento acidental.
 */
function usarCarrinho() {
  const [carrinho, setCarrinho] = useState<Carrinho>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_CARRINHO) ?? '{}') as Carrinho
    } catch {
      return {}
    }
  })
  useEffect(() => {
    sessionStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho))
  }, [carrinho])
  return [carrinho, setCarrinho] as const
}

export function Vender() {
  const [carrinho, setCarrinho] = usarCarrinho()
  const [desconto, setDesconto] = useState(0)
  const [categoria, setCategoria] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [pedidoAberto, setPedidoAberto] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [concluida, setConcluida] = useState<{ venda: Venda; carrinho: Carrinho } | null>(null)

  const dados = useLiveQuery(async () => {
    const [produtos, fichas, insumos, config, sessoes] = await Promise.all([
      db.produtos.filter((p) => !p.excluidoEm).toArray(),
      db.fichas.filter((f) => !f.excluidoEm).toArray(),
      db.insumos.filter((i) => !i.excluidoEm).toArray(),
      db.config.get('default'),
      db.caixaSessoes.filter((s) => !s.fechadaEm).toArray(),
    ])
    return {
      produtos: produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      catalogo: montarCatalogo(insumos, fichas),
      config: paraConfigDominio(config),
      sessao: sessoes.sort((a, b) => b.abertaEm - a.abertaEm)[0],
    }
  }, [])

  const itens = useMemo<ItemVenda[]>(() => {
    if (!dados) return []
    return dados.produtos
      .filter((p) => (carrinho[p.id] ?? 0) > 0)
      .map((p) => ({
        produtoId: p.id,
        nome: p.nome,
        precoUnitarioCentavos: p.precoCentavos,
        quantidade: carrinho[p.id]!,
        custoUnitarioCentavos: custoDoProduto(p, dados.catalogo, dados.config),
      }))
  }, [dados, carrinho])

  if (!dados) return <p className="p-10 text-center text-slate-400">Carregando…</p>

  const subtotal = subtotalItens(itens)
  // um desconto antigo maior que o pedido atual nao pode travar a tela
  const descontoValido = Math.min(desconto, subtotal)
  const total = totalVenda(itens, descontoValido)
  const quantidadeItens = itens.reduce((s, i) => s + i.quantidade, 0)

  const alterar = (id: string, delta: number) =>
    setCarrinho((c) => {
      const q = Math.max(0, (c[id] ?? 0) + delta)
      const { [id]: _, ...resto } = c
      return q > 0 ? { ...resto, [id]: q } : resto
    })

  function limpar() {
    setCarrinho({})
    setDesconto(0)
  }

  async function concluir(pagamentos: Pagamento[], trocoCentavos: number) {
    const venda: Venda = {
      id: crypto.randomUUID(),
      sessaoId: dados!.sessao!.id,
      itens,
      descontoCentavos: descontoValido,
      totalCentavos: total,
      pagamentos,
      trocoCentavos,
      criadaEm: Date.now(),
      canceladaEm: null,
      motivoCancelamento: null,
    }
    await registrarVenda(venda)
    setConcluida({ venda, carrinho })
    setCobrando(false)
    setPedidoAberto(false)
    limpar()
  }

  async function desfazer() {
    if (!concluida) return
    await cancelarVenda(concluida.venda.id, 'Desfeita logo após a venda')
    setCarrinho(concluida.carrinho)
    setDesconto(concluida.venda.descontoCentavos)
    setConcluida(null)
  }

  if (!dados.sessao) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-4 pb-32">
        <AbrirCaixa />
      </main>
    )
  }

  const categorias = [...new Set(dados.produtos.map((p) => p.categoria).filter(Boolean))].sort() as string[]
  const buscaNorm = normalizar(busca)
  const visiveis = dados.produtos.filter(
    (p) => (!categoria || p.categoria === categoria) && p.nomeNormalizado.includes(buscaNorm),
  )

  const pedido = (
    <Pedido
      itens={itens}
      subtotal={subtotal}
      desconto={descontoValido}
      total={total}
      onAlterar={alterar}
      onDesconto={setDesconto}
      onLimpar={limpar}
      onCobrar={() => setCobrando(true)}
    />
  )

  return (
    <main className="min-h-dvh lg:flex lg:h-dvh lg:gap-4 lg:p-3">
      <section className="flex min-w-0 flex-1 flex-col pb-52 lg:overflow-y-auto lg:pb-4">
        <header className="vidro sticky top-3 z-10 mx-3 mt-3 rounded-3xl px-4 pt-4 pb-3 lg:mx-0 lg:mt-0 lg:top-0">
          <h1 className="text-2xl font-bold text-slate-900">Vender</h1>
          {!ehHoje(dados.sessao.abertaEm) && (
            <p className="mt-1 text-sm text-amber-800">
              O caixa está aberto desde {formatarDia(dados.sessao.abertaEm)}.{' '}
              <Link to="/caixa" className="font-medium underline">
                Fechar e abrir o de hoje
              </Link>
            </p>
          )}
          {dados.produtos.length > 12 && (
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto"
              aria-label="Buscar produto"
              className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-white/80 px-4
                         focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
            />
          )}
          {categorias.length > 1 && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {[null, ...categorias].map((c) => (
                <button
                  key={c ?? 'todos'}
                  onClick={() => setCategoria(c)}
                  className={`shrink-0 rounded-full px-5 font-medium ${
                    categoria === c ? 'bg-marca-600 text-white' : 'bg-white/80 text-slate-700'
                  }`}
                >
                  {c ?? 'Todos'}
                </button>
              ))}
            </div>
          )}
        </header>

        {dados.produtos.length === 0 ? (
          <div className="vidro-cartao mx-4 mt-10 rounded-3xl p-6 text-center">
            <h2 className="text-lg font-semibold">Cadastre o que você vende</h2>
            <p className="mt-2 text-sm text-slate-600">
              Os produtos aparecem aqui como botões. É só tocar para vender.
            </p>
            <Link
              to="/produtos"
              className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-marca-600 font-semibold text-white"
            >
              Cadastrar produtos
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-3 xl:grid-cols-4">
            {visiveis.map((p) => (
              <BotaoProduto key={p.id} produto={p} quantidade={carrinho[p.id] ?? 0} onToque={() => alterar(p.id, 1)} />
            ))}
          </ul>
        )}
      </section>

      {/* desktop: o pedido fica sempre a vista, ao lado */}
      <aside className="vidro hidden w-[24rem] shrink-0 flex-col rounded-3xl lg:flex">{pedido}</aside>

      {/* celular: barra com o total; o pedido abre por cima */}
      {quantidadeItens > 0 && (
        <div
          className="fixed inset-x-3 z-20 lg:hidden"
          style={{ bottom: 'calc(var(--nav-h) + 0.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setPedidoAberto(true)}
            className="flex h-16 w-full items-center justify-between rounded-2xl bg-marca-600 px-5 text-white shadow-xl"
          >
            <span className="font-medium">
              {quantidadeItens} {quantidadeItens === 1 ? 'item' : 'itens'} · ver pedido
            </span>
            <span className="text-xl font-bold tabular-nums">{formatarBRL(total)}</span>
          </button>
        </div>
      )}
      <div className="lg:hidden">
        <BottomSheet aberto={pedidoAberto && !cobrando} titulo="Pedido" onFechar={() => setPedidoAberto(false)}>
          <div className="-mx-4 -my-4 flex flex-col">{pedido}</div>
        </BottomSheet>
      </div>

      {cobrando && <Cobranca total={total} onFechar={() => setCobrando(false)} onConcluir={concluir} />}
      {concluida && (
        <Concluida venda={concluida.venda} onNova={() => setConcluida(null)} onDesfazer={desfazer} />
      )}
    </main>
  )
}

function BotaoProduto({
  produto,
  quantidade,
  onToque,
}: {
  produto: ProdutoLocal
  quantidade: number
  onToque: () => void
}) {
  return (
    <li>
      <button
        onClick={onToque}
        className={`vidro-cartao relative flex h-28 w-full flex-col justify-between rounded-2xl p-3 text-left
                    transition-transform active:scale-95 ${quantidade > 0 ? 'ring-2 ring-marca-500' : ''}`}
      >
        <span className="line-clamp-2 leading-tight font-semibold">{produto.nome}</span>
        <span className="text-lg font-bold tabular-nums text-marca-700">
          {formatarBRL(produto.precoCentavos)}
        </span>
        {quantidade > 0 && (
          <span
            className="absolute -top-2 -right-2 flex h-8 min-w-8 items-center justify-center rounded-full
                       bg-marca-600 px-2 font-bold text-white shadow"
          >
            {quantidade}
          </span>
        )}
      </button>
    </li>
  )
}

function Pedido({
  itens,
  subtotal,
  desconto,
  total,
  onAlterar,
  onDesconto,
  onLimpar,
  onCobrar,
}: {
  itens: ItemVenda[]
  subtotal: number
  desconto: number
  total: number
  onAlterar: (id: string, delta: number) => void
  onDesconto: (centavos: number) => void
  onLimpar: () => void
  onCobrar: () => void
}) {
  const [comDesconto, setComDesconto] = useState(desconto > 0)

  return (
    <>
      <div className="hidden items-center justify-between px-5 pt-5 pb-2 lg:flex">
        <h2 className="text-xl font-bold">Pedido</h2>
        {itens.length > 0 && (
          <button onClick={onLimpar} className="rounded-lg px-2 text-sm font-medium text-slate-600 underline">
            Limpar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {itens.length === 0 ? (
          <p className="px-1 py-10 text-center text-slate-600">Toque nos produtos para montar o pedido.</p>
        ) : (
          <ul className="space-y-2">
            {itens.map((i) => (
              <li key={i.produtoId} className="vidro-cartao flex items-center gap-2 rounded-2xl p-2 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.nome}</span>
                  <span className="block text-sm tabular-nums text-slate-600">
                    {formatarBRL(i.precoUnitarioCentavos * i.quantidade)}
                  </span>
                </span>
                <button
                  onClick={() => onAlterar(i.produtoId, -1)}
                  aria-label={`Tirar um ${i.nome}`}
                  className="h-12 w-12 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                >
                  −
                </button>
                <span className="w-7 text-center text-lg font-bold tabular-nums">{i.quantidade}</span>
                <button
                  onClick={() => onAlterar(i.produtoId, 1)}
                  aria-label={`Mais um ${i.nome}`}
                  className="h-12 w-12 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 px-4 pt-2 pb-4">
        {itens.length > 0 &&
          (comDesconto ? (
            <div>
              <label htmlFor="desconto" className="mb-1 block text-sm font-medium text-slate-700">
                Desconto
              </label>
              <CampoDinheiro
                id="desconto"
                valorCentavos={desconto}
                onChange={(c) => onDesconto(Math.min(c, subtotal))}
              />
            </div>
          ) : (
            <button
              onClick={() => setComDesconto(true)}
              className="rounded-lg px-1 text-sm font-medium text-slate-600 underline"
            >
              Dar desconto
            </button>
          ))}

        <div className="flex items-end justify-between">
          <span className="text-slate-700">Total</span>
          <span className="text-4xl font-bold tabular-nums">{formatarBRL(total)}</span>
        </div>
        <button
          onClick={onCobrar}
          disabled={itens.length === 0}
          className="h-16 w-full rounded-2xl bg-marca-600 text-xl font-bold text-white shadow-lg
                     active:bg-marca-700 disabled:opacity-40"
        >
          Cobrar
        </button>
      </div>
    </>
  )
}

/**
 * Cobranca.
 *
 * Caso comum: tocar na forma, tocar em Concluir. Em dinheiro, o "recebido" ja
 * vem no valor exato e as proximas notas estao a um toque — o troco aparece
 * sozinho, grande.
 *
 * Dividir entre formas e opcional: quem nao divide nao ve campo de valor.
 */
function Cobranca({
  total,
  onFechar,
  onConcluir,
}: {
  total: number
  onFechar: () => void
  onConcluir: (pagamentos: Pagamento[], trocoCentavos: number) => void
}) {
  const [pagos, setPagos] = useState<Pagamento[]>([])
  const [forma, setForma] = useState<FormaPagamento | null>(null)
  const restante = total - totalPago(pagos)
  const [dividindo, setDividindo] = useState(false)
  const [valor, setValor] = useState(restante)
  const [recebido, setRecebido] = useState(restante)

  const parte = dividindo ? Math.min(valor, restante) : restante
  const ehDinheiro = forma === 'dinheiro'
  const troco = ehDinheiro && recebido >= parte ? recebido - parte : 0
  const quita = parte === restante
  const pode = total === 0 || (forma !== null && parte > 0 && (!ehDinheiro || recebido >= parte))

  function escolher(f: FormaPagamento) {
    setForma(f)
    setRecebido(parte)
  }

  function avancar() {
    if (total === 0) return onConcluir([], 0)
    const novos = [...pagos, { forma: forma!, valorCentavos: parte }]
    if (quita) return onConcluir(novos, troco)
    // parte paga: volta para escolher a forma do que falta
    const falta = restante - parte
    setPagos(novos)
    setForma(null)
    setValor(falta)
    setRecebido(falta)
  }

  return (
    <BottomSheet
      aberto
      titulo="Cobrar"
      onFechar={onFechar}
      rodape={
        <button
          onClick={avancar}
          disabled={!pode}
          className="h-16 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white disabled:opacity-40"
        >
          {quita || total === 0 ? 'Concluir venda' : 'Registrar e cobrar o resto'}
        </button>
      }
    >
      <div className="text-center">
        <p className="text-slate-600">{pagos.length > 0 ? 'Falta receber' : 'Total'}</p>
        <p className="text-4xl font-bold tabular-nums sm:text-5xl">{formatarBRL(restante)}</p>
        {pagos.length > 0 && (
          <p className="mt-1 text-sm text-slate-600">
            Já recebido:{' '}
            {pagos.map((p) => `${formatarBRL(p.valorCentavos)} em ${ROTULO_FORMA[p.forma]}`).join(', ')}
          </p>
        )}
      </div>

      {total > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {FORMAS.map((f) => (
              <button
                key={f}
                onClick={() => escolher(f)}
                aria-pressed={forma === f}
                className={`h-16 rounded-2xl border-2 text-xl font-bold ${
                  forma === f
                    ? 'border-marca-600 bg-marca-50 text-marca-700'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                {ROTULO_FORMA[f]}
              </button>
            ))}
          </div>

          {dividindo ? (
            <div className="mt-4">
              <label htmlFor="parte" className="mb-1 block text-sm font-medium text-slate-700">
                Quanto {forma ? `em ${ROTULO_FORMA[forma]}` : 'nesta forma'}?
              </label>
              <CampoDinheiro
                id="parte"
                selecionarAoFocar
                valorCentavos={valor}
                onChange={(c) => {
                  const v = Math.min(c, restante)
                  setValor(v)
                  setRecebido(v)
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => setDividindo(true)}
              className="mt-3 rounded-lg px-1 text-sm font-medium text-slate-600 underline"
            >
              Dividir em mais de uma forma
            </button>
          )}

          {ehDinheiro && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Quanto a cliente entregou?</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {sugestoesDeRecebido(parte).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setRecebido(s)}
                    className={`rounded-full border px-4 font-semibold tabular-nums ${
                      recebido === s
                        ? 'border-marca-600 bg-marca-50 text-marca-700'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    {i === 0 ? 'Valor exato' : formatarBRL(s)}
                  </button>
                ))}
              </div>
              {/* o troco vem ANTES do campo de outro valor: e o que a pessoa
                  precisa ler, e no celular nao pode ficar abaixo da dobra */}
              <div
                className={`mb-3 rounded-2xl p-3 text-center ${
                  recebido < parte ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
                }`}
                aria-live="polite"
              >
                {recebido < parte ? (
                  <p className="font-medium">Faltam {formatarBRL(parte - recebido)}</p>
                ) : (
                  <>
                    <p className="text-sm">Troco</p>
                    <p className="text-4xl font-bold tabular-nums">{formatarBRL(troco)}</p>
                  </>
                )}
              </div>
              <label htmlFor="recebido" className="mb-1 block text-sm text-slate-600">
                Outro valor
              </label>
              <CampoDinheiro id="recebido" selecionarAoFocar valorCentavos={recebido} onChange={setRecebido} />
            </div>
          )}
        </>
      )}
    </BottomSheet>
  )
}

/**
 * Confirmacao que ocupa a tela: quem esta no balcao precisa ter certeza, de
 * relance, de que a venda entrou — e de quanto e o troco.
 *
 * Sem troco, some sozinha. Com troco, espera o toque: a pessoa ainda esta
 * contando notas e a tela nao pode sumir no meio.
 */
function Concluida({
  venda,
  onNova,
  onDesfazer,
}: {
  venda: Venda
  onNova: () => void
  onDesfazer: () => void
}) {
  useEffect(() => {
    if (venda.trocoCentavos > 0) return
    const t = setTimeout(onNova, 4000)
    return () => clearTimeout(t)
  }, [venda.id])

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-emerald-600/95 p-6 text-white backdrop-blur">
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <p className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-5xl">
          ✓
        </p>
        <h2 className="mt-4 text-3xl font-bold">Venda concluída</h2>
        <p className="mt-1 text-xl tabular-nums">{formatarBRL(venda.totalCentavos)}</p>

        {venda.trocoCentavos > 0 && (
          <div className="mt-6 rounded-3xl bg-white p-5 text-emerald-900">
            <p className="text-lg">Troco</p>
            <p className="text-6xl font-bold tabular-nums">{formatarBRL(venda.trocoCentavos)}</p>
          </div>
        )}

        <button
          onClick={onNova}
          autoFocus
          className="mt-8 h-16 w-full rounded-2xl bg-white text-xl font-bold text-emerald-700"
        >
          Nova venda
        </button>
        <button onClick={onDesfazer} className="mt-2 w-full rounded-2xl font-medium text-white/90 underline">
          Desfazer esta venda
        </button>
      </div>
    </div>
  )
}
