import type { Centavos } from './dinheiro'

/**
 * Venda e caixa — regras puras, sem I/O.
 *
 * PRINCIPIO: venda e movimento de caixa sao FATOS, nao registros editaveis.
 * Uma venda nasce completa e nunca muda; a unica transicao permitida e ser
 * cancelada (uma vez). O saldo do caixa nunca e guardado: e sempre derivado
 * dos fatos. Um contador editavel dessincroniza na primeira vez que dois
 * aparelhos escrevem ao mesmo tempo; uma soma de fatos nao tem como.
 *
 * Todo dinheiro aqui e inteiro em centavos — nao existe centavo fracionado em
 * venda, ao contrario do calculo de custo.
 */

export type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito'

export const FORMAS: FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito']

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
}

export interface ItemVenda {
  produtoId: string
  /** copia do nome na hora da venda: renomear o produto nao reescreve o passado */
  nome: string
  /** copia do preco na hora da venda, pelo mesmo motivo */
  precoUnitarioCentavos: Centavos
  quantidade: number
  /**
   * Custo unitario da ficha tecnica na hora da venda; null quando o produto
   * nao tem ficha (revenda) ou a ficha nao fecha. Fica gravado porque o custo
   * muda toda semana — recalcular depois daria a margem de hoje para a venda
   * de ontem.
   */
  custoUnitarioCentavos: Centavos | null
}

export interface Pagamento {
  forma: FormaPagamento
  /** quanto DESTA VENDA foi quitado nesta forma — nunca inclui o troco */
  valorCentavos: Centavos
}

export interface Venda {
  id: string
  sessaoId: string
  itens: ItemVenda[]
  descontoCentavos: Centavos
  totalCentavos: Centavos
  pagamentos: Pagamento[]
  /** so informativo (o que foi devolvido a cliente); nao entra em nenhuma soma */
  trocoCentavos: Centavos
  criadaEm: number
  canceladaEm?: number | null
  motivoCancelamento?: string | null
}

export interface SessaoCaixa {
  id: string
  abertaEm: number
  fundoTrocoCentavos: Centavos
  fechadaEm?: number | null
  /** dinheiro contado na gaveta no fechamento */
  contadoCentavos?: Centavos | null
  observacao?: string | null
}

export interface MovimentoCaixa {
  id: string
  sessaoId: string
  /** sangria tira dinheiro da gaveta; suprimento poe */
  tipo: 'sangria' | 'suprimento'
  valorCentavos: Centavos
  motivo: string
  criadoEm: number
}

/* ───────────────────────────── venda ───────────────────────────── */

export const subtotalItens = (itens: ItemVenda[]): Centavos =>
  itens.reduce((s, i) => s + i.precoUnitarioCentavos * i.quantidade, 0)

export function totalVenda(itens: ItemVenda[], descontoCentavos: Centavos): Centavos {
  const subtotal = subtotalItens(itens)
  if (descontoCentavos < 0 || descontoCentavos > subtotal) {
    throw new Error('desconto precisa estar entre zero e o subtotal')
  }
  return subtotal - descontoCentavos
}

export const totalPago = (pagamentos: Pagamento[]): Centavos =>
  pagamentos.reduce((s, p) => s + p.valorCentavos, 0)

export function calcularTroco(devidoCentavos: Centavos, recebidoCentavos: Centavos): Centavos {
  if (recebidoCentavos < devidoCentavos) throw new Error('valor recebido menor que o devido')
  return recebidoCentavos - devidoCentavos
}

/**
 * Atalhos de "quanto a cliente entregou": o valor exato e as proximas cedulas
 * redondas. Existe para o caso mais comum no balcao — conta de R$ 37,50 paga
 * com uma nota de R$ 50 — custar um toque, sem teclado.
 */
export function sugestoesDeRecebido(devidoCentavos: Centavos): Centavos[] {
  if (devidoCentavos <= 0) return []
  const redondos = [500, 1000, 2000, 5000, 10000, 20000]
    .map((nota) => Math.ceil(devidoCentavos / nota) * nota)
    .filter((v) => v > devidoCentavos)
  return [devidoCentavos, ...[...new Set(redondos)].sort((a, b) => a - b).slice(0, 3)]
}

/**
 * Confere a venda inteira. Roda no cliente antes de gravar E no servidor ao
 * receber: o total nunca e aceito "porque veio assim", e sempre recalculado.
 */
export function validarVenda(v: Venda): void {
  if (v.itens.length === 0) throw new Error('venda sem itens')
  for (const i of v.itens) {
    if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) {
      throw new Error(`quantidade invalida em "${i.nome}"`)
    }
    if (!Number.isInteger(i.precoUnitarioCentavos) || i.precoUnitarioCentavos < 0) {
      throw new Error(`preco invalido em "${i.nome}"`)
    }
  }
  const total = totalVenda(v.itens, v.descontoCentavos)
  if (v.totalCentavos !== total) throw new Error('total nao bate com itens e desconto')
  if (v.pagamentos.some((p) => !Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0)) {
    throw new Error('pagamento com valor invalido')
  }
  // venda de total zero (100% de desconto) e legitima e nao tem pagamento
  if (totalPago(v.pagamentos) !== total) throw new Error('pagamentos nao somam o total')
  if (v.trocoCentavos < 0) throw new Error('troco negativo')
  if (v.trocoCentavos > 0 && !v.pagamentos.some((p) => p.forma === 'dinheiro')) {
    throw new Error('troco so existe em pagamento em dinheiro')
  }
}

