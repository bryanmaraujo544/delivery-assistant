import type { Centavos, CentavosFracionados } from './dinheiro'
import { arredondarCentavos, formatarBRL } from './dinheiro'

/* ─────────────────────────── entrada ─────────────────────────── */

export type Dimensao = 'massa' | 'volume' | 'contagem'

export interface Unidade {
  codigo: string
  dimensao: Dimensao
  /** converte para a unidade base da dimensao (massa→g, volume→ml, contagem→un) */
  fatorBase: number
}

export interface Insumo {
  id: string
  nome: string
  /** centavos (fracionados) por unidade base, ja corrigido pelo fator de correcao */
  custoPorUnidadeBase: CentavosFracionados
  dimensao: Dimensao
}

export type ItemFicha =
  | { tipo: 'insumo'; insumoId: string; quantidade: number; unidade: string }
  | { tipo: 'subficha'; fichaId: string; quantidade: number; unidade: string }

export type TipoPerda = 'preparo' | 'assamento' | 'defeito' | 'nao_vendido'

export interface Ficha {
  id: string
  nome: string
  rendimentoTeorico: number
  /** o que o ultimo lote deu de verdade — tem precedencia sobre o teorico */
  rendimentoReal?: number | null
  unidadeRendimento: string
  tempoPreparoMin?: number | null
  itens: ItemFicha[]
  perdas: { tipo: TipoPerda; percentual: number }[]
}

export interface ConfigProducao {
  salarioDesejadoCentavos: Centavos
  horasMes: number
  custoFixoMensalCentavos: Centavos
  unidadesMes: number
}

export interface Catalogo {
  unidades: Map<string, Unidade>
  insumos: Map<string, Insumo>
  fichas: Map<string, Ficha>
}

/* ─────────────────────────── saida ─────────────────────────── */

export interface LinhaCusto {
  rotulo: string
  detalhe: string
  custo: CentavosFracionados
}

/**
 * O detalhamento nao e enfeite: a planilha ganha do app porque a pessoa VE a
 * formula. App que so mostra o numero final e caixa-preta, e o app lider do
 * mercado ja perdeu usuarias por somar errado.
 */
export interface CustoFicha {
  fichaId: string
  materiais: CentavosFracionados
  maoDeObra: CentavosFracionados
  custoFixoRateado: CentavosFracionados
  /** materiais + mao de obra + rateio */
  total: CentavosFracionados
  rendimentoBruto: number
  /** rendimento apos as perdas — e este que divide o custo */
  rendimentoEfetivo: number
  custoUnitario: CentavosFracionados
  linhas: LinhaCusto[]
}

/* ─────────────────────────── calculo ─────────────────────────── */

export class CicloDeSubReceitaError extends Error {
  constructor(public readonly caminho: string[]) {
    super(`ciclo de sub-receita: ${caminho.join(' -> ')}`)
    this.name = 'CicloDeSubReceitaError'
  }
}

function converterParaBase(quantidade: number, unidade: Unidade): number {
  return quantidade * unidade.fatorBase
}

function exigir<T>(mapa: Map<string, T>, chave: string, oQue: string): T {
  const v = mapa.get(chave)
  if (v === undefined) throw new Error(`${oQue} nao encontrado: ${chave}`)
  return v
}

/**
 * Perdas reduzem o rendimento efetivo, nao inflam o custo.
 *
 * As duas formas circulam nas fontes do nicho, mas reduzir o rendimento e a
 * mais defensavel: a perda de assamento (8-12% em bolos) e literalmente massa
 * que evaporou — o lote rende menos, o custo do lote nao mudou.
 *
 * Aplicacao multiplicativa (nao soma) porque as perdas sao sequenciais:
 * perder 10% no preparo e depois 10% no forno deixa 81%, nao 80%.
 */
function rendimentoAposPerdas(bruto: number, perdas: Ficha['perdas']): number {
  return perdas.reduce((acc, p) => acc * (1 - p.percentual / 100), bruto)
}

