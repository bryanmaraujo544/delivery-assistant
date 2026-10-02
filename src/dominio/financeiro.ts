import type { Centavos } from './dinheiro'
import type { Venda } from './venda'

/**
 * Despesas e resultado do mes.
 *
 * O resultado segue a DRE simplificada que o SEBRAE recomenda para pequeno
 * negocio — cinco linhas, nessa ordem:
 *
 *   faturamento
 *   − custo dos produtos      (ingredientes, embalagens)
 *   − despesas variaveis      (taxa de cartao, entrega: crescem com a venda)
 *   = margem de contribuicao  (o que sobra para pagar a estrutura)
 *   − despesas fixas          (aluguel, luz, parcelas: existem vendendo ou nao)
 *   = resultado
 *
 * Separar fixa de variavel nao e preciosismo: e o que permite calcular o ponto
 * de equilibrio, a pergunta que a dona da loja realmente faz — "quanto preciso
 * vender para o mes fechar?".
 *
 * O CUSTO DOS PRODUTOS VEM DAS COMPRAS LANCADAS, nao das fichas tecnicas. A
 * ficha ja embute mao de obra e rateio de custo fixo; subtrair o custo da
 * ficha E as despesas contaria luz e salario duas vezes. Compra lancada e o
 * dinheiro que de fato saiu.
 */

export type TipoDespesa = 'custo' | 'variavel' | 'fixa'

export interface CategoriaDespesa {
  codigo: string
  rotulo: string
  tipo: TipoDespesa
}

/** A pessoa escolhe a categoria; o tipo vem junto e ela nunca precisa saber o que e "despesa variavel". */
export const CATEGORIAS: CategoriaDespesa[] = [
  { codigo: 'insumos', rotulo: 'Ingredientes', tipo: 'custo' },
  { codigo: 'embalagens', rotulo: 'Embalagens', tipo: 'custo' },
  { codigo: 'taxas', rotulo: 'Taxas de cartão e apps', tipo: 'variavel' },
  { codigo: 'entregas', rotulo: 'Entregas', tipo: 'variavel' },
  { codigo: 'aluguel', rotulo: 'Aluguel', tipo: 'fixa' },
  { codigo: 'luz', rotulo: 'Luz', tipo: 'fixa' },
  { codigo: 'agua', rotulo: 'Água', tipo: 'fixa' },
  { codigo: 'gas', rotulo: 'Gás', tipo: 'fixa' },
  { codigo: 'internet', rotulo: 'Internet e telefone', tipo: 'fixa' },
  { codigo: 'pessoal', rotulo: 'Funcionários e pró-labore', tipo: 'fixa' },
  { codigo: 'equipamentos', rotulo: 'Equipamentos e ferramentas', tipo: 'fixa' },
  { codigo: 'impostos', rotulo: 'Impostos e contador', tipo: 'fixa' },
  { codigo: 'marketing', rotulo: 'Divulgação', tipo: 'fixa' },
  { codigo: 'manutencao', rotulo: 'Manutenção e limpeza', tipo: 'fixa' },
  { codigo: 'outros', rotulo: 'Outros', tipo: 'fixa' },
]

/** Categoria desconhecida (aparelho desatualizado) cai em "Outros" em vez de sumir da conta. */
export const categoriaPorCodigo = (codigo: string): CategoriaDespesa =>
  CATEGORIAS.find((c) => c.codigo === codigo) ?? CATEGORIAS[CATEGORIAS.length - 1]!

export interface Despesa {
  id: string
  descricao: string
  categoria: string
  valorCentavos: Centavos
  /** mes de competencia, 'AAAA-MM' — a conta de luz de outubro e de outubro mesmo paga em novembro */
  mes: string
  /** volta todo mes (aluguel, luz). O valor e confirmado a cada mes, porque conta varia */
  repete: boolean
  /** liga as ocorrencias da mesma despesa entre os meses (repeticao ou parcelas) */
  serieId: string
  parcela?: number | null
  parcelas?: number | null
  /** null = ainda nao paga */
  pagoEm?: number | null
}

/* ───────────────────────────── meses ───────────────────────────── */

const dois = (n: number) => String(n).padStart(2, '0')

/** Mes de um instante, no fuso do aparelho (o da loja). */
export function mesDe(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`
}

export function somarMeses(mes: string, n: number): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(ano, m - 1 + n, 1)
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`
}

/** [inicio, fim) em epoch ms. */
export function intervaloDoMes(mes: string): [number, number] {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  return [new Date(ano, m - 1, 1).getTime(), new Date(ano, m, 1).getTime()]
}

export function diasNoMes(mes: string): number {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  return new Date(ano, m, 0).getDate()
}

export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/* ─────────────────────────── resultado ─────────────────────────── */

