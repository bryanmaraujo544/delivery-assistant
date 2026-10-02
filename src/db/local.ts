import Dexie, { type EntityTable } from 'dexie'
import type { Dimensao, ItemFicha, MarkupBase, TipoPerda } from '../dominio/custo'
import type { ContagemEstoque } from '../dominio/estoque'
import type { MovimentoCaixa, SessaoCaixa, Venda } from '../dominio/venda'

/**
 * Store local (IndexedDB). O app e offline-first: a leitura primaria acontece
 * aqui, e o servidor sincroniza depois via outbox.
 *
 * REGRA DE OURO: o servidor e a fonte da verdade; isto e cache + fila. Nunca
 * deixar o unico exemplar de um dado existir so no celular — a quota e a
 * politica de eviccao do iOS nao foram apuradas.
 */

export interface InsumoLocal {
  id: string
  nome: string
  /** sem acento, minusculo — usado para busca e para barrar duplicata */
  nomeNormalizado: string
  categoria?: string

  // como se COMPRA
  embalagemQuantidade: number
  embalagemUnidade: string
  precoEmbalagemCentavos: number

  /** embalagemQuantidade x unidade.fatorBase — mesma semantica da coluna do Postgres */
  quantidadeBase: number
  dimensao: Dimensao

  /** Default 1.0: FC so importa para frutas e ovo com gema/clara separada */
  fatorCorrecao: number

  /** preco veio do catalogo semente e ainda nao foi confirmado */
  precoEstimado: boolean
  origemSeed: boolean

  /**
   * Marcado pela usuaria como favorito — sobe para o topo das listas.
   *
   * Complementa o frecency em vez de competir: frecency e INFERIDO do uso,
   * favorito e DECLARADO. Quem usa muito aparece nos chips; quem ela marcou
   * aparece no topo da lista, mesmo que ainda nao tenha usado.
   */
  favorito: boolean

  atualizadoEm: number
  excluidoEm?: number | null
}

/** Frecency, modelo Slack: buckets discretos, calculavel no cliente. */
export interface UsoInsumoLocal {
  id: string
  insumoId: string
  contexto: string
  contagem: number
  /** no maximo 10 timestamps (epoch ms) */
  ultimosUsos: number[]
}

/**
 * Ficha tecnica local.
 *
 * DIVERGENCIA CONSCIENTE do Postgres: aqui `itens` e `perdas` sao arrays
 * embutidos, la sao tabelas separadas. Motivo: a ficha e sempre lida e salva
 * inteira, entao embutir evita N leituras e torna a edicao atomica. O mapeamento
 * fica na camada de sync.
 */
export interface FichaLocal {
  id: string
  nome: string
  categoria?: string
  rendimentoTeorico: number
  rendimentoReal?: number | null
  unidadeRendimento: string
  tempoPreparoMin?: number | null
  ehBase: boolean
  itens: ItemFicha[]
  perdas: { tipo: TipoPerda; percentual: number }[]
  markupBase: MarkupBase
  markupMultiplicador: number
  /**
   * Taxa do canal escolhido, em %. 0 = venda direta.
   *
   * Fica NA FICHA, nao em estado de tela: a usuaria escolhe "iFood Basico" e
   * espera que a lista mostre aquele preco. Sem persistir, a escolha some ao
   * sair da tela e o numero que ela viu nao existe em lugar nenhum.
   */
  canalTaxaPercentual: number
  atualizadoEm: number
  excluidoEm?: number | null
}

/** Registro unico (id fixo 'default'). */
export interface ConfigLocal {
  id: 'default'
  salarioDesejadoCentavos: number
  horasMes: number
  custoFixoMensalCentavos: number
  unidadesMes: number
}

/**
 * Produto de venda — o que aparece no balcao, com preco.
 *
 * NAO e a ficha tecnica: refrigerante e vela se vendem e nao tem receita. O
 * vinculo com a ficha e opcional e existe para o produto herdar o custo, e a
 * venda poder mostrar margem.
 */
export interface ProdutoLocal {
  id: string
  nome: string
  nomeNormalizado: string
  categoria?: string
  precoCentavos: number
  fichaId?: string | null
  /** posicao na tela de venda; ausente = ainda nao arrumado (vai para o fim) */
  ordem?: number | null
  atualizadoEm: number
  excluidoEm?: number | null
}

/**
 * `pendente` (1 = ainda nao confirmado pelo servidor) em vez de comparar
 * `atualizadoEm` com o ultimo sync, como fazem insumos e fichas.
 *
 * Aquela comparacao mistura relogio do aparelho com relogio do servidor: um
 * celular atrasado grava com carimbo anterior ao ultimo sync e o registro
 * nunca sobe. Para uma ficha isso se corrige na proxima edicao; uma venda
 * nunca mais e editada, entao ficaria so no aparelho para sempre.
 *
 * E numero, nao boolean, porque IndexedDB nao indexa boolean.
 */