/** Custo de UM lote da ficha, com detalhamento linha a linha. */
export function calcularCustoFicha(
  fichaId: string,
  catalogo: Catalogo,
  config: ConfigProducao,
  visitados: string[] = [],
): CustoFicha {
  if (visitados.includes(fichaId)) {
    throw new CicloDeSubReceitaError([...visitados, fichaId])
  }
  const ficha = exigir(catalogo.fichas, fichaId, 'ficha')
  const caminho = [...visitados, fichaId]

  const linhas: LinhaCusto[] = []
  let materiais = 0

  for (const item of ficha.itens) {
    const unidade = exigir(catalogo.unidades, item.unidade, 'unidade')

    if (item.tipo === 'insumo') {
      const insumo = exigir(catalogo.insumos, item.insumoId, 'insumo')
      if (insumo.dimensao !== unidade.dimensao) {
        throw new Error(
          `dimensao incompativel em "${insumo.nome}": ` +
            `insumo e ${insumo.dimensao}, item usa ${unidade.codigo} (${unidade.dimensao})`,
        )
      }
      const qtdBase = converterParaBase(item.quantidade, unidade)
      const custo = qtdBase * insumo.custoPorUnidadeBase
      materiais += custo
      linhas.push({
        rotulo: insumo.nome,
        detalhe: `${item.quantidade} ${unidade.codigo}`,
        custo,
      })
    } else {
      // Sub-receita: bolo = massa + recheio + cobertura, cada uma com custo
      // proprio. E isto que faz o recalculo em cascata propagar.
      const sub = calcularCustoFicha(item.fichaId, catalogo, config, caminho)
      const custo = sub.custoUnitario * item.quantidade
      materiais += custo
      linhas.push({
        rotulo: exigir(catalogo.fichas, item.fichaId, 'ficha').nome,
        detalhe: `${item.quantidade} ${unidade.codigo} (sub-receita)`,
        custo,
      })
    }
  }

  // Mao de obra: 40-50% do preco em bolo decorado, e o custo mais esquecido.
  const valorHora = config.horasMes > 0 ? config.salarioDesejadoCentavos / config.horasMes : 0
  const maoDeObra = valorHora * ((ficha.tempoPreparoMin ?? 0) / 60)
  if (maoDeObra > 0) {
    linhas.push({
      rotulo: 'Mão de obra',
      detalhe: `${ficha.tempoPreparoMin} min a ${formatarBRL(valorHora)}/h`,
      custo: maoDeObra,
    })
  }

  const custoFixoRateado =
    config.unidadesMes > 0 ? config.custoFixoMensalCentavos / config.unidadesMes : 0
  if (custoFixoRateado > 0) {
    linhas.push({
      rotulo: 'Custo fixo rateado',
      detalhe: `${config.unidadesMes} un/mês`,
      custo: custoFixoRateado,
    })
  }

  const total = materiais + maoDeObra + custoFixoRateado

  // rendimento REAL tem precedencia: uma lata de leite condensado rende 40 ou
  // 55 brigadeiros dependendo da gramatura. Usar o teorico faz o custo mentir.
  const rendimentoBruto = ficha.rendimentoReal ?? ficha.rendimentoTeorico
  if (rendimentoBruto <= 0) throw new Error(`rendimento invalido na ficha ${ficha.nome}`)

  const rendimentoEfetivo = rendimentoAposPerdas(rendimentoBruto, ficha.perdas)
  if (rendimentoEfetivo <= 0) throw new Error(`perdas zeram o rendimento de ${ficha.nome}`)

  return {
    fichaId,
    materiais,
    maoDeObra,
    custoFixoRateado,
    total,
    rendimentoBruto,
    rendimentoEfetivo,
    custoUnitario: total / rendimentoEfetivo,
    linhas,
  }
}

/* ─────────────────────────── precificacao ─────────────────────── */

export type MarkupBase = 'materiais' | 'custo_total'

export interface Precificacao {
  base: MarkupBase
  multiplicador: number
}

export interface PrecoCalculado {
  /** preco de venda por unidade, em centavos inteiros */
  precoUnitario: Centavos
  custoUnitario: CentavosFracionados
  lucroUnitario: CentavosFracionados
  /** lucro / preco — o que a maioria chama erradamente de "markup" */
  margemPercentual: number
  /** o multiplicador aplicado, e sobre o que ele incidiu */
  markupMultiplicador: number
  markupBase: MarkupBase
  /** CMV = custo / preco */
  cmvPercentual: number
}

/**
 * Markup e margem NAO sao a mesma coisa, e o nicho inteiro confunde os dois
 * (fontes de referencia chamam de "margem" o que e markup e vice-versa).
 *
 *   margem = 1 - 1/markup      markup = 1/(1 - margem)
 *
 * Aplicar "30% de markup" achando que da 30% de margem entrega 23%.
 * Por isso `base` e obrigatorio: "markup 3x" sozinho nao quer dizer nada.
 */
export function calcularPreco(custo: CustoFicha, precificacao: Precificacao): PrecoCalculado {
  if (precificacao.multiplicador <= 0) {
    throw new Error(`multiplicador invalido: ${precificacao.multiplicador}`)
  }

  const porUnidade = (v: number) => v / custo.rendimentoEfetivo

  // Convencao mais defensavel do nicho: markup sobre MATERIAIS, com mao de
  // obra e rateio somados por fora (nao multiplicados).
  const brutoUnitario =
    precificacao.base === 'materiais'
      ? porUnidade(custo.materiais) * precificacao.multiplicador +
        porUnidade(custo.maoDeObra + custo.custoFixoRateado)
      : custo.custoUnitario * precificacao.multiplicador

  const precoUnitario = arredondarCentavos(brutoUnitario)
  const lucroUnitario = precoUnitario - custo.custoUnitario

  return {
    precoUnitario,
    custoUnitario: custo.custoUnitario,
    lucroUnitario,
    margemPercentual: precoUnitario > 0 ? (lucroUnitario / precoUnitario) * 100 : 0,
    markupMultiplicador: precificacao.multiplicador,
    markupBase: precificacao.base,
    cmvPercentual: precoUnitario > 0 ? (custo.custoUnitario / precoUnitario) * 100 : 0,
  }
}

/**
 * Gross-up de canal e por DIVISAO, nunca por soma.
 *
 * Somar a taxa (preco * 1,265) NAO recompoe a margem, porque a taxa incide
 * sobre o preco final, nao sobre o custo. iFood 2026: Basico ~15,2%,
 * Entrega ~26,5%.
 */
export function aplicarTaxaDeCanal(preco: Centavos, taxaPercentual: number): Centavos {
  if (taxaPercentual < 0 || taxaPercentual >= 100) {
    throw new Error(`taxa de canal invalida: ${taxaPercentual}%`)
  }
  return arredondarCentavos(preco / (1 - taxaPercentual / 100))
}

/** Conversoes markup <-> margem, para exibir os dois lado a lado na UI. */
export const markupParaMargem = (markup: number) => (1 - 1 / markup) * 100
export const margemParaMarkup = (margemPercentual: number) => 1 / (1 - margemPercentual / 100)
