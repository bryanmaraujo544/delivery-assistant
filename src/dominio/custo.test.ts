import { describe, expect, it } from 'vitest'
import { arredondarCentavos, formatarBRL, parseValorBRL } from './dinheiro'
import {
  CicloDeSubReceitaError,
  aplicarTaxaDeCanal,
  calcularCustoFicha,
  calcularPreco,
  markupParaMargem,
  margemParaMarkup,
  type Catalogo,
  type ConfigProducao,
  type Ficha,
  type Insumo,
  type Unidade,
} from './custo'

/* ─────────────────────────── fixtures ─────────────────────────── */

const UNIDADES: Unidade[] = [
  { codigo: 'g', dimensao: 'massa', fatorBase: 1 },
  { codigo: 'kg', dimensao: 'massa', fatorBase: 1000 },
  { codigo: 'ml', dimensao: 'volume', fatorBase: 1 },
  { codigo: 'l', dimensao: 'volume', fatorBase: 1000 },
  { codigo: 'un', dimensao: 'contagem', fatorBase: 1 },
]

/** R$ 12,00/kg => 1,2 centavos por grama (mesmo numero validado no Postgres) */
const FARINHA: Insumo = {
  id: 'farinha',
  nome: 'Farinha de trigo',
  custoPorUnidadeBase: 1.2,
  dimensao: 'massa',
}
const ACUCAR: Insumo = {
  id: 'acucar',
  nome: 'Açúcar refinado',
  custoPorUnidadeBase: 0.5,
  dimensao: 'massa',
}
const LEITE: Insumo = { id: 'leite', nome: 'Leite', custoPorUnidadeBase: 0.4, dimensao: 'volume' }

const SEM_CUSTOS_INDIRETOS: ConfigProducao = {
  salarioDesejadoCentavos: 0,
  horasMes: 176,
  custoFixoMensalCentavos: 0,
  unidadesMes: 0,
}

function montarCatalogo(fichas: Ficha[], insumos = [FARINHA, ACUCAR, LEITE]): Catalogo {
  return {
    unidades: new Map(UNIDADES.map((u) => [u.codigo, u])),
    insumos: new Map(insumos.map((i) => [i.id, i])),
    fichas: new Map(fichas.map((f) => [f.id, f])),
  }
}

const fichaSimples = (over: Partial<Ficha> = {}): Ficha => ({
  id: 'f1',
  nome: 'Bolo',
  rendimentoTeorico: 1,
  unidadeRendimento: 'un',
  itens: [{ tipo: 'insumo', insumoId: 'farinha', quantidade: 250, unidade: 'g' }],
  perdas: [],
  ...over,
})

/* ─────────────────────────── dinheiro ─────────────────────────── */

describe('dinheiro', () => {
  it('arredonda meio-para-cima', () => {
    expect(arredondarCentavos(2.4)).toBe(2)
    expect(arredondarCentavos(2.5)).toBe(3)
    expect(arredondarCentavos(2.6)).toBe(3)
  })

  it('nao erra por drift de float (0.1+0.2 = 0.30000000000000004)', () => {
    expect(arredondarCentavos(0.1 + 0.2 + 2.2)).toBe(3)
    expect(arredondarCentavos(1.005 * 100 * 0.01 * 100)).toBe(101)
  })

  it('rejeita valor nao finito em vez de propagar NaN pelo custo', () => {
    expect(() => arredondarCentavos(NaN)).toThrow()
    expect(() => arredondarCentavos(Infinity)).toThrow()
  })

  it('parseia os formatos que saem de um teclado mobile pt-BR', () => {
    expect(parseValorBRL('12,34')).toBe(1234)
    expect(parseValorBRL('12.34')).toBe(1234)
    expect(parseValorBRL('1.234,56')).toBe(123456)
    expect(parseValorBRL('R$ 12,34')).toBe(1234)
    expect(parseValorBRL('12')).toBe(1200)
  })

  it('formata em BRL', () => {
    // Intl pt-BR separa "R$" do numero com espaco NAO-QUEBRAVEL (U+00A0), nao
    // com espaco comum. E o comportamento correto — evita quebrar a linha entre
    // simbolo e valor. Normalizamos so na comparacao.
    const norm = (s: string) => s.replace(/ /g, ' ')
    expect(norm(formatarBRL(1234))).toBe('R$ 12,34')
    // centavo fracionado arredonda so na exibicao
    expect(norm(formatarBRL(1.2 * 250))).toBe('R$ 3,00')
    expect(formatarBRL(1234)).toContain(' ')
  })
})

