import { parseIngredient } from 'parse-ingredient'

/**
 * Parser de linha de receita para PT-BR.
 *
 * O gargalo deste produto nao e o dedo, e o TECLADO. Um campo unico onde se
 * digita "250g farinha" vale mais que tres campos bem desenhados.
 *
 * A `parse-ingredient` resolve quantidade e unidades metricas sozinha, mas nao
 * conhece portugues: "1 lata de leite condensado" e "1/2 xicara de acucar"
 * chegam com a unidade grudada no nome. O lexico abaixo e o trabalho real.
 */

export type ClasseUnidade =
  /** g, kg, ml, l — converte direto */
  | 'metrica'
  /** sem unidade: "2 ovos" */
  | 'contagem'
  /** lata, caixa, pacote: 1 embalagem do insumo, seja ela qual for */
  | 'embalagem'
  /** xicara, colher: depende da DENSIDADE do ingrediente — nao da para converter */
  | 'caseira'

interface DefUnidade {
  codigo: string
  classe: ClasseUnidade
  rotulo: string
}

/**
 * Medida caseira NAO vira grama automaticamente.
 *
 * 1 xicara de farinha ~120 g, de acucar ~200 g, de leite condensado ~300 g.
 * Converter sem a densidade do ingrediente daria um numero errado com cara de
 * certo — pior que nao converter. Marcamos como 'caseira' e pedimos a
 * quantidade, em vez de chutar. (Tabela de densidade ficou fora da v1.)
 */
const LEXICO: Record<string, DefUnidade> = {
  // metricas
  g: { codigo: 'g', classe: 'metrica', rotulo: 'g' },
  grama: { codigo: 'g', classe: 'metrica', rotulo: 'g' },
  gramas: { codigo: 'g', classe: 'metrica', rotulo: 'g' },
  kg: { codigo: 'kg', classe: 'metrica', rotulo: 'kg' },
  quilo: { codigo: 'kg', classe: 'metrica', rotulo: 'kg' },
  quilos: { codigo: 'kg', classe: 'metrica', rotulo: 'kg' },
  ml: { codigo: 'ml', classe: 'metrica', rotulo: 'ml' },
  l: { codigo: 'l', classe: 'metrica', rotulo: 'L' },
  litro: { codigo: 'l', classe: 'metrica', rotulo: 'L' },
  litros: { codigo: 'l', classe: 'metrica', rotulo: 'L' },

  // contagem
  un: { codigo: 'un', classe: 'contagem', rotulo: 'un' },
  unidade: { codigo: 'un', classe: 'contagem', rotulo: 'un' },
  unidades: { codigo: 'un', classe: 'contagem', rotulo: 'un' },

  // embalagem inteira — resolvidas contra o tamanho cadastrado do insumo
  lata: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'lata' },
  latas: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'lata' },
  caixa: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'caixa' },
  caixas: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'caixa' },
  caixinha: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'caixinha' },
  pacote: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'pacote' },
  pacotes: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'pacote' },
  tablete: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'tablete' },
  pote: { codigo: '@embalagem', classe: 'embalagem', rotulo: 'pote' },

  // caseiras — reconhecidas para NAO virarem parte do nome, mas nao convertidas
  xicara: { codigo: '@caseira', classe: 'caseira', rotulo: 'xícara' },
  xicaras: { codigo: '@caseira', classe: 'caseira', rotulo: 'xícara' },
  xic: { codigo: '@caseira', classe: 'caseira', rotulo: 'xícara' },
  colher: { codigo: '@caseira', classe: 'caseira', rotulo: 'colher' },
  colheres: { codigo: '@caseira', classe: 'caseira', rotulo: 'colher' },
  cs: { codigo: '@caseira', classe: 'caseira', rotulo: 'colher de sopa' },
  cc: { codigo: '@caseira', classe: 'caseira', rotulo: 'colher de chá' },
  pitada: { codigo: '@caseira', classe: 'caseira', rotulo: 'pitada' },
  pitadas: { codigo: '@caseira', classe: 'caseira', rotulo: 'pitada' },
}

/**
 * Grafias ACENTUADAS que a lib precisa reconhecer.
 *
 * A `parse-ingredient` casa a unidade literalmente, entao "xícara" com acento
 * nao encontra a chave "xicara". O LEXICO fica indexado sem acento (a busca
 * normaliza), mas a lib precisa receber as duas formas — senao a palavra
 * acentuada vira parte do nome do ingrediente.
 */
const ACENTUADAS = ['xícara', 'xícaras', 'colher', 'colheres', 'unidade', 'unidades']

/** A lib espera { short, plural, alternates } por unidade. */
const ADICIONAIS = Object.fromEntries(
  [...Object.keys(LEXICO), ...ACENTUADAS].map((k) => [
    k,
    { short: k, plural: k, alternates: [] as string[] },
  ]),
)

export interface LinhaParseada {
  /** o texto original, para a usuária conferir o que foi entendido */
  original: string
  quantidade: number | null
  /** null quando não se reconheceu unidade (caso de contagem) */
  unidade: DefUnidade | null
  /** o que sobrou: o nome do ingrediente */
  descricao: string
  /** "Para a massa:" e afins — separam blocos, não são ingredientes */
  ehTitulo: boolean
}

const SEM_ACENTO = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Remove a preposição que sobra quando a unidade é retirada do meio:
 * "1 lata de leite condensado" -> unidade "lata" + descrição "de leite condensado".
 */
const LIMPAR_INICIO = /^(de\s+|do\s+|da\s+)/i

