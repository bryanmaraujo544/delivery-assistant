import { useMemo, useState } from 'react'
import { UNIDADES, normalizar, type InsumoLocal } from '../db/local'
import type { ItemFicha } from '../dominio/custo'
import { parsearReceita, resolverLinha, type Resolucao } from '../dominio/parser-ingrediente'
import { BottomSheet } from './BottomSheet'

/**
 * Colar receita inteira.
 *
 * O maior salto isolado de produtividade disponivel: uma receita de 12
 * ingredientes cai de ~12 fluxos de cadastro para UMA colagem e UMA revisao.
 * E ataca o comportamento real — receita de confeiteira quase sempre ja existe
 * escrita em algum lugar (WhatsApp, Instagram, caderno).
 *
 * A tela de revisao NAO e burocracia: o parser acerta a maioria, mas quando
 * erra, gravar sem conferir seria pior que nao ter o recurso. Cada linha diz
 * exatamente o que foi entendido.
 */

interface Props {
  aberto: boolean
  onFechar: () => void
  insumos: InsumoLocal[]
  onConfirmar: (itens: ItemFicha[], novos: InsumoLocal[]) => void
}

interface LinhaRevisao {
  chave: number
  resolucao: Resolucao
  /** entra na ficha? */
  incluir: boolean
  /** quando ambíguo, qual candidato a usuária escolheu */
  insumoEscolhidoId: string | null
  /** editável: o parser pode ter errado, ou ser medida caseira */
  quantidade: string
  unidade: string
}

export function ColarReceita({ aberto, onFechar, insumos, onConfirmar }: Props) {
  const [texto, setTexto] = useState('')
  const [revisando, setRevisando] = useState(false)
  const [linhas, setLinhas] = useState<LinhaRevisao[]>([])

  function analisar() {
    const parseadas = parsearReceita(texto).filter((l) => !l.ehTitulo)
    setLinhas(
      parseadas.map((l, i) => {
        const r = resolverLinha(l, insumos)
        return {
          chave: i,
          resolucao: r,
          // 'novo' entra desmarcado: criar insumo sem preço é decisão da
          // usuária, não algo que a gente faz por ela sem avisar
          incluir: r.status === 'pronto',
          insumoEscolhidoId: r.insumo?.id ?? null,
          quantidade: r.quantidade != null ? String(r.quantidade) : '',
          unidade: r.unidade ?? 'g',
        }
      }),
    )
    setRevisando(true)
  }

  const prontas = linhas.filter((l) => l.incluir).length

  function confirmar() {
    const itens: ItemFicha[] = []
    const novos: InsumoLocal[] = []

    for (const l of linhas) {
      if (!l.incluir) continue
      const qtd = Number(l.quantidade.replace(',', '.'))
      if (!(qtd > 0)) continue

      let insumoId = l.insumoEscolhidoId
      if (!insumoId) {
        // insumo novo: embalagem padrão de 1 unidade da dimensão parseada, com
        // preço zerado e sinalizado. A usuária corrige no catálogo depois —
        // melhor entrar sem preço do que travar a importação inteira.
        const u = UNIDADES.find((x) => x.codigo === l.unidade) ?? UNIDADES[1]!
        const novo: InsumoLocal = {
          id: crypto.randomUUID(),
          nome: l.resolucao.linha.descricao,
          nomeNormalizado: normalizar(l.resolucao.linha.descricao),
          categoria: 'Importados',
          embalagemQuantidade: 1,
          embalagemUnidade: u.dimensao === 'massa' ? 'kg' : u.dimensao === 'volume' ? 'l' : 'un',
          precoEmbalagemCentavos: 0,
          quantidadeBase: u.dimensao === 'contagem' ? 1 : 1000,
          dimensao: u.dimensao,
          fatorCorrecao: 1,
          precoEstimado: true,
          origemSeed: false,
          atualizadoEm: Date.now(),
          excluidoEm: null,
        }
        novos.push(novo)
        insumoId = novo.id
      }
      itens.push({ tipo: 'insumo', insumoId, quantidade: qtd, unidade: l.unidade })
    }

    onConfirmar(itens, novos)
    setTexto('')
    setLinhas([])
    setRevisando(false)
  }

  function fechar() {
    setRevisando(false)
    onFechar()
  }

  return (
    <BottomSheet
      aberto={aberto}
      titulo={revisando ? 'Confira o que entendi' : 'Colar receita'}
      onFechar={fechar}
      rodape={
        revisando ? (
          <div className="flex gap-2">
            <button onClick={() => setRevisando(false)} className="h-12 rounded-xl px-4 text-slate-600">
              Voltar
            </button>
            <button
              onClick={confirmar}
              disabled={prontas === 0}
              className="h-12 flex-1 rounded-xl bg-marca-600 font-semibold text-white disabled:opacity-50"
            >
              Adicionar {prontas} {prontas === 1 ? 'item' : 'itens'}
            </button>
          </div>
        ) : (
          <button
            onClick={analisar}
            disabled={texto.trim().length === 0}
            className="h-12 w-full rounded-xl bg-marca-600 font-semibold text-white disabled:opacity-50"
          >
            Analisar
          </button>
        )
      }
    >
      {!revisando ? (
        <div>
          <p className="mb-3 text-sm text-slate-600">
            Cole a lista de ingredientes do WhatsApp, do caderno, de onde estiver. Uma linha por
            ingrediente.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={9}
            autoFocus
            placeholder={'250g farinha de trigo\n1 lata de leite condensado\n3 ovos'}
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-sm
                       focus:border-marca-600 focus:outline-none"
          />
          <button
            onClick={async () => {
              try {
                setTexto(await navigator.clipboard.readText())
              } catch {
                // sem permissão de área de transferência: o textarea continua lá
              }
            }}
            className="mt-2 text-sm font-medium text-marca-700 underline"
          >
            Colar da área de transferência
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {linhas.map((l, idx) => (
            <LinhaRevisada
              key={l.chave}
              linha={l}
              insumos={insumos}
              onMudar={(novo) => setLinhas((atual) => atual.map((x, i) => (i === idx ? novo : x)))}
            />
          ))}
        </ul>
      )}
    </BottomSheet>
  )
}