/* ─────────────────────────── materiais ─────────────────────────── */

describe('custo de materiais', () => {
  it('converte kg->g e bate com o valor validado no banco', () => {
    const c = calcularCustoFicha('f1', montarCatalogo([fichaSimples()]), SEM_CUSTOS_INDIRETOS)
    // 250 g x 1,2 centavos/g = 300 centavos = R$ 3,00
    expect(c.materiais).toBe(300)
    expect(c.custoUnitario).toBe(300)
  })

  it('aceita a mesma quantidade expressa em outra unidade da mesma dimensao', () => {
    const emKg = fichaSimples({
      itens: [{ tipo: 'insumo', insumoId: 'farinha', quantidade: 0.25, unidade: 'kg' }],
    })
    const c = calcularCustoFicha('f1', montarCatalogo([emKg]), SEM_CUSTOS_INDIRETOS)
    expect(c.materiais).toBeCloseTo(300, 10)
  })

  it('recusa unidade de dimensao incompativel (farinha em ml)', () => {
    const errada = fichaSimples({
      itens: [{ tipo: 'insumo', insumoId: 'farinha', quantidade: 100, unidade: 'ml' }],
    })
    expect(() => calcularCustoFicha('f1', montarCatalogo([errada]), SEM_CUSTOS_INDIRETOS)).toThrow(
      /dimensao incompativel/,
    )
  })

  it('detalha linha a linha — "mostre a conta"', () => {
    const f = fichaSimples({
      itens: [
        { tipo: 'insumo', insumoId: 'farinha', quantidade: 250, unidade: 'g' },
        { tipo: 'insumo', insumoId: 'acucar', quantidade: 200, unidade: 'g' },
      ],
    })
    const c = calcularCustoFicha('f1', montarCatalogo([f]), SEM_CUSTOS_INDIRETOS)
    expect(c.linhas).toHaveLength(2)
    expect(c.linhas[0]).toMatchObject({ rotulo: 'Farinha de trigo', detalhe: '250 g', custo: 300 })
    expect(c.linhas[1]).toMatchObject({ rotulo: 'Açúcar refinado', custo: 100 })
    expect(c.materiais).toBe(400)
  })
})

/* ─────────────────────────── rendimento ─────────────────────────── */

