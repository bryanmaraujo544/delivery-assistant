import { z } from 'zod'

/**
 * Contrato de sincronizacao entre o Dexie (cliente) e o Postgres (servidor).
 *
 * As duas formas divergem de proposito:
 *  - no cliente, `itens` e `perdas` sao arrays EMBUTIDOS na ficha, porque ela
 *    e sempre lida e salva inteira;
 *  - no servidor sao tabelas separadas, porque la queremos integridade
 *    referencial e consulta por insumo.
 *
 * Este arquivo e a fronteira onde as duas formas se encontram. Validar aqui
 * com Zod nao e formalidade: o corpo vem de um cliente offline que pode estar
 * varias versoes atrasado.
 */

export const zItem = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('insumo'),
    insumoId: z.uuid(),
    quantidade: z.number().positive(),
    unidade: z.string().min(1).max(20),
  }),
  z.object({
    tipo: z.literal('subficha'),
    fichaId: z.uuid(),
    quantidade: z.number().positive(),
    unidade: z.string().min(1).max(20),
  }),
])

export const zPerda = z.object({
  tipo: z.enum(['preparo', 'assamento', 'defeito', 'nao_vendido']),
  percentual: z.number().min(0).max(99.999),
})

export const zInsumo = z.object({
  id: z.uuid(),
  nome: z.string().min(1).max(200),
  nomeNormalizado: z.string().min(1).max(200),
  categoria: z.string().max(100).nullish(),
  embalagemQuantidade: z.number().positive(),
  embalagemUnidade: z.string().min(1).max(20),
  precoEmbalagemCentavos: z.number().int().min(0),
  quantidadeBase: z.number().positive(),
  fatorCorrecao: z.number().min(1),
  precoEstimado: z.boolean(),
  origemSeed: z.boolean(),
  atualizadoEm: z.number().int(),
  excluidoEm: z.number().int().nullish(),
})

export const zFicha = z.object({
  id: z.uuid(),
  nome: z.string().min(1).max(200),
  categoria: z.string().max(100).nullish(),
  rendimentoTeorico: z.number().positive(),
  rendimentoReal: z.number().positive().nullish(),
  unidadeRendimento: z.string().min(1).max(20),
  tempoPreparoMin: z.number().int().min(0).nullish(),
  ehBase: z.boolean(),
  itens: z.array(zItem).max(200),
  perdas: z.array(zPerda).max(10),
  markupBase: z.enum(['materiais', 'custo_total']),
  markupMultiplicador: z.number().positive(),
  atualizadoEm: z.number().int(),
  excluidoEm: z.number().int().nullish(),
})

export const zConfig = z.object({
  salarioDesejadoCentavos: z.number().int().min(0),
  horasMes: z.number().int().positive(),
  custoFixoMensalCentavos: z.number().int().min(0),
  unidadesMes: z.number().int().min(0),
})

export const zPush = z.object({
  // teto por lote: um cliente offline ha semanas nao pode derrubar o servidor
  insumos: z.array(zInsumo).max(500).default([]),
  fichas: z.array(zFicha).max(500).default([]),
  config: zConfig.nullish(),
})

export type InsumoSync = z.infer<typeof zInsumo>
export type FichaSync = z.infer<typeof zFicha>

/** `numeric` do Postgres volta como string no driver — converter na fronteira. */
export const num = (v: string | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : Number(v)