export function parsearLinha(texto: string): LinhaParseada {
  const [bruto] = parseIngredient(texto, {
    additionalUOMs: ADICIONAIS,
    // pt-BR escreve 1,5 e não 1.5
    decimalSeparator: ',',
    normalizeUOM: false,
    allowLeadingOf: true,
    groupHeaderPatterns: [/^para\s+(a|o|as|os)\s+.+:?$/i, /^.+:$/],
    rangeSeparators: [/\s+a\s+/, /\s+ou\s+/],
  })

  if (!bruto) {
    return { original: texto, quantidade: null, unidade: null, descricao: texto.trim(), ehTitulo: false }
  }

  const chave = bruto.unitOfMeasure ? SEM_ACENTO(bruto.unitOfMeasure) : null
  const unidade = chave ? (LEXICO[chave] ?? null) : null

  return {
    original: texto,
    quantidade: bruto.quantity,
    unidade,
    descricao: bruto.description.replace(LIMPAR_INICIO, '').trim(),
    ehTitulo: bruto.isGroupHeader,
  }
}

/** Quebra um texto colado em linhas aproveitáveis. */
export function parsearReceita(texto: string): LinhaParseada[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim()) // marcadores de lista
    .filter((l) => l.length > 0)
    .map(parsearLinha)
}

/* ─────────────────────── resolucao contra o catalogo ─────────────────────── */

/**
 * Forma minima de insumo que a resolucao precisa.
 *
 * Tipagem estrutural de proposito: o dominio nao importa nada de `db/`, entao
 * continua puro e testavel sem Dexie.
 */
export interface InsumoResolvivel {
  id: string
  nome: string
  nomeNormalizado: string
  dimensao: 'massa' | 'volume' | 'contagem'
  embalagemQuantidade: number
  embalagemUnidade: string
}

export type StatusResolucao =
  /** casou com um insumo e a unidade converte — da para adicionar direto */
  | 'pronto'
  /** mais de um insumo bate com o texto */
  | 'ambiguo'
  /** nenhum insumo bate: vai precisar cadastrar */
  | 'novo'
  /** casou, mas a quantidade nao da para converter sozinha */
  | 'revisar'

export interface Resolucao {
  linha: LinhaParseada
  insumo: InsumoResolvivel | null
  candidatos: InsumoResolvivel[]
  quantidade: number | null
  unidade: string | null
  status: StatusResolucao
  aviso: string | null
}

/** Casa por nome normalizado: exato primeiro, depois quem contem o termo. */
function casar(descricao: string, insumos: InsumoResolvivel[]): InsumoResolvivel[] {
  const alvo = SEM_ACENTO(descricao).trim()
  if (!alvo) return []
  const exatos = insumos.filter((i) => i.nomeNormalizado === alvo)
  if (exatos.length > 0) return exatos
  const contem = insumos.filter(
    (i) => i.nomeNormalizado.includes(alvo) || alvo.includes(i.nomeNormalizado),
  )
  // mais especifico primeiro: "chocolate em po" antes de "chocolate"
  return contem.sort((a, b) => a.nome.length - b.nome.length)
}

export function resolverLinha(linha: LinhaParseada, insumos: InsumoResolvivel[]): Resolucao {
  const base = { linha, insumo: null, candidatos: [], quantidade: linha.quantidade, unidade: null }

  const candidatos = casar(linha.descricao, insumos)
  if (candidatos.length === 0) {
    return { ...base, status: 'novo', aviso: 'não encontrei esse insumo no seu catálogo' }
  }
  if (candidatos.length > 1) {
    return { ...base, candidatos, status: 'ambiguo', aviso: 'mais de um insumo combina' }
  }

  const insumo = candidatos[0]!
  const comum = { ...base, insumo, candidatos }

  if (linha.quantidade == null) {
    return { ...comum, status: 'revisar', aviso: 'não identifiquei a quantidade' }
  }

  const classe = linha.unidade?.classe ?? 'contagem'

  if (classe === 'caseira') {
    // NAO chutar: 1 xicara de farinha ~120g, de acucar ~200g. Converter sem a
    // densidade do ingrediente produz numero errado com cara de certo.
    return {
      ...comum,
      status: 'revisar',
      aviso: `"${linha.unidade?.rotulo}" depende da densidade do ingrediente — informe em ${insumo.dimensao === 'massa' ? 'gramas' : 'ml'}`,
    }
  }

  if (classe === 'embalagem') {
    // "1 lata de leite condensado" = 1 x o tamanho cadastrado da embalagem
    return {
      ...comum,
      quantidade: linha.quantidade * insumo.embalagemQuantidade,
      unidade: insumo.embalagemUnidade,
      status: 'pronto',
      aviso: `${linha.quantidade} ${linha.unidade?.rotulo} = ${linha.quantidade * insumo.embalagemQuantidade} ${insumo.embalagemUnidade}`,
    }
  }

  if (classe === 'contagem') {
    if (insumo.dimensao !== 'contagem') {
      return { ...comum, status: 'revisar', aviso: `informe a unidade (o insumo é medido em ${insumo.dimensao})` }
    }
    return { ...comum, quantidade: linha.quantidade, unidade: 'un', status: 'pronto', aviso: null }
  }

  // metrica: so aceita se a dimensao bater — nao existe conversao ml<->g sem densidade
  const dimensaoDaUnidade = ['g', 'kg'].includes(linha.unidade!.codigo) ? 'massa' : 'volume'
  if (dimensaoDaUnidade !== insumo.dimensao) {
    return {
      ...comum,
      status: 'revisar',
      aviso: `${linha.unidade?.rotulo} não serve para um insumo medido em ${insumo.dimensao}`,
    }
  }

  return { ...comum, quantidade: linha.quantidade, unidade: linha.unidade!.codigo, status: 'pronto', aviso: null }
}
