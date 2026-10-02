import { describe, expect, it } from 'vitest'
import {
  calcularTroco,
  resumoCaixa,
  resumoVendas,
  sugestoesDeRecebido,
  totalVenda,
  validarVenda,
  type ItemVenda,
  type MovimentoCaixa,
  type SessaoCaixa,
  type Venda,
} from './venda'

const item = (over: Partial<ItemVenda> = {}): ItemVenda => ({
  produtoId: 'p1',
  nome: 'Bolo no pote',
  precoUnitarioCentavos: 1500,
  quantidade: 1,
  custoUnitarioCentavos: 600,
  ...over,
})

let seq = 0
function venda(over: Partial<Venda> = {}): Venda {
  const itens = over.itens ?? [item()]
  const descontoCentavos = over.descontoCentavos ?? 0
  const totalCentavos = totalVenda(itens, descontoCentavos)
  return {
    id: `v${++seq}`,
    sessaoId: 's1',
    itens,
    descontoCentavos,
    totalCentavos,
    pagamentos: totalCentavos > 0 ? [{ forma: 'dinheiro', valorCentavos: totalCentavos }] : [],
    trocoCentavos: 0,
    criadaEm: 0,
    ...over,
  }
}

const sessao: SessaoCaixa = { id: 's1', abertaEm: 0, fundoTrocoCentavos: 10000 }

describe('total e troco', () => {
  it('soma itens e abate o desconto', () => {
    expect(totalVenda([item({ quantidade: 3 }), item({ precoUnitarioCentavos: 800 })], 300)).toBe(5000)
  })

  it('recusa desconto maior que o subtotal', () => {
    expect(() => totalVenda([item()], 1501)).toThrow()
    expect(() => totalVenda([item()], -1)).toThrow()
  })

  it('calcula troco e recusa valor insuficiente', () => {
    expect(calcularTroco(3750, 5000)).toBe(1250)
    expect(calcularTroco(3750, 3750)).toBe(0)
    expect(() => calcularTroco(3750, 3000)).toThrow()
  })

  it('sugere o exato e as proximas cedulas, sem repetir', () => {
    expect(sugestoesDeRecebido(3750)).toEqual([3750, 4000, 5000, 10000])
    // valor ja redondo nao sugere a si mesmo duas vezes
    expect(sugestoesDeRecebido(5000)).toEqual([5000, 6000, 10000, 20000])
    expect(sugestoesDeRecebido(0)).toEqual([])
  })
})

describe('validarVenda', () => {
  it('aceita venda coerente, inclusive com pagamento dividido', () => {
    expect(() =>
      validarVenda(
        venda({
          itens: [item({ quantidade: 2 })],
          pagamentos: [
            { forma: 'dinheiro', valorCentavos: 1000 },
            { forma: 'pix', valorCentavos: 2000 },
          ],
        }),
      ),
    ).not.toThrow()
  })

  it('aceita venda de total zero sem pagamento', () => {
    expect(() => validarVenda(venda({ descontoCentavos: 1500 }))).not.toThrow()
  })

  it('recusa total adulterado', () => {
    expect(() => validarVenda({ ...venda(), totalCentavos: 100 })).toThrow(/total/)
  })

  it('recusa pagamentos que nao somam o total', () => {
    expect(() =>
      validarVenda(venda({ pagamentos: [{ forma: 'pix', valorCentavos: 1000 }] })),
    ).toThrow(/pagamentos/)
  })

  it('recusa venda vazia e quantidade fracionada', () => {
    expect(() => validarVenda({ ...venda(), itens: [] })).toThrow(/sem itens/)
    expect(() => validarVenda(venda({ itens: [item({ quantidade: 1.5 })] }))).toThrow(/quantidade/)
  })

  it('recusa troco sem dinheiro', () => {
    expect(() =>
      validarVenda(venda({ pagamentos: [{ forma: 'pix', valorCentavos: 1500 }], trocoCentavos: 500 })),
    ).toThrow(/troco/)
  })
})