const CORES: Record<Resolucao['status'], string> = {
  pronto: 'bg-emerald-100 text-emerald-800',
  ambiguo: 'bg-amber-100 text-amber-900',
  revisar: 'bg-amber-100 text-amber-900',
  novo: 'bg-slate-200 text-slate-700',
}
const ROTULOS: Record<Resolucao['status'], string> = {
  pronto: 'ok',
  ambiguo: 'qual?',
  revisar: 'confira',
  novo: 'novo',
}

function LinhaRevisada({
  linha,
  insumos,
  onMudar,
}: {
  linha: LinhaRevisao
  insumos: InsumoLocal[]
  onMudar: (l: LinhaRevisao) => void
}) {
  const { resolucao } = linha
  const escolhido = insumos.find((i) => i.id === linha.insumoEscolhidoId)
  const unidadesValidas = escolhido
    ? UNIDADES.filter((u) => u.dimensao === escolhido.dimensao)
    : UNIDADES

  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={linha.incluir}
          onChange={(e) => onMudar({ ...linha, incluir: e.target.checked })}
          aria-label={`Incluir ${resolucao.linha.descricao}`}
          className="mt-1 size-5 shrink-0 accent-marca-600"
        />
        <div className="min-w-0 flex-1">
          {/* o texto original sempre visível: é como a usuária confere que a
              gente entendeu a linha dela, e não outra coisa */}
          <p className="truncate text-xs text-slate-400">{resolucao.linha.original}</p>
          <p className="font-medium text-slate-900">
            {escolhido?.nome ?? resolucao.linha.descricao}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CORES[resolucao.status]}`}>
          {ROTULOS[resolucao.status]}
        </span>
      </div>

      {resolucao.aviso && (
        <p className="mt-1.5 pl-7 text-xs text-slate-500">{resolucao.aviso}</p>
      )}

      {resolucao.status === 'ambiguo' && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
          {resolucao.candidatos.map((c) => (
            <button
              key={c.id}
              onClick={() => onMudar({ ...linha, insumoEscolhidoId: c.id, incluir: true })}
              className={`h-9 rounded-lg border px-3 text-sm ${
                linha.insumoEscolhidoId === c.id
                  ? 'border-marca-600 bg-marca-600 text-white'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 pl-7">
        <input
          inputMode="decimal"
          value={linha.quantidade}
          onChange={(e) => onMudar({ ...linha, quantidade: e.target.value })}
          placeholder="qtd"
          className="h-10 w-20 rounded-lg border border-slate-300 text-center tabular-nums
                     focus:border-marca-600 focus:outline-none"
        />
        <div className="flex gap-1">
          {unidadesValidas.map((u) => (
            <button
              key={u.codigo}
              onClick={() => onMudar({ ...linha, unidade: u.codigo })}
              className={`h-10 rounded-lg border px-2.5 text-sm ${
                linha.unidade === u.codigo
                  ? 'border-marca-600 bg-marca-600 text-white'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              {u.rotulo}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