describe('rendimento', () => {
  it('o rendimento REAL tem precedencia sobre o teorico', () => {
    // caso documentado: a mesma lata rende 40 ou 55 brigadeiros
    const base = { itens: [{ tipo: 'insumo' as const, insumoId: 'farinha', quantidade: 1000, unidade: 'g' }] }
    const teorico = fichaSimples({ ...base, rendimentoTeorico: 55 })
    const real = fichaSimples({ ...base, rendimentoTeorico: 55, rendimentoReal: 40 })

    const cT = calcularCustoFicha('f1', montarCatalogo([teorico]), SEM_CUSTOS_INDIRETOS)
    const cR = calcularCustoFicha('f1', montarCatalogo([real]), SEM_CUSTOS_INDIRETOS)

    expect(cT.custoUnitario).toBeCloseTo(1200 / 55, 10)
    expect(cR.custoUnitario).toBeCloseTo(1200 / 40, 10)
    // usar o teorico subestimaria o custo unitario em ~27%
    expect(cR.custoUnitario).toBeGreaterThan(cT.custoUnitario)
  })

  it('perdas sao multiplicativas, nao somadas', () => {
    const f = fichaSimples({
      rendimentoTeorico: 100,
      perdas: [
        { tipo: 'preparo', percentual: 10 },
        { tipo: 'assamento', percentual: 10 },
      ],
    })
    const c = calcularCustoFicha('f1', montarCatalogo([f]), SEM_CUSTOS_INDIRETOS)
    // 100 * 0,9 * 0,9 = 81 (nao 80)
    expect(c.rendimentoEfetivo).toBeCloseTo(81, 10)
  })

  it('perda de assamento de bolo (8-12%) encarece a unidade', () => {
    const semPerda = fichaSimples({ rendimentoTeorico: 10 })
    const comPerda = fichaSimples({
      rendimentoTeorico: 10,
      perdas: [{ tipo: 'assamento', percentual: 10 }],
    })
    const a = calcularCustoFicha('f1', montarCatalogo([semPerda]), SEM_CUSTOS_INDIRETOS)
    const b = calcularCustoFicha('f1', montarCatalogo([comPerda]), SEM_CUSTOS_INDIRETOS)
    expect(b.custoUnitario).toBeGreaterThan(a.custoUnitario)
    expect(b.custoUnitario).toBeCloseTo(300 / 9, 10)
  })

  it('rejeita perdas que zeram o rendimento', () => {
    const f = fichaSimples({ perdas: [{ tipo: 'defeito', percentual: 100 }] })
    expect(() => calcularCustoFicha('f1', montarCatalogo([f]), SEM_CUSTOS_INDIRETOS)).toThrow(
      /zeram o rendimento/,
    )
  })
})

/* ─────────────────────────── sub-receitas ─────────────────────────── */

describe('sub-receitas', () => {
  it('propaga o custo de massa + recheio + cobertura', () => {
    const massa: Ficha = {
      id: 'massa',
      nome: 'Massa branca',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      itens: [{ tipo: 'insumo', insumoId: 'farinha', quantidade: 500, unidade: 'g' }],
      perdas: [],
    }
    const recheio: Ficha = {
      id: 'recheio',
      nome: 'Brigadeiro de corte',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      itens: [{ tipo: 'insumo', insumoId: 'acucar', quantidade: 400, unidade: 'g' }],
      perdas: [],
    }
    const bolo: Ficha = {
      id: 'bolo',
      nome: 'Bolo recheado',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      itens: [
        { tipo: 'subficha', fichaId: 'massa', quantidade: 1, unidade: 'un' },
        { tipo: 'subficha', fichaId: 'recheio', quantidade: 2, unidade: 'un' },
      ],
      perdas: [],
    }
    const c = calcularCustoFicha('bolo', montarCatalogo([massa, recheio, bolo]), SEM_CUSTOS_INDIRETOS)
    // massa 500g*1,2 = 600 ; recheio 400g*0,5 = 200, usado 2x = 400
    expect(c.materiais).toBe(1000)
    expect(c.linhas.map((l) => l.rotulo)).toEqual(['Massa branca', 'Brigadeiro de corte'])
  })

  it('mudar o preco de um insumo propaga ate a ficha de cima (cascata)', () => {
    const massa: Ficha = {
      id: 'massa',
      nome: 'Massa',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      itens: [{ tipo: 'insumo', insumoId: 'farinha', quantidade: 1000, unidade: 'g' }],
      perdas: [],
    }
    const bolo: Ficha = {
      id: 'bolo',
      nome: 'Bolo',
      rendimentoTeorico: 1,
      unidadeRendimento: 'un',
      itens: [{ tipo: 'subficha', fichaId: 'massa', quantidade: 1, unidade: 'un' }],
      perdas: [],
    }
    const antes = calcularCustoFicha('bolo', montarCatalogo([massa, bolo]), SEM_CUSTOS_INDIRETOS)
    expect(antes.total).toBe(1200)

    const maisCara = { ...FARINHA, custoPorUnidadeBase: 1.5 }
    const depois = calcularCustoFicha(
      'bolo',
      montarCatalogo([massa, bolo], [maisCara, ACUCAR, LEITE]),
      SEM_CUSTOS_INDIRETOS,
    )
    expect(depois.total).toBe(1500)
  })

  it('detecta ciclo em vez de estourar a pilha', () => {
    const a: Ficha = {
      id: 'a', nome: 'A', rendimentoTeorico: 1, unidadeRendimento: 'un',
      itens: [{ tipo: 'subficha', fichaId: 'b', quantidade: 1, unidade: 'un' }], perdas: [],
    }
    const b: Ficha = {
      id: 'b', nome: 'B', rendimentoTeorico: 1, unidadeRendimento: 'un',
      itens: [{ tipo: 'subficha', fichaId: 'a', quantidade: 1, unidade: 'un' }], perdas: [],
    }
    expect(() => calcularCustoFicha('a', montarCatalogo([a, b]), SEM_CUSTOS_INDIRETOS)).toThrow(
      CicloDeSubReceitaError,
    )
  })
})