describe('resumoCaixa', () => {
  const movs: MovimentoCaixa[] = [
    { id: 'm1', sessaoId: 's1', tipo: 'sangria', valorCentavos: 5000, motivo: 'banco', criadoEm: 0 },
    { id: 'm2', sessaoId: 's1', tipo: 'suprimento', valorCentavos: 2000, motivo: 'troco', criadoEm: 0 },
    { id: 'm3', sessaoId: 'outra', tipo: 'sangria', valorCentavos: 99999, motivo: 'x', criadoEm: 0 },
  ]

  it('so dinheiro entra no esperado da gaveta', () => {
    const vendas = [
      venda(), // 15,00 dinheiro
      venda({ pagamentos: [{ forma: 'pix', valorCentavos: 1500 }] }),
      venda({ pagamentos: [{ forma: 'credito', valorCentavos: 1500 }] }),
    ]
    const r = resumoCaixa(sessao, movs, vendas)
    // 100 fundo + 15 dinheiro + 20 suprimento − 50 sangria
    expect(r.esperadoDinheiroCentavos).toBe(8500)
    expect(r.totalVendidoCentavos).toBe(4500)
    expect(r.porForma).toEqual({ dinheiro: 1500, pix: 1500, debito: 0, credito: 0 + 1500 })
    expect(r.diferencaCentavos).toBeNull()
  })

  it('troco nao infla a gaveta: entra o valor da venda, nao a nota recebida', () => {
    // conta de 15, cliente deu 50, levou 35 de troco
    const r = resumoCaixa(sessao, [], [venda({ trocoCentavos: 3500 })])
    expect(r.esperadoDinheiroCentavos).toBe(11500)
  })

  it('venda cancelada e venda de outra sessao ficam fora', () => {
    const r = resumoCaixa(sessao, [], [
      venda(),
      venda({ canceladaEm: 1, motivoCancelamento: 'erro' }),
      venda({ sessaoId: 'outra' }),
    ])
    expect(r.quantidadeVendas).toBe(1)
    expect(r.esperadoDinheiroCentavos).toBe(11500)
  })

  it('diferenca negativa quando falta dinheiro', () => {
    const r = resumoCaixa({ ...sessao, fechadaEm: 1, contadoCentavos: 11000 }, [], [venda()])
    expect(r.diferencaCentavos).toBe(-500)
  })
})

describe('resumoVendas', () => {
  it('ticket medio, ranking e canceladas', () => {
    const r = resumoVendas([
      venda({ itens: [item({ quantidade: 2 })] }),
      venda({ itens: [item({ produtoId: 'p2', nome: 'Brigadeiro', precoUnitarioCentavos: 500 })] }),
      venda({ canceladaEm: 1 }),
    ])
    expect(r.quantidadeVendas).toBe(2)
    // 2 bolos + 1 brigadeiro; o item da venda cancelada fica fora
    expect(r.quantidadeItens).toBe(3)
    expect(r.quantidadeCanceladas).toBe(1)
    expect(r.totalCentavos).toBe(3500)
    expect(r.ticketMedioCentavos).toBe(1750)
    expect(r.produtos.map((p) => [p.nome, p.quantidade])).toEqual([
      ['Bolo no pote', 2],
      ['Brigadeiro', 1],
    ])
  })

  it('lucro desconta o custo gravado na venda e o desconto', () => {
    // 2 × (15 − 6) = 18, menos 3 de desconto
    const r = resumoVendas([venda({ itens: [item({ quantidade: 2 })], descontoCentavos: 300 })])
    expect(r.lucroBrutoCentavos).toBe(1500)
    expect(r.unidadesSemCusto).toBe(0)
  })

  it('item sem custo nao vira lucro de 100%', () => {
    const r = resumoVendas([
      venda({ itens: [item(), item({ produtoId: 'p2', nome: 'Refrigerante', custoUnitarioCentavos: null })] }),
    ])
    // so o bolo conta: 15 − 6
    expect(r.lucroBrutoCentavos).toBe(900)
    expect(r.unidadesSemCusto).toBe(1)
  })

  it('lucro e null quando nenhum item tem custo', () => {
    const r = resumoVendas([venda({ itens: [item({ custoUnitarioCentavos: null })] })])
    expect(r.lucroBrutoCentavos).toBeNull()
  })
})