export interface ResultadoDoMes {
  faturamentoCentavos: Centavos
  custoProdutosCentavos: Centavos
  despesasVariaveisCentavos: Centavos
  /** faturamento − custo dos produtos − despesas variaveis */
  margemContribuicaoCentavos: Centavos
  despesasFixasCentavos: Centavos
  resultadoCentavos: Centavos
  totalDespesasCentavos: Centavos
  /** resultado / faturamento; null sem faturamento (nao existe "margem de 0 venda") */
  margemPercentual: number | null
  /** despesas lancadas e ainda nao pagas */
  aPagarCentavos: Centavos
  porCategoria: (CategoriaDespesa & { totalCentavos: Centavos })[]
  /**
   * Quanto precisa faturar no mes para o resultado ser zero:
   * fixas / (margem de contribuicao / faturamento).
   * null quando nao da para estimar — sem venda, ou vendendo abaixo do custo
   * (ai nenhum volume de venda fecha o mes).
   */
  pontoEquilibrioCentavos: Centavos | null
}

export function resultadoDoMes(mes: string, vendas: Venda[], despesas: Despesa[]): ResultadoDoMes {
  const [inicio, fim] = intervaloDoMes(mes)
  const faturamentoCentavos = vendas
    .filter((v) => !v.canceladaEm && v.criadaEm >= inicio && v.criadaEm < fim)
    .reduce((s, v) => s + v.totalCentavos, 0)

  const doMes = despesas.filter((d) => d.mes === mes)
  const totais = new Map<string, number>()
  const porTipo: Record<TipoDespesa, number> = { custo: 0, variavel: 0, fixa: 0 }
  let aPagarCentavos = 0
  for (const d of doMes) {
    const c = categoriaPorCodigo(d.categoria)
    totais.set(c.codigo, (totais.get(c.codigo) ?? 0) + d.valorCentavos)
    porTipo[c.tipo] += d.valorCentavos
    if (!d.pagoEm) aPagarCentavos += d.valorCentavos
  }

  const margemContribuicaoCentavos = faturamentoCentavos - porTipo.custo - porTipo.variavel
  const resultadoCentavos = margemContribuicaoCentavos - porTipo.fixa
  const indice = faturamentoCentavos > 0 ? margemContribuicaoCentavos / faturamentoCentavos : 0

  return {
    faturamentoCentavos,
    custoProdutosCentavos: porTipo.custo,
    despesasVariaveisCentavos: porTipo.variavel,
    margemContribuicaoCentavos,
    despesasFixasCentavos: porTipo.fixa,
    resultadoCentavos,
    totalDespesasCentavos: porTipo.custo + porTipo.variavel + porTipo.fixa,
    margemPercentual: faturamentoCentavos > 0 ? (resultadoCentavos / faturamentoCentavos) * 100 : null,
    aPagarCentavos,
    porCategoria: CATEGORIAS.filter((c) => totais.has(c.codigo))
      .map((c) => ({ ...c, totalCentavos: totais.get(c.codigo)! }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos),
    pontoEquilibrioCentavos: indice > 0 ? Math.round(porTipo.fixa / indice) : null,
  }
}

/* ────────────────────── repeticao e parcelas ───────────────────── */

type SemId = Omit<Despesa, 'id'>

/**
 * Compra parcelada vira uma despesa por mes, todas criadas de uma vez. Cada
 * parcela pesa no mes em que vence — lancar o valor cheio no mes da compra
 * faria um mes parecer desastroso e os seguintes, melhores do que foram.
 *
 * `valorCentavos` e o valor DA PARCELA, que e o numero que esta no carne.
 */
export function parcelar(base: SemId, parcelas: number): SemId[] {
  if (!Number.isInteger(parcelas) || parcelas < 2) throw new Error('parcelas precisa ser inteiro >= 2')
  return Array.from({ length: parcelas }, (_, i) => ({
    ...base,
    mes: somarMeses(base.mes, i),
    repete: false,
    parcela: i + 1,
    parcelas,
    // so a primeira herda o "ja paguei"; as futuras ainda vao vencer
    pagoEm: i === 0 ? (base.pagoEm ?? null) : null,
  }))
}

/**
 * Despesas que se repetem e ainda nao existem em `mes`, copiadas do mes
 * anterior. Voltam como "a pagar": o mes novo ainda nao foi pago.
 *
 * Nao sao criadas sozinhas. A conta de luz muda todo mes; trazer com um toque
 * e deixar a pessoa confirmar o valor evita despesa fantasma com numero velho.
 */
export function repeticoesPendentes(mes: string, despesas: Despesa[]): SemId[] {
  const anterior = somarMeses(mes, -1)
  const jaNoMes = new Set(despesas.filter((d) => d.mes === mes).map((d) => d.serieId))
  return despesas
    .filter((d) => d.mes === anterior && d.repete && !jaNoMes.has(d.serieId))
    .map(({ id: _, ...d }) => ({ ...d, mes, pagoEm: null }))
}