/* ─────────────────────────── mao de obra ─────────────────────────── */

describe('mao de obra e rateio', () => {
  it('176h vs 220h muda o valor/hora em ~25% (por isso e configuravel)', () => {
    const f = fichaSimples({ tempoPreparoMin: 60 })
    const cat = montarCatalogo([f])
    const c176 = calcularCustoFicha('f1', cat, {
      ...SEM_CUSTOS_INDIRETOS, salarioDesejadoCentavos: 300000, horasMes: 176,
    })
    const c220 = calcularCustoFicha('f1', cat, {
      ...SEM_CUSTOS_INDIRETOS, salarioDesejadoCentavos: 300000, horasMes: 220,
    })
    expect(c176.maoDeObra).toBeCloseTo(300000 / 176, 6) // ~R$ 17,05/h
    expect(c220.maoDeObra).toBeCloseTo(300000 / 220, 6) // ~R$ 13,63/h
    expect(c176.maoDeObra / c220.maoDeObra).toBeCloseTo(1.25, 2)
  })

  it('reproduz o bolo de 30cm do discovery: MO domina o custo', () => {
    // insumos R$ 7,82 | mao de obra R$ 22,00
    const insumo782: Insumo = { id: 'mix', nome: 'Insumos', custoPorUnidadeBase: 1, dimensao: 'massa' }
    const f = fichaSimples({
      itens: [{ tipo: 'insumo', insumoId: 'mix', quantidade: 782, unidade: 'g' }],
      tempoPreparoMin: 60,
    })
    const c = calcularCustoFicha('f1', montarCatalogo([f], [insumo782]), {
      ...SEM_CUSTOS_INDIRETOS, salarioDesejadoCentavos: 2200 * 176, horasMes: 176,
    })
    expect(c.materiais).toBe(782)
    expect(c.maoDeObra).toBeCloseTo(2200, 6)
    // mao de obra e ~74% do custo — "o mais esquecido de todos"
    expect(c.maoDeObra / c.total).toBeGreaterThan(0.7)
  })

  it('rateia custo fixo por unidades do mes', () => {
    const f = fichaSimples()
    const c = calcularCustoFicha('f1', montarCatalogo([f]), {
      ...SEM_CUSTOS_INDIRETOS, custoFixoMensalCentavos: 100000, unidadesMes: 1000,
    })
    expect(c.custoFixoRateado).toBe(100) // R$ 1,00 por unidade
  })
})

/* ─────────────────────────── markup e margem ─────────────────────── */

