import { useState } from 'react'
import { db, normalizar, type FichaLocal, type InsumoLocal } from '../db/local'
import { construirSeed } from '../db/seed-insumos'
import type { ItemFicha } from '../dominio/custo'

/**
 * Onboarding de UMA pergunta.
 *
 * A tela vazia pedindo 40 insumos e o maior ponto de abandono do nicho. Um
 * wizard de varios passos so troca um atrito por outro: a pessoa ainda nao viu
 * valor nenhum e ja esta respondendo formulario.
 *
 * Uma pergunta basta para escolher a receita de exemplo, e e a receita de
 * exemplo que entrega o valor: ela ve o custo calculado ANTES de cadastrar
 * qualquer coisa, com numeros que reconhece.
 */

interface ReceitaExemplo {
  nome: string
  categoria: string
  rendimentoTeorico: number
  rendimentoReal?: number
  unidadeRendimento: string
  tempoPreparoMin: number
  /** [nome do insumo no catálogo semente, quantidade, unidade] */
  itens: [string, number, string][]
}

interface Perfil {
  id: string
  rotulo: string
  descricao: string
  receitas: ReceitaExemplo[]
}

const PERFIS: Perfil[] = [
  {
    id: 'doces',
    rotulo: 'Doces de festa',
    descricao: 'Brigadeiro, beijinho, docinhos por cento',
    receitas: [
      {
        nome: 'Brigadeiro tradicional',
        categoria: 'Doces',
        // receita-base do nicho: calibrada para fechar a lata
        rendimentoTeorico: 55,
        rendimentoReal: 50,
        unidadeRendimento: 'un',
        tempoPreparoMin: 40,
        itens: [
          ['Leite condensado', 395, 'g'],
          ['Manteiga sem sal', 25, 'g'],
          ['Chocolate em pó 50%', 40, 'g'],
          ['Granulado macio', 100, 'g'],
          ['Forminha de papel', 50, 'un'],
        ],
      },
    ],
  },
  {
    id: 'bolos',
    rotulo: 'Bolos',
    descricao: 'Bolo caseiro, bolo no pote, bolo decorado',
    receitas: [
      {
        nome: 'Bolo de cenoura (massa)',
        categoria: 'Bolos',
        rendimentoTeorico: 1,
        unidadeRendimento: 'un',
        tempoPreparoMin: 50,
        itens: [
          ['Farinha de trigo', 250, 'g'],
          ['Açúcar refinado', 200, 'g'],
          ['Ovo', 3, 'un'],
          ['Óleo de soja', 100, 'ml'],
          ['Fermento químico em pó', 10, 'g'],
        ],
      },
      {
        nome: 'Cobertura de chocolate',
        categoria: 'Bolos',
        rendimentoTeorico: 1,
        unidadeRendimento: 'un',
        tempoPreparoMin: 15,
        itens: [
          ['Leite condensado', 395, 'g'],
          ['Chocolate em pó 50%', 60, 'g'],
          ['Manteiga sem sal', 20, 'g'],
        ],
      },
    ],
  },
  {
    id: 'potes',
    rotulo: 'Bolo no pote',
    descricao: 'Vendido por unidade, com embalagem',
    receitas: [
      {
        nome: 'Bolo no pote de chocolate',
        categoria: 'Potes',
        rendimentoTeorico: 10,
        unidadeRendimento: 'un',
        tempoPreparoMin: 60,
        itens: [
          ['Farinha de trigo', 300, 'g'],
          ['Açúcar refinado', 250, 'g'],
          ['Ovo', 4, 'un'],
          ['Leite condensado', 395, 'g'],
          ['Chocolate em pó 50%', 80, 'g'],
          ['Pote 250 ml com tampa', 10, 'un'],
        ],
      },
    ],
  },
]

interface Props {
  onPronto: (fichaId: string | null) => void
}

export function Comecar({ onPronto }: Props) {
  const [ocupado, setOcupado] = useState(false)

  async function escolher(perfil: Perfil) {
    setOcupado(true)

    // O catálogo inteiro entra, não só o do perfil: faltar um insumo na hora
    // de montar a receita dela custa mais caro do que ver 57 itens agrupados.
    const insumos = construirSeed()
    await db.insumos.bulkPut(insumos)

    const acharId = (nome: string) =>
      insumos.find((i: InsumoLocal) => i.nomeNormalizado === normalizar(nome))?.id

    const fichas: FichaLocal[] = perfil.receitas.map((r) => ({
      id: crypto.randomUUID(),
      nome: r.nome,
      categoria: r.categoria,
      rendimentoTeorico: r.rendimentoTeorico,
      rendimentoReal: r.rendimentoReal ?? null,
      unidadeRendimento: r.unidadeRendimento,
      tempoPreparoMin: r.tempoPreparoMin,
      ehBase: perfil.receitas.length > 1,
      itens: r.itens
        .map(([nome, qtd, un]): ItemFicha | null => {
          const id = acharId(nome)
          return id ? { tipo: 'insumo', insumoId: id, quantidade: qtd, unidade: un } : null
        })
        .filter((i): i is ItemFicha => i !== null),
      perdas: [],
      markupBase: 'materiais',
      markupMultiplicador: 2.5,
      atualizadoEm: Date.now(),
      excluidoEm: null,
    }))

    await db.fichas.bulkPut(fichas)
    onPronto(fichas[0]?.id ?? null)
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-slate-900">O que você mais faz?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Uma pergunta só. Já deixamos uma receita pronta para você ver o custo funcionando.
      </p>

      <div className="mt-5 space-y-2">
        {PERFIS.map((p) => (
          <button
            key={p.id}
            disabled={ocupado}
            onClick={() => escolher(p)}
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left
                       active:border-marca-600 disabled:opacity-60"
          >
            <span className="block font-semibold text-slate-900">{p.rotulo}</span>
            <span className="block text-sm text-slate-500">{p.descricao}</span>
          </button>
        ))}
      </div>

      <button
        disabled={ocupado}
        onClick={() => onPronto(null)}
        className="mt-3 h-12 w-full rounded-xl text-slate-500"
      >
        Prefiro começar do zero
      </button>

      {/* Os preços do catálogo são estimativa e a UI diz isso — prometer preço
          exato que não temos seria enganar logo no primeiro contato. */}
      <p className="mt-4 text-center text-xs text-slate-400">
        O catálogo vem com preços estimados. Você ajusta conforme for comprando.
      </p>
    </div>
  )
}
