import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BottomSheet } from '../componentes/BottomSheet'
import { ColarReceita } from '../componentes/ColarReceita'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { useSnackbar } from '../componentes/Snackbar'
import { montarCatalogo, paraConfigDominio } from '../db/catalogo'
import { rankearInsumos, registrarUso } from '../db/frecency'
import {
  CONFIG_PADRAO,
  UNIDADES,
  db,
  normalizar,
  type FichaLocal,
  type InsumoLocal,
} from '../db/local'
import {
  aplicarTaxaDeCanal,
  calcularCustoFicha,
  calcularPreco,
  markupParaMargem,
  type ItemFicha,
  type MarkupBase,
} from '../dominio/custo'
import { parsearLinha, resolverLinha } from '../dominio/parser-ingrediente'
import { formatarBRL } from '../dominio/dinheiro'

const UNIDADES_RENDIMENTO = ['un', 'porcao', 'fatia', 'cento', 'g', 'kg']

/** App pt-BR: separador decimal e virgula, inclusive em numero solto. */
const pt = (n: number) => String(n).replace('.', ',')
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

/** Canais com taxa conhecida. Gross-up e por divisao, nunca por soma. */
const CANAIS = [
  { nome: 'Direto', taxa: 0 },
  { nome: 'iFood Básico', taxa: 15.2 },
  { nome: 'iFood Entrega', taxa: 26.5 },
]

