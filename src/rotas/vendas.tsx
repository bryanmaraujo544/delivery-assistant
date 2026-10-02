import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BottomSheet } from '../componentes/BottomSheet'
import { mostrarAviso } from '../componentes/Snackbar'
import { cancelarVenda } from '../db/caixa'
import { db, type VendaLocal } from '../db/local'
import { ehHoje, formatarDia, formatarHora, inicioDoDia, somarDias } from '../dominio/datas'
import { formatarBRL } from '../dominio/dinheiro'
import { FORMAS, ROTULO_FORMA, resumoVendas, subtotalItens } from '../dominio/venda'

const MOTIVOS = ['Erro ao registrar', 'Venda duplicada', 'Cliente desistiu', 'Pagamento não aprovado']

export function Vendas() {
  const [dia, setDia] = useState(() => inicioDoDia(Date.now()))
  const [aberta, setAberta] = useState<string | null>(null)
  const [verExcluidas, setVerExcluidas] = useState(false)

  const dados = useLiveQuery(async () => {
    const vendas = await db.vendas.where('criadaEm').between(dia, somarDias(dia, 1), true, false).toArray()
    const sessoesAbertas = new Set(
      (await db.caixaSessoes.filter((s) => !s.fechadaEm).toArray()).map((s) => s.id),
    )
    return { vendas: vendas.sort((a, b) => b.criadaEm - a.criadaEm), sessoesAbertas }
  }, [dia])

  const r = dados ? resumoVendas(dados.vendas) : null
  // Excluida some da lista, mas nao do banco: fica a um toque, com hora e
  // motivo. Venda que desaparece sem deixar rastro e o que impede de conferir
  // o caixa depois.
  const listadas = (dados?.vendas ?? []).filter((v) => verExcluidas || !v.canceladaEm)
  const detalhe = dados?.vendas.find((v) => v.id === aberta)

  return (
    <main className="mx-auto min-h-dvh max-w-3xl pb-40">
      <header className="vidro sticky top-3 z-10 mx-3 mt-3 rounded-3xl px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Vendas</h1>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setDia(somarDias(dia, -1))}
            aria-label="Dia anterior"
            className="w-12 rounded-xl bg-white/80 text-xl font-bold text-slate-700"
          >
            ‹
          </button>
          <p className="flex-1 text-center font-semibold capitalize">
            {ehHoje(dia) ? 'Hoje' : formatarDia(dia)}
          </p>
          <button
            onClick={() => setDia(somarDias(dia, 1))}
            disabled={ehHoje(dia)}
            aria-label="Próximo dia"
            className="w-12 rounded-xl bg-white/80 text-xl font-bold text-slate-700 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </header>

      {r && (
        <div className="space-y-4 px-4 pt-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cartao rotulo="Vendido" valor={formatarBRL(r.totalCentavos)} destaque />
            <Cartao
              rotulo="Vendas"
              valor={String(r.quantidadeVendas)}
              nota={`${r.quantidadeItens} ${r.quantidadeItens === 1 ? 'item vendido' : 'itens vendidos'}`}
            />
            <Cartao rotulo="Ticket médio" valor={formatarBRL(r.ticketMedioCentavos)} />
            <Cartao
              rotulo="Lucro bruto"
              valor={r.lucroBrutoCentavos == null ? '—' : formatarBRL(r.lucroBrutoCentavos)}
              // "mostre a conta": dizer do que o numero e feito, e do que ele NAO inclui
              nota={
                r.lucroBrutoCentavos == null
                  ? 'Vincule os produtos a fichas técnicas para ver'
                  : r.unidadesSemCusto > 0
                    ? `Sem contar ${r.unidadesSemCusto} ${r.unidadesSemCusto === 1 ? 'item' : 'itens'} sem ficha`
                    : 'Venda menos custo da ficha'
              }
            />
          </section>

          {r.quantidadeVendas > 0 && (
            <section className="vidro-cartao rounded-2xl p-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                Por forma de pagamento
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                {FORMAS.map((f) => (
                  <div key={f}>
                    <dt className="text-xs text-slate-500">{ROTULO_FORMA[f]}</dt>
                    <dd className="font-semibold tabular-nums">{formatarBRL(r.porForma[f])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {r.produtos.length > 0 && (
            <section>
              <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                Mais vendidos
              </h2>
              <ul className="vidro-cartao divide-y divide-white/70 rounded-2xl">
                {r.produtos.slice(0, 8).map((p) => (
                  <li key={p.produtoId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-8 font-bold tabular-nums text-marca-700">{p.quantidade}×</span>
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="font-semibold tabular-nums">{formatarBRL(p.totalCentavos)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                Todas as vendas
              </h2>
              {r.quantidadeCanceladas > 0 && (
                <button
                  onClick={() => setVerExcluidas(!verExcluidas)}
                  className="rounded-lg px-2 text-sm font-medium text-slate-600 underline"
                >
                  {verExcluidas
                    ? 'Ocultar excluídas'
                    : `Ver ${r.quantidadeCanceladas} excluída${r.quantidadeCanceladas > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
            {listadas.length === 0 ? (
              <p className="vidro-cartao rounded-2xl px-4 py-8 text-center text-slate-600">
                Nenhuma venda {ehHoje(dia) ? 'hoje ainda' : 'neste dia'}.
              </p>
            ) : (
              <ul className="vidro-cartao divide-y divide-white/70 overflow-hidden rounded-2xl">
                {listadas.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => setAberta(v.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/50 ${
                        v.canceladaEm ? 'text-slate-400' : ''
                      }`}
                    >
                      <span className="w-12 shrink-0 text-sm tabular-nums">{formatarHora(v.criadaEm)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${v.canceladaEm ? 'line-through' : 'font-medium'}`}>
                          {v.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}
                        </span>
                        <span className="block text-sm text-slate-500">
                          {v.canceladaEm
                            ? `Excluída: ${v.motivoCancelamento}`
                            : v.pagamentos.map((p) => ROTULO_FORMA[p.forma]).join(' + ') || 'Sem cobrança'}
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums ${v.canceladaEm ? 'line-through' : ''}`}>
                        {formatarBRL(v.totalCentavos)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {detalhe && (
        <Detalhe
          venda={detalhe}
          caixaAberto={dados!.sessoesAbertas.has(detalhe.sessaoId)}
          onFechar={() => setAberta(null)}
        />
      )}
    </main>
  )
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string
  valor: string
  nota?: string
  destaque?: boolean
}) {
  return (
    <div className="vidro-cartao rounded-2xl p-4">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={`text-2xl font-bold tabular-nums ${destaque ? 'text-marca-700' : ''}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
    </div>
  )
}

function Detalhe({
  venda,
  caixaAberto,
  onFechar,
}: {
  venda: VendaLocal
  caixaAberto: boolean
  onFechar: () => void
}) {
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  async function cancelar() {
    await cancelarVenda(venda.id, motivo)
    mostrarAviso(`Venda de ${formatarBRL(venda.totalCentavos)} excluída`)
    onFechar()
  }

  return (
    <BottomSheet
      aberto
      titulo={`Venda das ${formatarHora(venda.criadaEm)}`}
      onFechar={onFechar}
      rodape={
        cancelando ? (
          <div className="flex gap-2">
            <button
              onClick={() => setCancelando(false)}
              className="h-14 rounded-2xl border border-slate-300 px-5 font-medium text-slate-700"
            >
              Voltar
            </button>
            {/* botao nomeado pela acao, nunca "OK": excluir venda nao tem desfazer */}
            <button
              onClick={cancelar}
              disabled={!motivo.trim()}
              className="h-14 flex-1 rounded-2xl bg-red-600 font-semibold text-white disabled:opacity-40"
            >
              Excluir esta venda
            </button>
          </div>
        ) : !venda.canceladaEm ? (
          <button
            onClick={() => setCancelando(true)}
            className="h-14 w-full rounded-2xl border border-slate-300 font-medium text-red-700"
          >
            Excluir venda
          </button>
        ) : undefined
      }
    >
      {venda.canceladaEm && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
          Excluída às {formatarHora(venda.canceladaEm)}: {venda.motivoCancelamento}
        </p>
      )}

      <ul className="space-y-1.5">
        {venda.itens.map((i) => (
          <li key={i.produtoId} className="flex justify-between gap-3">
            <span>
              {i.quantidade}× {i.nome}
            </span>
            <span className="tabular-nums">{formatarBRL(i.precoUnitarioCentavos * i.quantidade)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3">
        {venda.descontoCentavos > 0 && (
          <>
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatarBRL(subtotalItens(venda.itens))}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Desconto</dt>
              <dd className="tabular-nums">− {formatarBRL(venda.descontoCentavos)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between text-lg font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatarBRL(venda.totalCentavos)}</dd>
        </div>
        {venda.pagamentos.map((p, i) => (
          <div key={i} className="flex justify-between text-slate-600">
            <dt>{ROTULO_FORMA[p.forma]}</dt>
            <dd className="tabular-nums">{formatarBRL(p.valorCentavos)}</dd>
          </div>
        ))}
        {venda.trocoCentavos > 0 && (
          <div className="flex justify-between text-slate-600">
            <dt>Troco devolvido</dt>
            <dd className="tabular-nums">{formatarBRL(venda.trocoCentavos)}</dd>
          </div>
        )}
      </dl>


      {cancelando && (
        <div className="mt-4">
          <p className="mb-2 font-medium">Por que está excluindo?</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                className={`rounded-full border px-4 text-sm font-medium ${
                  motivo === m
                    ? 'border-red-600 bg-red-50 text-red-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ou escreva o motivo"
            aria-label="Motivo do cancelamento"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
          <p className="mt-2 text-sm text-slate-500">
            A venda sai do total do dia e do caixa. Se a cliente pagou, devolva o dinheiro.
          </p>
          {/* depois do fechamento ainda da para corrigir um erro, mas a pessoa
              precisa saber que o numero daquele fechamento vai mudar */}
          {!caixaAberto && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              O caixa desta venda já foi fechado. Excluir muda a diferença registrada naquele
              fechamento.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