interface Pendencia {
  pendente: 0 | 1
}

export type VendaLocal = Venda & Pendencia
export type SessaoCaixaLocal = SessaoCaixa & Pendencia
export type MovimentoCaixaLocal = MovimentoCaixa & Pendencia
export type ContagemEstoqueLocal = ContagemEstoque & Pendencia

const db = new Dexie('precifica') as Dexie & {
  insumos: EntityTable<InsumoLocal, 'id'>
  usoInsumos: EntityTable<UsoInsumoLocal, 'id'>
  fichas: EntityTable<FichaLocal, 'id'>
  config: EntityTable<ConfigLocal, 'id'>
  produtos: EntityTable<ProdutoLocal, 'id'>
  caixaSessoes: EntityTable<SessaoCaixaLocal, 'id'>
  caixaMovimentos: EntityTable<MovimentoCaixaLocal, 'id'>
  vendas: EntityTable<VendaLocal, 'id'>
  estoqueContagens: EntityTable<ContagemEstoqueLocal, 'id'>
}

db.version(1).stores({
  insumos: 'id, nomeNormalizado, categoria, excluidoEm',
  usoInsumos: 'id, insumoId, contexto',
})

db.version(2).stores({
  insumos: 'id, nomeNormalizado, categoria, excluidoEm',
  usoInsumos: 'id, insumoId, contexto',
  fichas: 'id, nome, categoria, ehBase, excluidoEm',
  config: 'id',
})

/**
 * v3 — troca ids sinteticos de seed ("seed-0") por UUID.
 *
 * O catalogo semente nascia com id sequencial. Funcionava offline, mas a coluna
 * no Postgres e `uuid`: o erro so apareceu na PRIMEIRA sincronizacao, com o
 * servidor devolvendo 400 para o lote inteiro.
 *
 * Nao da para simplesmente reescrever os ids: fichas e o ranking de frecency
 * apontam para eles. A migracao remapeia as tres tabelas na mesma transacao.
 */
db.version(3)
  .stores({
    insumos: 'id, nomeNormalizado, categoria, excluidoEm',
    usoInsumos: 'id, insumoId, contexto',
    fichas: 'id, nome, categoria, ehBase, excluidoEm',
    config: 'id',
  })
  .upgrade(async (tx) => {
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const insumos = await tx.table<InsumoLocal>('insumos').toArray()
    const remap = new Map<string, string>()

    for (const i of insumos) {
      if (ehUuid.test(i.id)) continue
      const novo = crypto.randomUUID()
      remap.set(i.id, novo)
      await tx.table('insumos').delete(i.id)
      await tx.table('insumos').put({ ...i, id: novo })
    }
    if (remap.size === 0) return

    // fichas apontam para insumos nos itens
    for (const f of await tx.table<FichaLocal>('fichas').toArray()) {
      const itens = f.itens.map((it) =>
        it.tipo === 'insumo' && remap.has(it.insumoId)
          ? { ...it, insumoId: remap.get(it.insumoId)! }
          : it,
      )
      await tx.table('fichas').put({ ...f, itens })
    }

    // o ranking de frecency tambem referencia insumoId — e a chave o embute
    for (const u of await tx.table<UsoInsumoLocal>('usoInsumos').toArray()) {
      const novo = remap.get(u.insumoId)
      if (!novo) continue
      await tx.table('usoInsumos').delete(u.id)
      await tx.table('usoInsumos').put({ ...u, id: `${novo}::${u.contexto}`, insumoId: novo })
    }
  })

/**
 * v4 — `canalTaxaPercentual` nas fichas existentes.
 *
 * O canal era estado de tela e nao era gravado: a usuaria escolhia "iFood
 * Basico", via o preco ajustado, saia da ficha e a escolha sumia. Agora e campo
 * da ficha, e as que ja existem precisam do default 0 (venda direta) — sem isso
 * o calculo receberia undefined e o preco sairia NaN.
 */
db.version(4)
  .stores({
    insumos: 'id, nomeNormalizado, categoria, excluidoEm',
    usoInsumos: 'id, insumoId, contexto',
    fichas: 'id, nome, categoria, ehBase, excluidoEm',
    config: 'id',
  })
  .upgrade(async (tx) => {
    await tx
      .table<FichaLocal>('fichas')
      .toCollection()
      .modify((f) => {
        if (typeof f.canalTaxaPercentual !== 'number') f.canalTaxaPercentual = 0
      })
  })