export function FichaEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { mostrar, elemento: snackbar } = useSnackbar()
  const [pickerAberto, setPickerAberto] = useState(false)
  const [colarAberto, setColarAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [canal, setCanal] = useState(CANAIS[0]!)

  const dados = useLiveQuery(async () => {
    const [ficha, insumos, fichas, config] = await Promise.all([
      db.fichas.get(id),
      db.insumos.filter((i) => !i.excluidoEm).toArray(),
      db.fichas.filter((f) => !f.excluidoEm).toArray(),
      db.config.get('default'),
    ])
    return { ficha, insumos, fichas, config: config ?? CONFIG_PADRAO }
  }, [id])

  const ficha = dados?.ficha

  /**
   * Autosave. O indicador de estado ("Salvo") e o que substitui o botao como
   * fonte de confianca — sem ele, salvamento automatico gera ansiedade.
   */
  async function patch(mudanca: Partial<FichaLocal>) {
    if (!ficha) return
    setSalvando(true)
    await db.fichas.put({ ...ficha, ...mudanca, atualizadoEm: Date.now() })
    setTimeout(() => setSalvando(false), 300)
  }

  async function adicionarItem(item: ItemFicha) {
    if (!ficha) return
    await patch({ itens: [...ficha.itens, item] })
    if (item.tipo === 'insumo') {
      await registrarUso(item.insumoId, ficha.categoria ?? 'global')
      await registrarUso(item.insumoId, 'global')
    }
    setPickerAberto(false)
  }

  async function removerItem(indice: number) {
    if (!ficha) return
    const removido = ficha.itens[indice]!
    const anterior = ficha.itens
    await patch({ itens: ficha.itens.filter((_, i) => i !== indice) })
    const nome =
      removido.tipo === 'insumo'
        ? (dados?.insumos.find((i) => i.id === removido.insumoId)?.nome ?? 'Item')
        : (dados?.fichas.find((f) => f.id === removido.fichaId)?.nome ?? 'Receita')
    mostrar(`"${nome}" removido`, () => patch({ itens: anterior }))
  }

  const catalogo = useMemo(
    () => (dados ? montarCatalogo(dados.insumos, dados.fichas) : null),
    [dados],
  )
  const config = paraConfigDominio(dados?.config)

  const resultado = useMemo(() => {
    if (!catalogo || !ficha) return null
    try {
      const custo = calcularCustoFicha(ficha.id, catalogo, config)
      const preco = calcularPreco(custo, {
        base: ficha.markupBase,
        multiplicador: ficha.markupMultiplicador,
      })
      return { custo, preco, erro: null as string | null }
    } catch (e) {
      return { custo: null, preco: null, erro: (e as Error).message }
    }
  }, [catalogo, ficha, config])

  if (!dados) return <p className="p-10 text-center text-slate-400">Carregando…</p>
  if (!ficha) return <p className="p-10 text-center text-slate-500">Ficha não encontrada.</p>

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-3">
        <button onClick={() => navigate('/fichas')} className="px-2 text-slate-600" aria-label="Voltar">
          ←
        </button>
        <input
          value={ficha.nome}
          onChange={(e) => patch({ nome: e.target.value })}
          aria-label="Nome da ficha"
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-lg font-semibold
                     focus:bg-slate-50 focus:outline-none"
        />
        <span className="shrink-0 pr-2 text-xs text-slate-400">
          {salvando ? 'Salvando…' : 'Salvo'}
        </span>
      </header>

      <div className="space-y-4 px-4 py-4">
        {/* ─── itens ─── */}
        <Secao titulo="Ingredientes">
          {ficha.itens.length === 0 && (
            <p className="py-2 text-sm text-slate-500">Nenhum ingrediente ainda.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {ficha.itens.map((item, i) => (
              <LinhaItem
                key={i}
                item={item}
                insumos={dados.insumos}
                fichas={dados.fichas}
                custo={resultado?.custo?.linhas[i]?.custo}
                onQuantidade={(q) =>
                  patch({ itens: ficha.itens.map((it, j) => (j === i ? { ...it, quantidade: q } : it)) })
                }
                onUnidade={(u) =>
                  patch({ itens: ficha.itens.map((it, j) => (j === i ? { ...it, unidade: u } : it)) })
                }
                onRemover={() => removerItem(i)}
              />
            ))}
          </ul>
          <button
            onClick={() => setPickerAberto(true)}
            className="mt-3 h-12 w-full rounded-xl border-2 border-dashed border-marca-500
                       font-medium text-marca-700"
          >
            + Adicionar ingrediente
          </button>
        </Secao>

        {/* ─── rendimento ─── */}
        <Secao titulo="Rendimento">
          <div className="flex items-end gap-2">
            <CampoNumero
              rotulo="Teórico"
              valor={ficha.rendimentoTeorico}
              // rendimento teorico e obrigatorio; limpar o campo vira 0 e o
              // painel de custo explica o problema em vez de travar a digitacao
              onChange={(v) => patch({ rendimentoTeorico: v ?? 0 })}
            />
            <CampoNumero
              rotulo="Real (último lote)"
              valor={ficha.rendimentoReal ?? null}
              placeholder="—"
              onChange={(v) => patch({ rendimentoReal: v })}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {UNIDADES_RENDIMENTO.map((u) => (
              <Chip
                key={u}
                ativo={ficha.unidadeRendimento === u}
                onClick={() => patch({ unidadeRendimento: u })}
              >
                {u}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            O real tem precedência. Uma lata de leite condensado rende 40 ou 55 brigadeiros —
            usar o teórico faz o custo unitário mentir.
          </p>
        </Secao>

        {/* ─── mao de obra ─── */}
        <Secao titulo="Mão de obra">
          <div className="flex items-end gap-2">
            <CampoNumero
              rotulo="Tempo (min)"
              valor={ficha.tempoPreparoMin ?? null}
              placeholder="0"
              onChange={(v) => patch({ tempoPreparoMin: v })}
            />
          </div>
          {config.salarioDesejadoCentavos === 0 ? (
            <ConfigMaoDeObra />
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {formatarBRL(config.salarioDesejadoCentavos)}/mês ÷ {config.horasMes}h ={' '}
              {formatarBRL(config.salarioDesejadoCentavos / config.horasMes)}/h ·{' '}
              <button
                onClick={() => db.config.put({ ...CONFIG_PADRAO, ...dados.config, salarioDesejadoCentavos: 0 })}
                className="underline"
              >
                alterar
              </button>
            </p>
          )}
        </Secao>

        {/* ─── perdas ─── */}
        <Secao titulo="Perdas">
          <div className="space-y-2">
            {(['preparo', 'assamento', 'defeito'] as const).map((tipo) => {
              const atual = ficha.perdas.find((p) => p.tipo === tipo)
              return (
                <div key={tipo} className="flex items-center justify-between gap-3">
                  <span className="text-sm capitalize text-slate-700">{tipo}</span>
                  <div className="flex items-center gap-1">
                    <input
                      inputMode="decimal"
                      value={atual?.percentual ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(',', '.'))
                        const outras = ficha.perdas.filter((p) => p.tipo !== tipo)
                        patch({
                          perdas:
                            e.target.value === '' || !(v > 0)
                              ? outras
                              : [...outras, { tipo, percentual: Math.min(v, 99) }],
                        })
                      }}
                      className="h-10 w-16 rounded-lg border border-slate-300 text-center tabular-nums"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Assamento em bolos costuma ser 8–12%. As perdas se multiplicam: 10% + 10% deixa 81%,
            não 80%.
          </p>
        </Secao>

        {/* ─── a conta ─── */}
        {resultado?.erro && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{resultado.erro}</div>
        )}

        {resultado?.custo && (
          <PainelCusto
            custo={resultado.custo}
            preco={resultado.preco!}
            ficha={ficha}
            canal={canal}
            onCanal={setCanal}
            onMarkup={(base, mult) => patch({ markupBase: base, markupMultiplicador: mult })}
          />
        )}
      </div>

      <PickerItem
        aberto={pickerAberto}
        onFechar={() => setPickerAberto(false)}
        insumos={dados.insumos}
        fichasBase={dados.fichas.filter((f) => f.ehBase && f.id !== ficha.id)}
        contexto={ficha.categoria ?? 'global'}
        onEscolher={adicionarItem}
        onColarReceita={() => {
          setPickerAberto(false)
          setColarAberto(true)
        }}
      />

      <ColarReceita
        aberto={colarAberto}
        onFechar={() => setColarAberto(false)}
        insumos={dados.insumos}
        onConfirmar={async (itens, novos) => {
          // insumos novos primeiro: os itens da ficha referenciam os ids deles
          if (novos.length > 0) await db.insumos.bulkPut(novos)
          await patch({ itens: [...ficha.itens, ...itens] })
          for (const it of itens) {
            if (it.tipo === 'insumo') await registrarUso(it.insumoId, 'global')
          }
          setColarAberto(false)
          mostrar(`${itens.length} ${itens.length === 1 ? 'ingrediente adicionado' : 'ingredientes adicionados'}`)
        }}
      />

      {snackbar}
    </main>
  )
}

/* ─────────────────────────── pedacos ─────────────────────────── */

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{titulo}</h2>
      {children}
    </section>
  )
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`h-10 rounded-lg border px-3 text-sm font-medium ${
        ativo ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-white text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function CampoNumero({
  rotulo,
  valor,
  placeholder,
  onChange,
}: {
  rotulo: string
  valor: number | null
  placeholder?: string
  onChange: (v: number | null) => void
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</span>
      <input
        inputMode="decimal"
        value={valor ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.')
          onChange(t === '' ? null : Number(t))
        }}
        className="h-12 w-full rounded-xl border border-slate-300 px-3 text-center tabular-nums
                   focus:border-marca-600 focus:outline-none"
      />
    </label>
  )
}

function ConfigMaoDeObra() {
  const [salario, setSalario] = useState(0)
  const [horas, setHoras] = useState(176)
  return (
    <div className="mt-3 rounded-lg bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        Falta dizer quanto vale sua hora — é o custo mais esquecido.
      </p>
      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <span className="mb-1 block text-xs text-amber-900">Quanto quer ganhar por mês</span>
          <CampoDinheiro valorCentavos={salario} onChange={setSalario} />
        </div>
        <CampoNumero rotulo="Horas/mês" valor={horas} onChange={(v) => setHoras(v ?? 176)} />
      </div>
      <button
        onClick={() =>
          db.config.put({ ...CONFIG_PADRAO, salarioDesejadoCentavos: salario, horasMes: horas })
        }
        className="mt-3 h-11 w-full rounded-lg bg-amber-600 font-semibold text-white"
      >
        Salvar
      </button>
    </div>
  )
}

function LinhaItem({
  item,
  insumos,
  fichas,
  custo,
  onQuantidade,
  onUnidade,
  onRemover,
}: {
  item: ItemFicha
  insumos: InsumoLocal[]
  fichas: FichaLocal[]
  custo?: number
  onQuantidade: (q: number) => void
  onUnidade: (u: string) => void
  onRemover: () => void
}) {
  const insumo = item.tipo === 'insumo' ? insumos.find((i) => i.id === item.insumoId) : undefined
  const sub = item.tipo === 'subficha' ? fichas.find((f) => f.id === item.fichaId) : undefined
  const nome = insumo?.nome ?? sub?.nome ?? '(removido)'

  // so unidades da mesma dimensao: converter ml->g exigiria densidade do
  // ingrediente, que e justamente a lacuna que ficou fora da v1
  const unidadesValidas = insumo
    ? UNIDADES.filter((u) => u.dimensao === insumo.dimensao)
    : UNIDADES.filter((u) => u.dimensao === 'contagem')

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
          {nome}
          {sub && <span className="ml-1.5 text-xs text-slate-500">(receita)</span>}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
          {custo !== undefined ? formatarBRL(custo) : '—'}
        </span>
        <button
          onClick={onRemover}
          aria-label={`Remover ${nome}`}
          className="shrink-0 px-1 text-slate-400"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={item.quantidade}
          onChange={(e) => onQuantidade(Number(e.target.value.replace(',', '.')) || 0)}
          className="h-10 w-20 rounded-lg border border-slate-300 text-center tabular-nums
                     focus:border-marca-600 focus:outline-none"
        />
        <div className="flex gap-1">
          {unidadesValidas.map((u) => (
            <Chip key={u.codigo} ativo={item.unidade === u.codigo} onClick={() => onUnidade(u.codigo)}>
              {u.rotulo}
            </Chip>
          ))}
        </div>
      </div>
    </li>
  )
}

/**
 * Picker com chips de frecency no topo.
 *
 * Os chips sao o caminho principal, nao o autocomplete: em estudo da NN/g a
 * sugestao de busca so e escolhida ~23% das vezes. Adicionar um insumo
 * recorrente deve custar ZERO caractere.
 */
function PickerItem({
  aberto,
  onFechar,
  insumos,
  fichasBase,
  contexto,
  onEscolher,
  onColarReceita,
}: {
  aberto: boolean
  onFechar: () => void
  insumos: InsumoLocal[]
  fichasBase: FichaLocal[]
  contexto: string
  onEscolher: (item: ItemFicha) => void
  onColarReceita: () => void
}) {
  const [busca, setBusca] = useState('')
  const [ranking, setRanking] = useState<string[]>([])

  useEffect(() => {
    if (aberto) rankearInsumos(contexto).then(setRanking)
  }, [aberto, contexto])

  const unidadePadrao = (i: InsumoLocal) =>
    i.dimensao === 'massa' ? 'g' : i.dimensao === 'volume' ? 'ml' : 'un'

  const frequentes = ranking
    .map((id) => insumos.find((i) => i.id === id))
    .filter((i): i is InsumoLocal => !!i)
    .slice(0, 8)

  const buscaNorm = normalizar(busca)
  const filtrados = busca
    ? insumos.filter((i) => i.nomeNormalizado.includes(buscaNorm)).slice(0, 30)
    : insumos.slice(0, 30)

  /**
   * O MESMO campo serve para buscar e para escrever a linha inteira.
   *
   * "farinha" filtra a lista; "250g farinha" reconhece quantidade e unidade e
   * oferece adicionar direto. Dois campos separados obrigariam a usuária a
   * decidir antes de digitar qual dos dois usar — decisão que ela não deveria
   * precisar tomar.
   */
  const interpretado = useMemo(() => {
    const t = busca.trim()
    if (!t) return null
    const r = resolverLinha(parsearLinha(t), insumos)
    return r.status === 'pronto' && r.quantidade != null ? r : null
  }, [busca, insumos])

  return (
    <BottomSheet aberto={aberto} titulo="Adicionar ingrediente" onFechar={onFechar}>
      {frequentes.length > 0 && !busca && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Você usa sempre
          </p>
          <div className="flex flex-wrap gap-2">
            {frequentes.map((i) => (
              <button
                key={i.id}
                onClick={() =>
                  onEscolher({
                    tipo: 'insumo',
                    insumoId: i.id,
                    quantidade: 1,
                    unidade: unidadePadrao(i),
                  })
                }
                className="h-11 rounded-full bg-marca-50 px-4 text-sm font-medium text-marca-700
                           ring-1 ring-marca-500/30"
              >
                {i.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder='Buscar ou escrever "250g farinha"'
        aria-label="Buscar ou escrever ingrediente"
        className="h-12 w-full rounded-xl border border-slate-300 px-4 focus:border-marca-600 focus:outline-none"
      />

      {/* Feedback de parse em tempo real: sem ver o que foi entendido, o campo
          de linguagem natural vira ansiedade em vez de velocidade. */}
      {interpretado && (
        <button
          onClick={() => {
            onEscolher({
              tipo: 'insumo',
              insumoId: interpretado.insumo!.id,
              quantidade: interpretado.quantidade!,
              unidade: interpretado.unidade!,
            })
            setBusca('')
          }}
          className="mt-2 flex w-full items-center gap-3 rounded-xl border-2 border-marca-500
                     bg-marca-50 px-4 py-3 text-left"
        >
          <span className="text-lg">+</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-marca-700">{interpretado.insumo!.nome}</span>
            <span className="block text-sm text-slate-600">
              {interpretado.quantidade} {interpretado.unidade}
              {interpretado.aviso && ` · ${interpretado.aviso}`}
            </span>
          </span>
        </button>
      )}

      <button
        onClick={onColarReceita}
        className="mt-3 h-11 w-full rounded-xl border border-dashed border-slate-300 text-sm
                   font-medium text-slate-600"
      >
        Colar receita inteira
      </button>

      {fichasBase.length > 0 && !busca && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Receitas base
          </p>
          <ul className="overflow-hidden rounded-xl border border-slate-200">
            {fichasBase.map((f) => (
              <li key={f.id} className="border-b border-slate-100 last:border-0">
                <button
                  onClick={() =>
                    onEscolher({ tipo: 'subficha', fichaId: f.id, quantidade: 1, unidade: 'un' })
                  }
                  className="w-full px-4 py-3 text-left font-medium"
                >
                  {f.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        {filtrados.map((i) => (
          <li key={i.id} className="border-b border-slate-100 last:border-0">
            <button
              onClick={() =>
                onEscolher({
                  tipo: 'insumo',
                  insumoId: i.id,
                  quantidade: 1,
                  unidade: unidadePadrao(i),
                })
              }
              className="w-full px-4 py-3 text-left"
            >
              <span className="font-medium text-slate-900">{i.nome}</span>
              <span className="ml-2 text-sm text-slate-500">{i.categoria}</span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}

function PainelCusto({
  custo,
  preco,
  ficha,
  canal,
  onCanal,
  onMarkup,
}: {
  custo: NonNullable<ReturnType<typeof calcularCustoFicha>>
  preco: ReturnType<typeof calcularPreco>
  ficha: FichaLocal
  canal: (typeof CANAIS)[number]
  onCanal: (c: (typeof CANAIS)[number]) => void
  onMarkup: (base: MarkupBase, mult: number) => void
}) {
  const [aberto, setAberto] = useState(false)
  const precoCanal = aplicarTaxaDeCanal(preco.precoUnitario, canal.taxa)

  return (
    <section className="rounded-xl border border-marca-500/40 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Preço por {ficha.unidadeRendimento}
        </span>
        <span className="text-3xl font-bold tabular-nums text-marca-700">
          {formatarBRL(precoCanal)}
        </span>
      </div>

      <div className="mt-2 flex justify-between text-sm text-slate-600">
        <span>Custo {formatarBRL(preco.custoUnitario)}</span>
        <span>
          Margem {pct(preco.margemPercentual)} · CMV {pct(preco.cmvPercentual)}
        </span>
      </div>

      {/* CMV saudavel para doce artesanal e 25-35% (referencia SEBRAE) */}
      {preco.cmvPercentual > 35 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          CMV acima de 35%. Para doce artesanal a referência é 25–35%.
        </p>
      )}

      {/* markup NUNCA sem a base: "3x" sozinho nao quer dizer nada.
          E CUIDADO: markupParaMargem() so equivale a margem real quando a base
          e o custo TOTAL. Com base "materiais" a mao de obra entra por fora, e
          exibir a conversao teorica ao lado da margem real mostraria dois
          numeros contraditorios na mesma tela — reproduzindo justamente a
          confusao markup/margem que este produto existe para evitar. */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Multiplicador {pt(ficha.markupMultiplicador)}× sobre{' '}
          {ficha.markupBase === 'materiais' ? (
            <>
              <strong>materiais</strong>, com mão de obra somada por fora
            </>
          ) : (
            <>
              <strong>custo total</strong> = {pct(markupParaMargem(ficha.markupMultiplicador))} de
              margem
            </>
          )}
        </p>
        <div className="flex gap-1.5">
          {[2, 2.5, 3].map((m) => (
            <Chip
              key={m}
              ativo={ficha.markupMultiplicador === m}
              onClick={() => onMarkup(ficha.markupBase, m)}
            >
              {pt(m)}×
            </Chip>
          ))}
          <Chip
            ativo={ficha.markupBase === 'custo_total'}
            onClick={() =>
              onMarkup(
                ficha.markupBase === 'materiais' ? 'custo_total' : 'materiais',
                ficha.markupMultiplicador,
              )
            }
          >
            {ficha.markupBase === 'materiais' ? 'sobre materiais' : 'sobre custo total'}
          </Chip>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {CANAIS.map((c) => (
          <Chip key={c.nome} ativo={canal.nome === c.nome} onClick={() => onCanal(c)}>
            {c.nome}
          </Chip>
        ))}
      </div>
      {canal.taxa > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {formatarBRL(preco.precoUnitario)} ÷ (1 − {pt(canal.taxa)}%) = {formatarBRL(precoCanal)}. Somar
          a taxa não recomporia a margem.
        </p>
      )}

      {/* "mostre a conta": a planilha ganha do app porque a pessoa VE a formula */}
      <button
        onClick={() => setAberto((v) => !v)}
        className="mt-3 w-full border-t border-slate-100 pt-3 text-left text-sm font-medium text-marca-700"
      >
        {aberto ? 'Esconder a conta' : 'Ver a conta'}
      </button>

      {aberto && (
        <ul className="mt-2 space-y-1 text-sm">
          {custo.linhas.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-slate-600">
                {l.rotulo} <span className="text-slate-400">{l.detalhe}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatarBRL(l.custo)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-slate-100 pt-1 font-semibold">
            <span>Total do lote</span>
            <span className="tabular-nums">{formatarBRL(custo.total)}</span>
          </li>
          <li className="flex justify-between text-slate-600">
            <span>
              ÷ {pt(Number(custo.rendimentoEfetivo.toFixed(2)))} {ficha.unidadeRendimento}
              {custo.rendimentoEfetivo !== custo.rendimentoBruto && ' (após perdas)'}
            </span>
            <span className="tabular-nums">{formatarBRL(custo.custoUnitario)}</span>
          </li>
        </ul>
      )}
    </section>
  )
}
