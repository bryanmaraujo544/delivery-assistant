import { describe, expect, it } from 'vitest'
import { moverPara, ordenarProdutos } from './ordem'

describe('ordenarProdutos', () => {
  it('ordem manual primeiro; sem ordem vai para o fim, por nome', () => {
    const r = ordenarProdutos([
      { nome: 'Zebra', ordem: null },
      { nome: 'Bolo', ordem: 1 },
      { nome: 'Água' },
      { nome: 'Torta', ordem: 0 },
    ])
    expect(r.map((p) => p.nome)).toEqual(['Torta', 'Bolo', 'Água', 'Zebra'])
  })

  it('ordem zero e uma posicao valida, nao "sem ordem"', () => {
    expect(ordenarProdutos([{ nome: 'A' }, { nome: 'B', ordem: 0 }]).map((p) => p.nome)).toEqual(['B', 'A'])
  })
})

describe('moverPara', () => {
  const ids = ['a', 'b', 'c', 'd']
  it('para frente e para tras', () => {
    expect(moverPara(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moverPara(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })
  it('nao muda quando o alvo e o proprio item ou nao existe', () => {
    expect(moverPara(ids, 'b', 'b')).toBe(ids)
    expect(moverPara(ids, 'b', 'x')).toBe(ids)
  })
})