/** v5 — `favorito` nos insumos existentes (default false). */
db.version(5)
  .stores({
    insumos: 'id, nomeNormalizado, categoria, favorito, excluidoEm',
    usoInsumos: 'id, insumoId, contexto',
    fichas: 'id, nome, categoria, ehBase, excluidoEm',
    config: 'id',
  })
  .upgrade(async (tx) => {
    await tx
      .table<InsumoLocal>('insumos')
      .toCollection()
      .modify((i) => {
        if (typeof i.favorito !== 'boolean') i.favorito = false
      })
  })

/** v6 — PDV: produtos de venda, sessoes e movimentos de caixa, vendas. */
db.version(6).stores({
  insumos: 'id, nomeNormalizado, categoria, favorito, excluidoEm',
  usoInsumos: 'id, insumoId, contexto',
  fichas: 'id, nome, categoria, ehBase, excluidoEm',
  config: 'id',
  produtos: 'id, nomeNormalizado, categoria, excluidoEm',
  caixaSessoes: 'id, abertaEm, pendente',
  caixaMovimentos: 'id, sessaoId, pendente',
  vendas: 'id, sessaoId, criadaEm, pendente',
})

/** v7 — contagens de estoque (o saldo e derivado delas e das vendas). */
db.version(7).stores({
  insumos: 'id, nomeNormalizado, categoria, favorito, excluidoEm',
  usoInsumos: 'id, insumoId, contexto',
  fichas: 'id, nome, categoria, ehBase, excluidoEm',
  config: 'id',
  produtos: 'id, nomeNormalizado, categoria, excluidoEm',
  caixaSessoes: 'id, abertaEm, pendente',
  caixaMovimentos: 'id, sessaoId, pendente',
  vendas: 'id, sessaoId, criadaEm, pendente',
  estoqueContagens: 'id, produtoId, pendente',
})

export const CONFIG_PADRAO: ConfigLocal = {
  id: 'default',
  salarioDesejadoCentavos: 0,
  // 176h e 220h aparecem nas fontes e mudam o valor/hora em 25% — por isso e campo
  horasMes: 176,
  custoFixoMensalCentavos: 0,
  unidadesMes: 0,
}

export { db }

/** Remove acento e caixa. "Açúcar Cristal" e "acucar cristal" colidem. */
export function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/* ─────────────────────────── unidades ─────────────────────────── */

export interface UnidadeDef {
  codigo: string
  rotulo: string
  dimensao: Dimensao
  fatorBase: number
}

/** Espelha drizzle/seed-unidades.sql. Base: massa→g, volume→ml, contagem→un. */
export const UNIDADES: UnidadeDef[] = [
  { codigo: 'kg', rotulo: 'kg', dimensao: 'massa', fatorBase: 1000 },
  { codigo: 'g', rotulo: 'g', dimensao: 'massa', fatorBase: 1 },
  { codigo: 'l', rotulo: 'L', dimensao: 'volume', fatorBase: 1000 },
  { codigo: 'ml', rotulo: 'ml', dimensao: 'volume', fatorBase: 1 },
  { codigo: 'un', rotulo: 'un', dimensao: 'contagem', fatorBase: 1 },
]

export const unidadePorCodigo = (codigo: string): UnidadeDef => {
  const u = UNIDADES.find((x) => x.codigo === codigo)
  if (!u) throw new Error(`unidade desconhecida: ${codigo}`)
  return u
}

/** Unidade base de exibicao para a dimensao do insumo. */
export const unidadeBase = (d: Dimensao) => (d === 'massa' ? 'g' : d === 'volume' ? 'ml' : 'un')

/** Centavos (fracionados) por unidade base. Mesma formula da coluna gerada. */
export function custoPorUnidadeBase(i: InsumoLocal): number {
  if (i.quantidadeBase <= 0) return 0
  return (i.precoEmbalagemCentavos / i.quantidadeBase) * i.fatorCorrecao
}

/**
 * Converte custo/unidade-base para uma unidade que a pessoa reconhece.
 *
 * NUNCA exibir custo por grama: farinha a 0,6 centavos/g arredonda para
 * "R$ 0,01" e maracuja a 3,132 centavos/g vira "R$ 0,03" — ambos parecem
 * precisos e escondem o valor real. Por kg/L o numero fica legivel e o
 * arredondamento deixa de mentir.
 */
export function custoExibicao(porBase: number, dimensao: Dimensao) {
  if (dimensao === 'massa') return { valor: porBase * 1000, unidade: 'kg' }
  if (dimensao === 'volume') return { valor: porBase * 1000, unidade: 'L' }
  return { valor: porBase, unidade: 'un' }
}
