import { describe, expect, it } from 'vitest'
import { estoqueAtual, type ContagemEstoque } from './estoque'
import type { Venda } from './venda'

const contagem = (produtoId: string, quantidade: number | null, criadoEm: number): ContagemEstoque => ({
  id: `c-${produtoId}-${criadoEm}`,
  produtoId,
  quantidade,
  criadoEm,
})

const venda = (produtoId: string, quantidade: number, criadaEm: number, over: Partial<Venda> = {}): Venda => ({
  id: `v-${criadaEm}`,
  sessaoId: 's',
  itens: [{ produtoId, nome: 'x', precoUnitarioCentavos: 100, quantidade, custoUnitarioCentavos: null }],
  descontoCentavos: 0,
  totalCentavos: 100 * quantidade,
  pagamentos: [{ forma: 'pix', valorCentavos: 100 * quantidade }],
  trocoCentavos: 0,
  criadaEm,
  ...over,
})

describe('estoqueAtual', () => {
  it('venda baixa o estoque', () => {
    const s = estoqueAtual([contagem('bolo', 10, 100)], [venda('bolo', 3, 200), venda('bolo', 1, 300)])
    expect(s.get('bolo')).toBe(6)
  })

  it('excluir a venda devolve o estoque', () => {
    const vendas = [venda('bolo', 3, 200)]
    expect(estoqueAtual([contagem('bolo', 10, 100)], vendas).get('bolo')).toBe(7)
    vendas[0]!.canceladaEm = 250
    expect(estoqueAtual([contagem('bolo', 10, 100)], vendas).get('bolo')).toBe(10)
  })

  it('venda anterior a contagem nao baixa de novo', () => {
    // contou 10 DEPOIS de ja ter vendido 3: os 3 nao podem sair outra vez
    const s = estoqueAtual([contagem('bolo', 10, 300)], [venda('bolo', 3, 200), venda('bolo', 2, 400)])
    expect(s.get('bolo')).toBe(8)
  })

  it('vale a contagem mais recente, em qualquer ordem de chegada', () => {
    const s = estoqueAtual([contagem('bolo', 20, 300), contagem('bolo', 10, 100)], [venda('bolo', 1, 400)])
    expect(s.get('bolo')).toBe(19)
  })

  it('produto sem contagem nao tem estoque controlado', () => {
    const s = estoqueAtual([], [venda('encomenda', 1, 100)])
    expect(s.has('encomenda')).toBe(false)
  })

  it('contagem nula desliga o controle', () => {
    const s = estoqueAtual([contagem('bolo', 10, 100), contagem('bolo', null, 200)], [venda('bolo', 1, 300)])
    expect(s.has('bolo')).toBe(false)
  })

  it('pode ficar negativo: vendeu mais do que a contagem dizia ter', () => {
    expect(estoqueAtual([contagem('bolo', 1, 100)], [venda('bolo', 3, 200)]).get('bolo')).toBe(-2)
  })

  it('cada produto tem o seu saldo', () => {
    const s = estoqueAtual(
      [contagem('bolo', 5, 100), contagem('doce', 50, 100)],
      [venda('bolo', 2, 200), venda('doce', 10, 300)],
    )
    expect([s.get('bolo'), s.get('doce')]).toEqual([3, 40])
  })
})