describe('markup vs margem', () => {
  it('a conversao entre os dois — o erro classico do nicho', () => {
    // aplicar "30% de markup" achando que da 30% de margem entrega 23%
    expect(markupParaMargem(1.3)).toBeCloseTo(23.08, 2)
    // para ter 50% de margem o multiplicador e 2,0, nao 1,5
    expect(margemParaMarkup(50)).toBeCloseTo(2.0, 10)
    expect(markupParaMargem(2.0)).toBeCloseTo(50, 10)
    expect(markupParaMargem(2.5)).toBeCloseTo(60, 10)
    expect(markupParaMargem(3.0)).toBeCloseTo(66.67, 2)
  })

  it('base "materiais": MO e rateio entram por fora, nao multiplicados', () => {
    const f = fichaSimples({ tempoPreparoMin: 60 })
    const c = calcularCustoFicha('f1', montarCatalogo([f]), {
      ...SEM_CUSTOS_INDIRETOS, salarioDesejadoCentavos: 176 * 1000, horasMes: 176,
    })
    expect(c.materiais).toBe(300)
    expect(c.maoDeObra).toBeCloseTo(1000, 6)

    const p = calcularPreco(c, { base: 'materiais', multiplicador: 2.5 })
    // 300 * 2,5 + 1000 = 1750
    expect(p.precoUnitario).toBe(1750)
  })

  it('base "custo_total" multiplica tudo — resultado bem diferente', () => {
    const f = fichaSimples({ tempoPreparoMin: 60 })
    const c = calcularCustoFicha('f1', montarCatalogo([f]), {
      ...SEM_CUSTOS_INDIRETOS, salarioDesejadoCentavos: 176 * 1000, horasMes: 176,
    })
    const p = calcularPreco(c, { base: 'custo_total', multiplicador: 2.5 })
    // (300 + 1000) * 2,5 = 3250 — quase o dobro do outro
    expect(p.precoUnitario).toBe(3250)
  })

  it('reporta margem e CMV junto do preco', () => {
    const c = calcularCustoFicha('f1', montarCatalogo([fichaSimples()]), SEM_CUSTOS_INDIRETOS)
    const p = calcularPreco(c, { base: 'materiais', multiplicador: 2.5 })
    expect(p.precoUnitario).toBe(750)
    expect(p.margemPercentual).toBeCloseTo(60, 10)
    expect(p.cmvPercentual).toBeCloseTo(40, 10)
  })

  it('rejeita multiplicador invalido', () => {
    const c = calcularCustoFicha('f1', montarCatalogo([fichaSimples()]), SEM_CUSTOS_INDIRETOS)
    expect(() => calcularPreco(c, { base: 'materiais', multiplicador: 0 })).toThrow()
  })
})

/* ─────────────────────────── canal ─────────────────────────── */

describe('gross-up de canal', () => {
  it('e por DIVISAO — somar a taxa nao recompoe a margem', () => {
    const base = 3000 // R$ 30,00
    const correto = aplicarTaxaDeCanal(base, 26.5) // iFood Entrega
    const erradoSomando = arredondarCentavos(base * 1.265)

    expect(correto).toBe(4082) // R$ 40,82
    expect(erradoSomando).toBe(3795) // R$ 37,95 — R$ 2,87 a menos
    expect(correto).toBeGreaterThan(erradoSomando)
  })

  it('recompoe exatamente o liquido desejado', () => {
    const desejado = 3000
    const comTaxa = aplicarTaxaDeCanal(desejado, 26.5)
    const liquido = comTaxa * (1 - 0.265)
    expect(Math.abs(liquido - desejado)).toBeLessThan(1) // menos de 1 centavo
  })

  it('iFood Basico (~15,2%)', () => {
    expect(aplicarTaxaDeCanal(3000, 15.2)).toBe(3538) // R$ 35,38
  })

  it('taxa 0 nao altera o preco', () => {
    expect(aplicarTaxaDeCanal(3000, 0)).toBe(3000)
  })

  it('rejeita taxa >= 100% (divisao por zero ou negativo)', () => {
    expect(() => aplicarTaxaDeCanal(3000, 100)).toThrow()
    expect(() => aplicarTaxaDeCanal(3000, 150)).toThrow()
    expect(() => aplicarTaxaDeCanal(3000, -1)).toThrow()
  })
})
