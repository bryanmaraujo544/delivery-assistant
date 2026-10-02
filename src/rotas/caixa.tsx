import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AbrirCaixa } from '../componentes/AbrirCaixa'
import { BottomSheet } from '../componentes/BottomSheet'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { mostrarAviso } from '../componentes/Snackbar'
import { fecharCaixa, registrarMovimento } from '../db/caixa'
import { db, type SessaoCaixaLocal } from '../db/local'
import { ehHoje, formatarDia, formatarHora } from '../dominio/datas'
import { formatarBRL } from '../dominio/dinheiro'
import { FORMAS, ROTULO_FORMA, resumoCaixa, type MovimentoCaixa, type ResumoCaixa } from '../dominio/venda'

export function Caixa() {
  const [movimento, setMovimento] = useState<MovimentoCaixa['tipo'] | null>(null)
  const [fechando, setFechando] = useState(false)

  const dados = useLiveQuery(async () => {
    const sessoes = (await db.caixaSessoes.toArray()).sort((a, b) => b.abertaEm - a.abertaEm)
    const aberta = sessoes.find((s) => !s.fechadaEm)
    const ids = sessoes.slice(0, 15).map((s) => s.id)
    const [movimentos, vendas] = await Promise.all([
      db.caixaMovimentos.where('sessaoId').anyOf(ids).toArray(),
      db.vendas.where('sessaoId').anyOf(ids).toArray(),
    ])
    return {
      aberta,
      resumoAberta: aberta ? resumoCaixa(aberta, movimentos, vendas) : null,
      movimentosAberta: aberta
        ? movimentos.filter((m) => m.sessaoId === aberta.id).sort((a, b) => b.criadoEm - a.criadoEm)
        : [],
      fechadas: sessoes
        .filter((s) => s.fechadaEm)
        .slice(0, 14)
        .map((s) => ({ sessao: s, resumo: resumoCaixa(s, movimentos, vendas) })),
    }
  }, [])

  if (!dados) return <p className="p-10 text-center text-slate-400">Carregando…</p>
  const { aberta, resumoAberta: r } = dados

  return (
    <main className="mx-auto min-h-dvh max-w-3xl pb-40">
      <header className="vidro-barra sticky top-0 z-10 px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Caixa</h1>
        <p className="text-sm text-slate-600">
          {aberta
            ? `Aberto ${ehHoje(aberta.abertaEm) ? 'hoje' : formatarDia(aberta.abertaEm)} às ${formatarHora(aberta.abertaEm)}`
            : 'Fechado'}
        </p>
      </header>

      <div className="space-y-4 px-4 pt-4">
        {!aberta && <AbrirCaixa />}

        {aberta && r && (
          <>
            {!ehHoje(aberta.abertaEm) && (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este caixa ficou aberto desde {formatarDia(aberta.abertaEm)}. Feche-o e abra um novo
                para as vendas de hoje não se misturarem.
              </p>
            )}

            <section className="vidro-solido rounded-3xl p-5">
              <p className="text-sm text-slate-600">Vendido neste caixa</p>
              <p className="text-4xl font-bold tabular-nums">{formatarBRL(r.totalVendidoCentavos)}</p>
              <p className="text-sm text-slate-600">
                {r.quantidadeVendas} {r.quantidadeVendas === 1 ? 'venda' : 'vendas'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                {FORMAS.map((f) => (
                  <div key={f}>
                    <dt className="text-xs text-slate-500">{ROTULO_FORMA[f]}</dt>
                    <dd className="font-semibold tabular-nums">{formatarBRL(r.porForma[f])}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMovimento('sangria')}
                className="vidro-solido rounded-2xl px-4 py-3 text-left"
              >
                <span className="block font-semibold">Retirar dinheiro</span>
                <span className="block text-sm text-slate-500">Sangria: levar ao banco, pagar algo</span>
              </button>
              <button
                onClick={() => setMovimento('suprimento')}
                className="vidro-solido rounded-2xl px-4 py-3 text-left"
              >
                <span className="block font-semibold">Colocar dinheiro</span>
                <span className="block text-sm text-slate-500">Suprimento: reforço de troco</span>
              </button>
            </div>

            {dados.movimentosAberta.length > 0 && (
              <section>
                <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  Retiradas e entradas
                </h2>
                <ul className="vidro-solido divide-y divide-slate-100 rounded-2xl">
                  {dados.movimentosAberta.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.motivo}</span>
                        <span className="block text-sm text-slate-500">
                          {m.tipo === 'sangria' ? 'Retirada' : 'Entrada'} às {formatarHora(m.criadoEm)}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {m.tipo === 'sangria' ? '− ' : '+ '}
                        {formatarBRL(m.valorCentavos)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              onClick={() => setFechando(true)}
              className="h-14 w-full rounded-2xl bg-slate-900 text-lg font-semibold text-white"
            >
              Fechar caixa
            </button>
          </>
        )}

        {dados.fechadas.length > 0 && (
          <section>
            <h2 className="px-1 pt-2 pb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              Fechamentos anteriores
            </h2>
            <ul className="vidro-solido divide-y divide-slate-100 rounded-2xl">
              {dados.fechadas.map(({ sessao, resumo }) => (
                <li key={sessao.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{formatarDia(sessao.abertaEm)}</span>
                    <span className="block text-sm text-slate-500">
                      {formatarHora(sessao.abertaEm)} – {formatarHora(sessao.fechadaEm!)} ·{' '}
                      {resumo.quantidadeVendas} {resumo.quantidadeVendas === 1 ? 'venda' : 'vendas'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">
                      {formatarBRL(resumo.totalVendidoCentavos)}
                    </span>
                    <Diferenca centavos={resumo.diferencaCentavos ?? 0} compacto />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {movimento && aberta && (
        <FormMovimento tipo={movimento} sessaoId={aberta.id} onFechar={() => setMovimento(null)} />
      )}
      {fechando && aberta && r && (
        <FormFechamento sessao={aberta} resumo={r} onFechar={() => setFechando(false)} />
      )}
    </main>
  )
}

function Diferenca({ centavos, compacto }: { centavos: number; compacto?: boolean }) {
  const cls = compacto ? 'block text-xs' : 'text-2xl font-bold'
  if (centavos === 0) return <span className={`${cls} text-emerald-700`}>Bateu certinho</span>
  return centavos > 0 ? (
    <span className={`${cls} text-sky-700`}>Sobrou {formatarBRL(centavos)}</span>
  ) : (
    <span className={`${cls} text-red-700`}>Faltou {formatarBRL(-centavos)}</span>
  )
}

function FormMovimento({
  tipo,
  sessaoId,
  onFechar,
}: {
  tipo: MovimentoCaixa['tipo']
  sessaoId: string
  onFechar: () => void
}) {
  const [valor, setValor] = useState(0)
  const [motivo, setMotivo] = useState('')
  const sugestoes =
    tipo === 'sangria' ? ['Levar ao banco', 'Pagar fornecedor', 'Compra de insumo'] : ['Reforço de troco']

  async function salvar() {
    await registrarMovimento(sessaoId, tipo, valor, motivo)
    mostrarAviso(`${tipo === 'sangria' ? 'Retirada' : 'Entrada'} de ${formatarBRL(valor)} registrada`)
    onFechar()
  }

  return (
    <BottomSheet
      aberto
      titulo={tipo === 'sangria' ? 'Retirar dinheiro' : 'Colocar dinheiro'}
      onFechar={onFechar}
      rodape={
        <button
          onClick={salvar}
          disabled={valor <= 0 || !motivo.trim()}
          className="h-14 w-full rounded-2xl bg-marca-600 font-semibold text-white disabled:opacity-40"
        >
          Registrar
        </button>
      }
    >
      <label htmlFor="mov-valor" className="mb-1.5 block text-sm font-medium text-slate-700">
        Valor
      </label>
      <CampoDinheiro id="mov-valor" autoFocus valorCentavos={valor} onChange={setValor} />

      <label htmlFor="mov-motivo" className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">
        Motivo
      </label>
      <div className="mb-2 flex flex-wrap gap-2">
        {sugestoes.map((s) => (
          <button
            key={s}
            onClick={() => setMotivo(s)}
            className={`rounded-full border px-4 text-sm font-medium ${
              motivo === s
                ? 'border-marca-600 bg-marca-50 text-marca-700'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        id="mov-motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ou escreva o motivo"
        className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4
                   focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
      />
    </BottomSheet>
  )
}

/**
 * Fechamento com contagem CEGA: primeiro a pessoa conta a gaveta, so depois o
 * sistema mostra quanto deveria ter.
 *
 * Mostrar o esperado antes transforma a contagem em "digitar o numero que o
 * sistema quer ver" — e a diferenca, que e a unica informacao util do
 * fechamento, deixa de existir.
 */
function FormFechamento({
  sessao,
  resumo,
  onFechar,
}: {
  sessao: SessaoCaixaLocal
  resumo: ResumoCaixa
  onFechar: () => void
}) {
  const [contado, setContado] = useState(0)
  const [conferido, setConferido] = useState(false)
  const [observacao, setObservacao] = useState('')
  const diferenca = contado - resumo.esperadoDinheiroCentavos

  async function fechar() {
    await fecharCaixa(sessao.id, contado, observacao)
    mostrarAviso('Caixa fechado')
    onFechar()
  }

  return (
    <BottomSheet
      aberto
      titulo="Fechar caixa"
      onFechar={onFechar}
      rodape={
        conferido ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConferido(false)}
              className="h-14 rounded-2xl border border-slate-300 px-5 font-medium text-slate-700"
            >
              Contar de novo
            </button>
            <button onClick={fechar} className="h-14 flex-1 rounded-2xl bg-slate-900 font-semibold text-white">
              Fechar caixa
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConferido(true)}
            className="h-14 w-full rounded-2xl bg-marca-600 font-semibold text-white"
          >
            Conferir
          </button>
        )
      }
    >
      {!conferido ? (
        <>
          <label htmlFor="contado" className="mb-1.5 block text-lg font-medium">
            Conte o dinheiro da gaveta. Quanto tem?
          </label>
          <CampoDinheiro id="contado" autoFocus valorCentavos={contado} onChange={setContado} />
          <p className="mt-2 text-sm text-slate-500">
            Conte só notas e moedas. Cartão e Pix não entram aqui.
          </p>
        </>
      ) : (
        <>
          <div className="text-center">
            <Diferenca centavos={diferenca} />
          </div>
          {/* a conta aberta, linha a linha: e o que deixa a pessoa achar o erro */}
          <dl className="mt-4 space-y-1.5 text-sm">
            <Linha rotulo="Troco na abertura" valor={sessao.fundoTrocoCentavos} />
            <Linha rotulo="Vendas em dinheiro" valor={resumo.porForma.dinheiro} sinal="+" />
            <Linha rotulo="Dinheiro colocado" valor={resumo.suprimentosCentavos} sinal="+" />
            <Linha rotulo="Dinheiro retirado" valor={resumo.sangriasCentavos} sinal="−" />
            <div className="border-t border-slate-200 pt-1.5">
              <Linha rotulo="Deveria ter na gaveta" valor={resumo.esperadoDinheiroCentavos} forte />
            </div>
            <Linha rotulo="Você contou" valor={contado} forte />
          </dl>
          <label htmlFor="obs" className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">
            Observação (opcional)
          </label>
          <input
            id="obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={diferenca !== 0 ? 'Se souber o motivo da diferença, anote aqui' : ''}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
        </>
      )}
    </BottomSheet>
  )
}

function Linha({
  rotulo,
  valor,
  sinal,
  forte,
}: {
  rotulo: string
  valor: number
  sinal?: string
  forte?: boolean
}) {
  return (
    <div className={`flex justify-between ${forte ? 'font-semibold' : 'text-slate-600'}`}>
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">
        {sinal ? `${sinal} ` : ''}
        {formatarBRL(valor)}
      </dd>
    </div>
  )
}