/* ───────────────────────────── caixa ───────────────────────────── */

const zerado = (): Record<FormaPagamento, Centavos> => ({ dinheiro: 0, pix: 0, debito: 0, credito: 0 })

const validas = (vendas: Venda[]) => vendas.filter((v) => !v.canceladaEm)

export function totaisPorForma(vendas: Venda[]): Record<FormaPagamento, Centavos> {
  const t = zerado()
  for (const v of validas(vendas)) for (const p of v.pagamentos) t[p.forma] += p.valorCentavos
  return t
}

export interface ResumoCaixa {
  quantidadeVendas: number
  totalVendidoCentavos: Centavos
  porForma: Record<FormaPagamento, Centavos>
  suprimentosCentavos: Centavos
  sangriasCentavos: Centavos
  /** fundo + vendas em dinheiro + suprimentos − sangrias */
  esperadoDinheiroCentavos: Centavos
  /** contado − esperado; negativo = faltou. null enquanto o caixa nao fechou */
  diferencaCentavos: Centavos | null
}

/**
 * Cartao e Pix nao passam pela gaveta: so dinheiro entra no "esperado". Venda
 * cancelada sai da conta inteira — cancelar significa que o dinheiro voltou
 * para a cliente.
 */
export function resumoCaixa(
  sessao: SessaoCaixa,
  movimentos: MovimentoCaixa[],
  vendas: Venda[],
): ResumoCaixa {
  const daSessao = validas(vendas.filter((v) => v.sessaoId === sessao.id))
  const movs = movimentos.filter((m) => m.sessaoId === sessao.id)
  const soma = (tipo: MovimentoCaixa['tipo']) =>
    movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valorCentavos, 0)

  const porForma = totaisPorForma(daSessao)
  const suprimentosCentavos = soma('suprimento')
  const sangriasCentavos = soma('sangria')
  const esperadoDinheiroCentavos =
    sessao.fundoTrocoCentavos + porForma.dinheiro + suprimentosCentavos - sangriasCentavos

  return {
    quantidadeVendas: daSessao.length,
    totalVendidoCentavos: daSessao.reduce((s, v) => s + v.totalCentavos, 0),
    porForma,
    suprimentosCentavos,
    sangriasCentavos,
    esperadoDinheiroCentavos,
    diferencaCentavos:
      sessao.contadoCentavos != null ? sessao.contadoCentavos - esperadoDinheiroCentavos : null,
  }
}

/* ─────────────────────────── relatorio ─────────────────────────── */

export interface ResumoVendas {
  quantidadeVendas: number
  quantidadeCanceladas: number
  totalCentavos: Centavos
  ticketMedioCentavos: Centavos
  descontosCentavos: Centavos
  porForma: Record<FormaPagamento, Centavos>
  produtos: { produtoId: string; nome: string; quantidade: number; totalCentavos: Centavos }[]
  /**
   * Receita − custo, contando SO os itens que tinham custo na hora da venda.
   * null quando nenhum item tinha. Nunca tratar item sem custo como custo
   * zero: isso transformaria "nao sei" em "lucro de 100%".
   */
  lucroBrutoCentavos: Centavos | null
  /** unidades vendidas sem custo conhecido — a UI precisa dizer que o lucro e parcial */
  unidadesSemCusto: number
}

export function resumoVendas(vendas: Venda[]): ResumoVendas {
  const ok = validas(vendas)
  const totalCentavos = ok.reduce((s, v) => s + v.totalCentavos, 0)

  const porProduto = new Map<string, ResumoVendas['produtos'][number]>()
  let lucro = 0
  let unidadesComCusto = 0
  let unidadesSemCusto = 0
  let descontosCentavos = 0

  for (const v of ok) {
    descontosCentavos += v.descontoCentavos
    const subtotal = subtotalItens(v.itens)
    for (const i of v.itens) {
      const bruto = i.precoUnitarioCentavos * i.quantidade
      const p = porProduto.get(i.produtoId) ?? {
        produtoId: i.produtoId,
        nome: i.nome,
        quantidade: 0,
        totalCentavos: 0,
      }
      p.quantidade += i.quantidade
      p.totalCentavos += bruto
      porProduto.set(i.produtoId, p)

      if (i.custoUnitarioCentavos == null) {
        unidadesSemCusto += i.quantidade
      } else {
        unidadesComCusto += i.quantidade
        // o desconto da venda e rateado pelo peso do item no subtotal
        const desconto = subtotal > 0 ? (v.descontoCentavos * bruto) / subtotal : 0
        lucro += bruto - desconto - i.custoUnitarioCentavos * i.quantidade
      }
    }
  }

  return {
    quantidadeVendas: ok.length,
    quantidadeCanceladas: vendas.length - ok.length,
    totalCentavos,
    ticketMedioCentavos: ok.length > 0 ? Math.round(totalCentavos / ok.length) : 0,
    descontosCentavos,
    porForma: totaisPorForma(ok),
    produtos: [...porProduto.values()].sort((a, b) => b.totalCentavos - a.totalCentavos),
    lucroBrutoCentavos: unidadesComCusto > 0 ? Math.round(lucro) : null,
    unidadesSemCusto,
  }
}
