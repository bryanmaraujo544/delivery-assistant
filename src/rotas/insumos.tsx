import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { BottomSheet } from '../componentes/BottomSheet'
import { CampoDinheiro } from '../componentes/CampoDinheiro'
import { useSnackbar } from '../componentes/Snackbar'
import {
  UNIDADES,
  custoExibicao,
  custoPorUnidadeBase,
  db,
  normalizar,
  unidadePorCodigo,
  type InsumoLocal,
} from '../db/local'
import { construirSeed } from '../db/seed-insumos'
import { formatarBRL } from '../dominio/dinheiro'

const rascunhoVazio = {
  nome: '',
  categoria: '',
  embalagemQuantidade: '1',
  embalagemUnidade: 'kg',
  precoEmbalagemCentavos: 0,
  fatorCorrecao: '1',
}
type Rascunho = typeof rascunhoVazio

/* ─────────────────────────── tela ─────────────────────────── */

export function Insumos() {
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<InsumoLocal | null>(null)
  const [sheetAberto, setSheetAberto] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoVazio)
  const { mostrar, elemento: snackbar } = useSnackbar()

  const insumos = useLiveQuery(
    () => db.insumos.filter((i) => !i.excluidoEm).toArray(),
    [],
  )

  const buscaNorm = normalizar(busca)
  const filtrados = useMemo(() => {
    const lista = (insumos ?? []).filter((i) => i.nomeNormalizado.includes(buscaNorm))
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [insumos, buscaNorm])

  const agrupados = useMemo(() => {
    const mapa = new Map<string, InsumoLocal[]>()
    for (const i of filtrados) {
      const k = i.categoria ?? 'Sem categoria'
      mapa.set(k, [...(mapa.get(k) ?? []), i])
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  }, [filtrados])

  /** duplicata de insumo destroi relatorio de custo — avisa antes de criar */
  const duplicata = useMemo(() => {
    const n = normalizar(rascunho.nome)
    if (!n) return null
    return (insumos ?? []).find((i) => i.nomeNormalizado === n && i.id !== editando?.id) ?? null
  }, [rascunho.nome, insumos, editando])

  function abrirNovo(nomeInicial = '') {
    setEditando(null)
    setRascunho({ ...rascunhoVazio, nome: nomeInicial })
    setSheetAberto(true)
  }

  function abrirEdicao(i: InsumoLocal) {
    setEditando(i)
    setRascunho({
      nome: i.nome,
      categoria: i.categoria ?? '',
      embalagemQuantidade: String(i.embalagemQuantidade),
      embalagemUnidade: i.embalagemUnidade,
      precoEmbalagemCentavos: i.precoEmbalagemCentavos,
      fatorCorrecao: String(i.fatorCorrecao),
    })
    setSheetAberto(true)
  }

  async function salvar() {
    const u = unidadePorCodigo(rascunho.embalagemUnidade)
    const qtd = Number(rascunho.embalagemQuantidade.replace(',', '.'))
    const fc = Number(rascunho.fatorCorrecao.replace(',', '.'))
    if (!rascunho.nome.trim() || !(qtd > 0) || !(fc >= 1)) return

    const registro: InsumoLocal = {
      id: editando?.id ?? crypto.randomUUID(),
      nome: rascunho.nome.trim(),
      nomeNormalizado: normalizar(rascunho.nome),
      categoria: rascunho.categoria.trim() || undefined,
      embalagemQuantidade: qtd,
      embalagemUnidade: u.codigo,
      precoEmbalagemCentavos: rascunho.precoEmbalagemCentavos,
      quantidadeBase: qtd * u.fatorBase,
      dimensao: u.dimensao,
      fatorCorrecao: fc,
      // editar o preco confirma o valor: deixa de ser estimativa do seed
      precoEstimado: editando ? false : false,
      origemSeed: editando?.origemSeed ?? false,
      atualizadoEm: Date.now(),
      excluidoEm: null,
    }
    await db.insumos.put(registro)
    setSheetAberto(false)
    mostrar(editando ? 'Insumo atualizado' : `"${registro.nome}" adicionado`)
  }

  /** Soft delete + desfazer. Nunca modal "tem certeza?" para acao rotineira. */
  async function excluir(i: InsumoLocal) {
    await db.insumos.update(i.id, { excluidoEm: Date.now() })
    setSheetAberto(false)
    mostrar(`"${i.nome}" removido`, async () => {
      await db.insumos.update(i.id, { excluidoEm: null })
    })
  }

  async function aplicarSeed() {
    await db.insumos.bulkPut(construirSeed())
    mostrar('Catálogo inicial carregado. Confirme os preços conforme comprar.')
  }

  const carregando = insumos === undefined
  const vazio = !carregando && (insumos?.length ?? 0) === 0

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">Insumos</h1>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar insumo"
          aria-label="Buscar insumo"
          className="mt-3 h-12 w-full rounded-xl border border-slate-300 px-4
                     focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
        />
      </header>

      <div className="flex-1 px-4 pb-32">
        {carregando && <p className="py-10 text-center text-slate-400">Carregando…</p>}

        {vazio && <EstadoVazio onCarregarSeed={aplicarSeed} onCriar={() => abrirNovo()} />}

        {!vazio &&
          agrupados.map(([categoria, itens]) => (
            <section key={categoria} className="mt-5">
              <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {categoria}
              </h2>
              <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {itens.map((i) => (
                  <LinhaInsumo key={i.id} insumo={i} onClick={() => abrirEdicao(i)} />
                ))}
              </ul>
            </section>
          ))}

        {/* criacao inline: o nome digitado na busca vira o nome do novo insumo,
            sem reescrever nada. Elimina a bifurcacao "existe? se nao, vou onde?" */}
        {!vazio && busca && filtrados.length === 0 && (
          <button
            onClick={() => abrirNovo(busca)}
            className="mt-5 w-full rounded-xl border-2 border-dashed border-marca-500
                       bg-white px-4 py-4 text-left font-medium text-marca-700"
          >
            + Criar “{busca}”
          </button>
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-12 mx-auto max-w-md bg-gradient-to-t from-slate-50
                   via-slate-50 to-transparent px-4 pt-6 pb-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => abrirNovo()}
          className="h-14 w-full rounded-xl bg-marca-600 font-semibold text-white shadow-lg
                     active:bg-marca-700"
        >
          Adicionar insumo
        </button>
      </div>

      <SheetInsumo
        aberto={sheetAberto}
        editando={editando}
        rascunho={rascunho}
        duplicata={duplicata}
        onChange={setRascunho}
        onFechar={() => setSheetAberto(false)}
        onSalvar={salvar}
        onExcluir={editando ? () => excluir(editando) : undefined}
        onUsarExistente={(i) => {
          setSheetAberto(false)
          abrirEdicao(i)
        }}
      />

      {snackbar}
    </main>
  )
}

/* ─────────────────────────── pedacos ─────────────────────────── */

function LinhaInsumo({ insumo, onClick }: { insumo: InsumoLocal; onClick: () => void }) {
  const custo = custoExibicao(custoPorUnidadeBase(insumo), insumo.dimensao)
  return (
    <li className="border-b border-slate-100 last:border-0">
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{insumo.nome}</p>
          <p className="text-sm text-slate-500">
            {insumo.embalagemQuantidade} {insumo.embalagemUnidade} ·{' '}
            {formatarBRL(insumo.precoEmbalagemCentavos)}
            {insumo.fatorCorrecao !== 1 && (
              <span className="ml-1 text-amber-700">· FC {insumo.fatorCorrecao}</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums text-slate-900">{formatarBRL(custo.valor)}</p>
          <p className="text-xs text-slate-500">por {custo.unidade}</p>
        </div>
        {insumo.precoEstimado && (
          <span
            title="Preço estimado — confirme"
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          >
            est.
          </span>
        )}
      </button>
    </li>
  )
}

function EstadoVazio({
  onCarregarSeed,
  onCriar,
}: {
  onCarregarSeed: () => void
  onCriar: () => void
}) {
  return (
    <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Comece com o catálogo pronto</h2>
      <p className="mt-2 text-sm text-slate-600">
        Carregamos os insumos mais usados em confeitaria, já com tamanho de embalagem. Você só
        ajusta os preços conforme for comprando.
      </p>
      <button
        onClick={onCarregarSeed}
        className="mt-5 h-12 w-full rounded-xl bg-marca-600 font-semibold text-white"
      >
        Carregar catálogo inicial
      </button>
      <button onClick={onCriar} className="mt-2 h-12 w-full rounded-xl text-slate-600">
        Prefiro cadastrar do zero
      </button>
    </div>
  )
}

function SheetInsumo({
  aberto,
  editando,
  rascunho,
  duplicata,
  onChange,
  onFechar,
  onSalvar,
  onExcluir,
  onUsarExistente,
}: {
  aberto: boolean
  editando: InsumoLocal | null
  rascunho: Rascunho
  duplicata: InsumoLocal | null
  onChange: (r: Rascunho) => void
  onFechar: () => void
  onSalvar: () => void
  onExcluir?: () => void
  onUsarExistente: (i: InsumoLocal) => void
}) {
  const [mostrarFC, setMostrarFC] = useState(false)
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => onChange({ ...rascunho, [k]: v })

  const u = UNIDADES.find((x) => x.codigo === rascunho.embalagemUnidade)
  const qtd = Number(rascunho.embalagemQuantidade.replace(',', '.'))
  const fc = Number(rascunho.fatorCorrecao.replace(',', '.'))
  const previewValido = !!u && qtd > 0 && fc >= 1
  const porBase = previewValido ? (rascunho.precoEmbalagemCentavos / (qtd * u!.fatorBase)) * fc : 0
  // exibe por kg/L/un, nunca por grama — ver custoExibicao em db/local.ts
  const preview = custoExibicao(porBase, u?.dimensao ?? 'contagem')

  return (
    <BottomSheet
      aberto={aberto}
      titulo={editando ? 'Editar insumo' : 'Novo insumo'}
      onFechar={onFechar}
      rodape={
        <div className="flex gap-2">
          {onExcluir && (
            <button
              onClick={onExcluir}
              className="h-12 rounded-xl px-4 font-medium text-red-600 hover:bg-red-50"
            >
              Excluir
            </button>
          )}
          {/* botao explicito mesmo com salvamento imediato: a evidencia mostra
              que a pessoa entra em panico sem um "pronto" para tocar */}
          <button
            onClick={onSalvar}
            className="h-12 flex-1 rounded-xl bg-marca-600 font-semibold text-white
                       active:bg-marca-700"
          >
            Concluir
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <Campo rotulo="Nome" htmlFor="nome">
          <input
            id="nome"
            value={rascunho.nome}
            onChange={(e) => set('nome', e.target.value)}
            autoFocus={!editando}
            className="h-12 w-full rounded-xl border border-slate-300 px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
          {duplicata && (
            <button
              onClick={() => onUsarExistente(duplicata)}
              className="mt-2 w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900"
            >
              <strong>“{duplicata.nome}” já existe.</strong> Tocar aqui abre o existente em vez de
              criar duplicado.
            </button>
          )}
        </Campo>

        <Campo rotulo="Como você compra" htmlFor="qtd">
          <div className="flex gap-2">
            <input
              id="qtd"
              inputMode="decimal"
              value={rascunho.embalagemQuantidade}
              onChange={(e) => set('embalagemQuantidade', e.target.value)}
              className="h-12 w-24 rounded-xl border border-slate-300 px-3 text-center
                         tabular-nums focus:border-marca-600 focus:outline-none"
            />
            {/* chips no lugar de dropdown: menos opcoes permite alvos maiores
                e mais proximos — Hick e Fitts ao mesmo tempo */}
            <div className="flex flex-1 gap-1.5" role="group" aria-label="Unidade">
              {UNIDADES.map((un) => (
                <button
                  key={un.codigo}
                  onClick={() => set('embalagemUnidade', un.codigo)}
                  aria-pressed={rascunho.embalagemUnidade === un.codigo}
                  className={`h-12 flex-1 rounded-xl border text-sm font-medium ${
                    rascunho.embalagemUnidade === un.codigo
                      ? 'border-marca-600 bg-marca-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {un.rotulo}
                </button>
              ))}
            </div>
          </div>
        </Campo>

        <Campo rotulo="Preço da embalagem" htmlFor="preco">
          <CampoDinheiro
            id="preco"
            valorCentavos={rascunho.precoEmbalagemCentavos}
            onChange={(c) => set('precoEmbalagemCentavos', c)}
          />
        </Campo>

        {/* FC fica colapsado: e 1,00 para praticamente todo insumo de
            confeitaria. So importa para frutas e ovo com gema/clara separada.
            Obrigatorio, criaria atrito em 90% dos casos por causa de 10%. */}
        {!mostrarFC && fc === 1 ? (
          <button
            onClick={() => setMostrarFC(true)}
            className="text-sm font-medium text-marca-700 underline"
          >
            Tem perda ao descascar? (fruta)
          </button>
        ) : (
          <Campo
            rotulo="Fator de correção"
            htmlFor="fc"
            dica="Quanto do peso comprado vira aproveitável. Maracujá ≈ 2,61; farinha e açúcar = 1."
          >
            <input
              id="fc"
              inputMode="decimal"
              value={rascunho.fatorCorrecao}
              onChange={(e) => set('fatorCorrecao', e.target.value)}
              className="h-12 w-28 rounded-xl border border-slate-300 px-3 text-center tabular-nums
                         focus:border-marca-600 focus:outline-none"
            />
          </Campo>
        )}

        {/* "mostre a conta": a planilha ganha do app porque a pessoa VE a
            formula. O custo por unidade e computado, nunca digitado. */}
        <div className="rounded-xl bg-slate-100 p-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Custo calculado
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatarBRL(preview.valor)}{' '}
            <span className="text-base font-normal text-slate-500">por {preview.unidade}</span>
          </p>
          {previewValido && (
            <p className="mt-1 text-xs text-slate-500">
              {formatarBRL(rascunho.precoEmbalagemCentavos)} ÷ {qtd} {u!.rotulo}
              {fc !== 1 && ` × ${String(fc).replace('.', ',')} (fator de correção)`}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function Campo({
  rotulo,
  htmlFor,
  dica,
  children,
}: {
  rotulo: string
  htmlFor: string
  dica?: string
  children: React.ReactNode
}) {
  return (
    <div>
      {/* rotulo ACIMA do campo, nunca placeholder-como-rotulo (NN/g) */}
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {rotulo}
      </label>
      {children}
      {dica && <p className="mt-1.5 text-xs text-slate-500">{dica}</p>}
    </div>
  )
}
