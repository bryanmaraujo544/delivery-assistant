import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '../componentes/BottomSheet'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { mostrarAviso } from '../componentes/Snackbar'
import {
  atualizarDespesa,
  criarDespesa,
  excluirDespesa,
  restaurarDespesa,
  trazerRepeticoes,
} from '../db/despesas'
import { db, type DespesaLocal } from '../db/local'
import { vendasCompletasDesde } from '../db/sync'
import { formatarBRL } from '../dominio/dinheiro'
import {
  CATEGORIAS,
  categoriaPorCodigo,
  diasNoMes,
  intervaloDoMes,
  mesDe,
  repeticoesPendentes,
  resultadoDoMes,
  rotuloMes,
  somarMeses,
  type ResultadoDoMes,
} from '../dominio/financeiro'

/**
 * Financeiro: as despesas do mes e o resultado.
 *
 * A tela responde, nesta ordem, as tres perguntas de quem tem uma loja:
 * "sobrou ou faltou?", "para onde foi o dinheiro?" e "quanto preciso vender
 * para fechar o mes?".
 */
export function Financeiro() {
  const [mes, setMes] = useState(() => mesDe(Date.now()))
  /** undefined = fechado · null = nova · string = editando */
  const [editando, setEditando] = useState<string | null | undefined>(undefined)

  const dados = useLiveQuery(async () => {
    const [inicio, fim] = intervaloDoMes(mes)
    const [vendas, despesas] = await Promise.all([
      db.vendas.where('criadaEm').between(inicio, fim, true, false).toArray(),
      db.despesas.filter((d) => !d.excluidoEm).toArray(),
    ])
    return {
      despesas,
      doMes: despesas
        .filter((d) => d.mes === mes)
        .sort((a, b) => Number(!!a.pagoEm) - Number(!!b.pagoEm) || b.valorCentavos - a.valorCentavos),
      r: resultadoDoMes(mes, vendas, despesas),
      anterior: resultadoDoMes(somarMeses(mes, -1), [], despesas),
      aTrazer: repeticoesPendentes(mes, despesas),
    }
  }, [mes])

  const mesAtual = mesDe(Date.now())
  // vendas deste mes podem nao ter sido baixadas para este aparelho
  const vendasIncompletas = intervaloDoMes(mes)[0] < vendasCompletasDesde()

  async function trazer() {
    const n = await trazerRepeticoes(mes)
    mostrarAviso(`${n} ${n === 1 ? 'despesa trazida' : 'despesas trazidas'}. Confira os valores deste mês.`)
  }

  async function alternarPago(d: DespesaLocal) {
    await atualizarDespesa(d.id, { pagoEm: d.pagoEm ? null : Date.now() })
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl pb-48">
      <header className="vidro sticky top-3 z-10 mx-3 mt-3 rounded-3xl px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setMes(somarMeses(mes, -1))}
            aria-label="Mês anterior"
            className="w-12 rounded-xl bg-white/80 text-xl font-bold text-slate-700"
          >
            ‹
          </button>
          <p className="flex-1 text-center font-semibold first-letter:uppercase">{rotuloMes(mes)}</p>
          <button
            onClick={() => setMes(somarMeses(mes, 1))}
            aria-label="Próximo mês"
            className="w-12 rounded-xl bg-white/80 text-xl font-bold text-slate-700"
          >
            ›
          </button>
        </div>
      </header>

      {dados && (
        <div className="space-y-4 px-4 pt-4">
          {vendasIncompletas && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este aparelho só tem as vendas dos últimos 60 dias. O faturamento deste mês pode
              estar incompleto aqui.
            </p>
          )}

          <Resultado r={dados.r} mes={mes} emAndamento={mes === mesAtual} />

          {dados.aTrazer.length > 0 && (
            <button
              onClick={trazer}
              className="w-full rounded-2xl border-2 border-dashed border-marca-500 bg-white/70 px-4 py-3
                         text-left font-medium text-marca-700"
            >
              + Trazer {dados.aTrazer.length === 1 ? 'a despesa' : `as ${dados.aTrazer.length} despesas`}{' '}
              que {dados.aTrazer.length === 1 ? 'se repete' : 'se repetem'} todo mês
              <span className="block text-sm font-normal text-slate-600">
                {dados.aTrazer.map((d) => d.descricao).join(', ')} ·{' '}
                {formatarBRL(dados.aTrazer.reduce((s, d) => s + d.valorCentavos, 0))} no mês passado
              </span>
            </button>
          )}

          {(dados.r.comprasCentavos > 0 || dados.r.custoProdutosCentavos > 0) && (
            <ComprasVersusFichas r={dados.r} />
          )}

          {dados.r.porCategoria.length > 0 && <PorCategoria r={dados.r} />}

          <section>
            <div className="flex items-baseline justify-between px-1 pb-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                Despesas do mês
              </h2>
              {dados.r.aPagarCentavos > 0 && (
                <p className="text-sm text-amber-800">
                  Falta pagar {formatarBRL(dados.r.aPagarCentavos)}
                </p>
              )}
            </div>
            {dados.doMes.length === 0 ? (
              <p className="vidro-cartao rounded-2xl px-4 py-8 text-center text-slate-600">
                Nenhuma despesa lançada em {rotuloMes(mes)}.
              </p>
            ) : (
              <ul className="vidro-cartao divide-y divide-white/70 overflow-hidden rounded-2xl">
                {dados.doMes.map((d) => (
                  <li key={d.id} className="flex items-stretch">
                    <label
                      className="flex w-14 shrink-0 items-center justify-center"
                      title={d.pagoEm ? 'Paga' : 'Marcar como paga'}
                    >
                      <input
                        type="checkbox"
                        checked={!!d.pagoEm}
                        onChange={() => alternarPago(d)}
                        aria-label={`${d.descricao} paga`}
                        className="h-6 w-6 accent-emerald-600"
                      />
                    </label>
                    <button
                      onClick={() => setEditando(d.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left hover:bg-white/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.descricao}</span>
                        <span className="block text-sm text-slate-500">
                          {categoriaPorCodigo(d.categoria).rotulo}
                          {categoriaPorCodigo(d.categoria).tipo === 'custo' ? ' · compra' : ''}
                          {d.parcelas ? ` · parcela ${d.parcela} de ${d.parcelas}` : ''}
                          {d.repete ? ' · todo mês' : ''}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">
                          {formatarBRL(d.valorCentavos)}
                        </span>
                        <span className={`block text-xs ${d.pagoEm ? 'text-emerald-700' : 'text-amber-800'}`}>
                          {d.pagoEm ? 'paga' : 'a pagar'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div
        className="fixed right-0 bottom-[var(--nav-h)] left-[var(--nav-w)] mx-auto max-w-3xl px-4 pt-6 pb-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setEditando(null)}
          className="h-14 w-full rounded-2xl bg-marca-600 font-semibold text-white shadow-lg active:bg-marca-700"
        >
          Nova despesa
        </button>
      </div>

      {editando !== undefined && dados && (
        <FormDespesa
          mes={mes}
          despesa={dados.despesas.find((d) => d.id === editando)}
          onFechar={() => setEditando(undefined)}
        />
      )}
    </main>
  )
}

/**
 * O resultado com a conta aberta, linha a linha. Mesmo principio do resto do
 * sistema: nunca so o numero final — a pessoa precisa ver de onde ele veio.
 */
function Resultado({ r, mes, emAndamento }: { r: ResultadoDoMes; mes: string; emAndamento: boolean }) {
  const positivo = r.resultadoCentavos >= 0
  const semDados = r.faturamentoCentavos === 0 && r.totalDespesasCentavos === 0
  const faltaParaEmpatar =
    r.pontoEquilibrioCentavos != null ? r.pontoEquilibrioCentavos - r.faturamentoCentavos : null

  return (
    <section className="vidro-cartao rounded-3xl p-5">
      <p className="text-sm text-slate-600">
        {emAndamento ? 'Resultado do mês até agora' : 'Resultado do mês'}
      </p>
      <p className={`text-4xl font-bold tabular-nums ${semDados ? '' : positivo ? 'text-emerald-700' : 'text-red-700'}`}>
        {formatarBRL(r.resultadoCentavos)}
      </p>
      {!semDados && (
        <p className="text-sm text-slate-600">
          {positivo ? 'Sobrou' : 'Faltou'}
          {/* com venda quase nula o percentual vira um numero absurdo que nao informa nada */}
          {r.margemPercentual != null &&
            Math.abs(r.margemPercentual) <= 500 &&
            ` · ${Math.abs(r.margemPercentual).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do que foi vendido`}
        </p>
      )}

      <dl className="mt-4 space-y-1.5 text-sm">
        <Linha rotulo="Vendas" valor={r.faturamentoCentavos} forte />
        <Linha rotulo="Custo dos produtos vendidos (pelas fichas)" valor={r.custoProdutosCentavos} sinal="−" />
        <Linha rotulo="Taxas e entregas" valor={r.despesasVariaveisCentavos} sinal="−" />
        <div className="border-t border-slate-300/60 pt-1.5">
          <Linha rotulo="Sobra para pagar as contas fixas" valor={r.margemContribuicaoCentavos} forte />
        </div>
        <Linha rotulo="Contas fixas (aluguel, luz, parcelas…)" valor={r.despesasFixasCentavos} sinal="−" />
        <div className="border-t border-slate-300/60 pt-1.5">
          <Linha rotulo="Resultado" valor={r.resultadoCentavos} forte />
        </div>
      </dl>

      {/* O aviso mais importante da tela: sem custo, a venda entra como lucro
          puro e o resultado mente para cima. */}
      {r.faturamentoSemCustoCentavos > 0 && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{formatarBRL(r.faturamentoSemCustoCentavos)}</strong> das vendas são de produtos
          sem custo conhecido, então o resultado real é menor do que este. Em{' '}
          <Link to="/produtos" className="font-medium underline">
            Produtos
          </Link>
          , vincule uma ficha técnica ou informe o custo de cada um. Vendas antigas continuam sem
          custo.
        </p>
      )}

      {/* Ponto de equilibrio em linguagem de balcao. So aparece quando ha base
          para calcular: com venda e com margem positiva. */}
      {r.pontoEquilibrioCentavos != null && r.despesasFixasCentavos > 0 && (
        <p className="mt-4 rounded-2xl bg-white/60 px-4 py-3 text-sm text-slate-700">
          Para as contas fecharem, a loja precisa vender{' '}
          <strong>{formatarBRL(r.pontoEquilibrioCentavos)}</strong> no mês — cerca de{' '}
          <strong>{formatarBRL(r.pontoEquilibrioCentavos / diasNoMes(mes))}</strong> por dia.{' '}
          {faltaParaEmpatar! > 0
            ? `Faltam ${formatarBRL(faltaParaEmpatar!)}.`
            : 'Essa marca já foi passada.'}
        </p>
      )}
      {r.pontoEquilibrioCentavos == null && r.faturamentoCentavos > 0 && r.margemContribuicaoCentavos <= 0 && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900">
          O custo dos produtos e as taxas passaram do que as vendas renderam. Vender mais não
          resolve: é preciso rever preços ou custos.
        </p>
      )}
    </section>
  )
}

function Linha({ rotulo, valor, sinal, forte }: { rotulo: string; valor: number; sinal?: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${forte ? 'font-semibold' : 'text-slate-600'}`}>
      <dt>{rotulo}</dt>
      <dd className="shrink-0 tabular-nums">
        {sinal ? `${sinal} ` : ''}
        {formatarBRL(valor)}
      </dd>
    </div>
  )
}

/**
 * Compras de ingredientes e embalagens contra o que as vendas consumiram.
 *
 * A compra nao entra no resultado — o custo vem das fichas. Mas a diferenca
 * entre as duas e a informacao que nenhuma delas da sozinha: sobra,
 * desperdicio, estoque parado ou ficha desatualizada.
 */
function ComprasVersusFichas({ r }: { r: ResultadoDoMes }) {
  const diferenca = r.comprasCentavos - r.custoProdutosCentavos
  return (
    <section className="vidro-cartao rounded-2xl p-4">
      <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
        Ingredientes e embalagens
      </h2>
      <dl className="mt-2 space-y-1.5 text-sm">
        <Linha rotulo="Usado nas vendas (pelas fichas)" valor={r.custoProdutosCentavos} />
        <Linha rotulo="Comprado no mês" valor={r.comprasCentavos} />
      </dl>
      <p className="mt-3 text-sm text-slate-700">
        {r.comprasCentavos === 0
          ? 'Nenhuma compra lançada neste mês. Lance as compras de ingredientes para comparar.'
          : diferenca > 0
            ? `Você comprou ${formatarBRL(diferenca)} a mais do que as vendas usaram. Pode ser estoque para os próximos meses, sobra, desperdício ou ficha com quantidade desatualizada.`
            : diferenca < 0
              ? `As vendas usaram ${formatarBRL(-diferenca)} a mais do que você comprou. Pode ser estoque de meses anteriores ou compra ainda não lançada.`
              : 'O que você comprou bate com o que as vendas usaram.'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        As compras não entram no resultado: o custo de cada venda já vem da ficha técnica.
      </p>
    </section>
  )
}

/** Para onde foi o dinheiro: barra proporcional a maior categoria. */
function PorCategoria({ r }: { r: ResultadoDoMes }) {
  const maior = r.porCategoria[0]?.totalCentavos ?? 1
  return (
    <section className="vidro-cartao rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Contas do mês</h2>
        <p className="font-semibold tabular-nums">{formatarBRL(r.totalDespesasCentavos)}</p>
      </div>
      <ul className="mt-3 space-y-2.5">
        {r.porCategoria.map((c) => (
          <li key={c.codigo}>
            <div className="flex justify-between gap-3 text-sm">
              <span>{c.rotulo}</span>
              <span className="tabular-nums">
                {formatarBRL(c.totalCentavos)}
                <span className="ml-2 text-slate-500">
                  {Math.round((c.totalCentavos / r.totalDespesasCentavos) * 100)}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-marca-500"
                style={{ width: `${Math.max(2, (c.totalCentavos / maior) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Frequencia = 'unica' | 'mensal' | 'parcelada'

function FormDespesa({
  mes,
  despesa,
  onFechar,
}: {
  mes: string
  despesa: DespesaLocal | undefined
  onFechar: () => void
}) {
  const [descricao, setDescricao] = useState(despesa?.descricao ?? '')
  const [categoria, setCategoria] = useState(despesa?.categoria ?? '')
  const [valor, setValor] = useState(despesa?.valorCentavos ?? 0)
  const [frequencia, setFrequencia] = useState<Frequencia>(despesa?.repete ? 'mensal' : 'unica')
  const [parcelas, setParcelas] = useState(2)
  const [paga, setPaga] = useState(despesa ? !!despesa.pagoEm : true)

  const pode = descricao.trim() !== '' && categoria !== '' && valor > 0

  async function salvar() {
    const campos = {
      descricao: descricao.trim(),
      categoria,
      valorCentavos: valor,
      repete: frequencia === 'mensal',
      pagoEm: paga ? (despesa?.pagoEm ?? Date.now()) : null,
    }
    if (despesa) await atualizarDespesa(despesa.id, campos)
    else await criarDespesa({ ...campos, mes }, frequencia === 'parcelada' ? parcelas : undefined)
    onFechar()
  }

  async function excluir() {
    const removida = await excluirDespesa(despesa!.id)
    onFechar()
    if (removida) mostrarAviso(`“${removida.descricao}” excluída`, () => restaurarDespesa(removida))
  }

  return (
    <BottomSheet
      aberto
      titulo={despesa ? 'Editar despesa' : 'Nova despesa'}
      onFechar={onFechar}
      rodape={
        <div className="flex gap-2">
          {despesa && (
            <button onClick={excluir} className="h-14 rounded-2xl border border-slate-300 px-5 font-medium text-red-700">
              Excluir
            </button>
          )}
          <button
            onClick={salvar}
            disabled={!pode}
            className="h-14 flex-1 rounded-2xl bg-marca-600 font-semibold text-white disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">O que é?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c.codigo}
                onClick={() => {
                  setCategoria(c.codigo)
                  // a categoria ja serve de nome: "Luz" nao precisa ser digitado
                  if (!descricao.trim() || CATEGORIAS.some((x) => x.rotulo === descricao)) setDescricao(c.rotulo)
                }}
                aria-pressed={categoria === c.codigo}
                className={`rounded-full border px-4 text-sm font-medium ${
                  categoria === c.codigo
                    ? 'border-marca-600 bg-marca-50 text-marca-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="d-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
            Descrição
          </label>
          <input
            id="d-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Batedeira planetária"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="d-valor" className="mb-1.5 block text-sm font-medium text-slate-700">
            {frequencia === 'parcelada' ? 'Valor de cada parcela' : 'Valor'}
          </label>
          <CampoDinheiro id="d-valor" selecionarAoFocar valorCentavos={valor} onChange={setValor} />
        </div>

        {/* Na edicao a frequencia nao muda de parcelada para outra coisa: as
            outras parcelas ja existem como despesas dos meses seguintes. */}
        {!despesa?.parcelas && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Quando acontece?</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['unica', 'Só este mês'],
                  ['mensal', 'Todo mês'],
                  ...(despesa ? [] : [['parcelada', 'Parcelada']]),
                ] as [Frequencia, string][]
              ).map(([f, rotulo]) => (
                <button
                  key={f}
                  onClick={() => setFrequencia(f)}
                  aria-pressed={frequencia === f}
                  className={`rounded-xl border-2 font-medium ${
                    frequencia === f
                      ? 'border-marca-600 bg-marca-50 text-marca-700'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            {frequencia === 'mensal' && (
              <p className="mt-1.5 text-xs text-slate-500">
                No mês que vem ela aparece para você trazer com um toque e conferir o valor.
              </p>
            )}
            {frequencia === 'parcelada' && (
              <div className="mt-3">
                <label htmlFor="d-parcelas" className="mb-1.5 block text-sm text-slate-700">
                  Em quantas vezes?
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setParcelas(Math.max(2, parcelas - 1))}
                    aria-label="Uma parcela a menos"
                    className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                  >
                    −
                  </button>
                  <input
                    id="d-parcelas"
                    inputMode="numeric"
                    value={parcelas}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setParcelas(Math.min(Math.max(Number(e.target.value.replace(/\D/g, '') || 2), 2), 120))
                    }
                    className="h-14 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-center
                               text-xl font-semibold tabular-nums focus:border-marca-600 focus:ring-2
                               focus:ring-marca-500/30 focus:outline-none"
                  />
                  <button
                    onClick={() => setParcelas(Math.min(120, parcelas + 1))}
                    aria-label="Uma parcela a mais"
                    className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {parcelas}× de {formatarBRL(valor)} = {formatarBRL(valor * parcelas)}, de{' '}
                  {rotuloMes(mes)} a {rotuloMes(somarMeses(mes, parcelas - 1))}. Cada parcela entra
                  no mês dela.
                </p>
              </div>
            )}
          </div>
        )}
        {despesa?.parcelas && (
          <p className="text-sm text-slate-600">
            Parcela {despesa.parcela} de {despesa.parcelas}. Alterar aqui muda só esta parcela.
          </p>
        )}

        <label className="flex items-center gap-3 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={paga}
            onChange={(e) => setPaga(e.target.checked)}
            className="h-6 w-6 accent-emerald-600"
          />
          Já está paga
        </label>
      </div>
    </BottomSheet>
  )
}
