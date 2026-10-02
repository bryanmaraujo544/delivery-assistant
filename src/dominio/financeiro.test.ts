import { describe, expect, it } from 'vitest'
import {
  diasNoMes,
  mesDe,
  parcelar,
  repeticoesPendentes,
  resultadoDoMes,
  somarMeses,
  type Despesa,
} from './financeiro'
import type { Venda } from './venda'

const em = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia, 12).getTime()

const venda = (totalCentavos: number, criadaEm: number, over: Partial<Venda> = {}): Venda => ({
  id: `v${criadaEm}${totalCentavos}`,
  sessaoId: 's',
  itens: [{ produtoId: 'p', nome: 'Bolo', precoUnitarioCentavos: totalCentavos, quantidade: 1, custoUnitarioCentavos: null }],
  descontoCentavos: 0,
  totalCentavos,
  pagamentos: [{ forma: 'pix', valorCentavos: totalCentavos }],
  trocoCentavos: 0,
  criadaEm,
  ...over,
})

let n = 0
const despesa = (categoria: string, valorCentavos: number, over: Partial<Despesa> = {}): Despesa => ({
  id: `d${++n}`,
  descricao: categoria,
  categoria,
  valorCentavos,
  mes: '2026-10',
  repete: false,
  serieId: `s${n}`,
  pagoEm: 1,
  ...over,
})

describe('meses', () => {
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-11', 3)).toBe('2027-02')
    expect(somarMeses('2026-01', -1)).toBe('2025-12')
  })
  it('mes de um instante e dias do mes', () => {
    expect(mesDe(em(2026, 10, 31))).toBe('2026-10')
    expect(diasNoMes('2026-02')).toBe(28)
    expect(diasNoMes('2028-02')).toBe(29)
  })
})

describe('resultadoDoMes', () => {
  const vendas = [venda(600_000, em(2026, 10, 5)), venda(400_000, em(2026, 10, 20))]
  const despesas = [
    despesa('insumos', 300_000),
    despesa('taxas', 50_000),
    despesa('aluguel', 200_000),
    despesa('luz', 60_000, { pagoEm: null }),
  ]

  it('monta a DRE simplificada na ordem certa', () => {
    const r = resultadoDoMes('2026-10', vendas, despesas)
    expect(r.faturamentoCentavos).toBe(1_000_000)
    expect(r.custoProdutosCentavos).toBe(300_000)
    expect(r.despesasVariaveisCentavos).toBe(50_000)
    expect(r.margemContribuicaoCentavos).toBe(650_000)
    expect(r.despesasFixasCentavos).toBe(260_000)
    expect(r.resultadoCentavos).toBe(390_000)
    expect(r.margemPercentual).toBeCloseTo(39)
    expect(r.aPagarCentavos).toBe(60_000)
  })

  it('ponto de equilibrio: fixas dividido pelo indice de margem de contribuicao', () => {
    // sobra 65% de cada real vendido; 2.600 de fixas / 0,65 = 4.000
    expect(resultadoDoMes('2026-10', vendas, despesas).pontoEquilibrioCentavos).toBe(400_000)
  })

  it('so entra o que e do mes: venda e despesa de outro mes ficam fora', () => {
    const r = resultadoDoMes(
      '2026-10',
      [...vendas, venda(999_999, em(2026, 11, 1)), venda(999_999, em(2026, 9, 30))],
      [...despesas, despesa('aluguel', 999_999, { mes: '2026-11' })],
    )
    expect(r.faturamentoCentavos).toBe(1_000_000)
    expect(r.despesasFixasCentavos).toBe(260_000)
  })

  it('venda excluida nao e faturamento', () => {
    const r = resultadoDoMes('2026-10', [...vendas, venda(100_000, em(2026, 10, 9), { canceladaEm: 1 })], [])
    expect(r.faturamentoCentavos).toBe(1_000_000)
  })

  it('mes sem venda: prejuizo igual as despesas, sem margem nem ponto de equilibrio', () => {
    const r = resultadoDoMes('2026-10', [], despesas)
    expect(r.resultadoCentavos).toBe(-610_000)
    expect(r.margemPercentual).toBeNull()
    expect(r.pontoEquilibrioCentavos).toBeNull()
  })

  it('vendendo abaixo do custo nao ha ponto de equilibrio', () => {
    const r = resultadoDoMes('2026-10', [venda(100_000, em(2026, 10, 5))], [despesa('insumos', 150_000)])
    expect(r.pontoEquilibrioCentavos).toBeNull()
  })

  it('agrupa por categoria, da maior para a menor, e categoria desconhecida vira Outros', () => {
    const r = resultadoDoMes('2026-10', [], [
      despesa('luz', 100),
      despesa('luz', 200),
      despesa('aluguel', 1000),
      despesa('categoria-de-versao-futura', 50),
    ])
    expect(r.porCategoria.map((c) => [c.codigo, c.totalCentavos])).toEqual([
      ['aluguel', 1000],
      ['luz', 300],
      ['outros', 50],
    ])
    expect(r.despesasFixasCentavos).toBe(1350)
  })
})

describe('parcelar', () => {
  it('uma despesa por mes, valor da parcela em cada uma', () => {
    const { id: _, ...base } = despesa('equipamentos', 25_000, { mes: '2026-11', pagoEm: 123 })
    const ps = parcelar(base, 3)
    expect(ps.map((p) => [p.mes, p.parcela, p.parcelas, p.valorCentavos])).toEqual([
      ['2026-11', 1, 3, 25_000],
      ['2026-12', 2, 3, 25_000],
      ['2027-01', 3, 3, 25_000],
    ])
    expect(new Set(ps.map((p) => p.serieId)).size).toBe(1)
    // so a primeira herda o "pago"
    expect(ps.map((p) => p.pagoEm)).toEqual([123, null, null])
  })
  it('recusa menos de 2 parcelas', () => {
    const { id: _, ...base } = despesa('equipamentos', 100)
    expect(() => parcelar(base, 1)).toThrow()
  })
})

describe('repeticoesPendentes', () => {
  const setembro = [
    despesa('aluguel', 200_000, { mes: '2026-09', repete: true, serieId: 'aluguel' }),
    despesa('luz', 55_000, { mes: '2026-09', repete: true, serieId: 'luz' }),
    despesa('manutencao', 30_000, { mes: '2026-09', serieId: 'conserto' }),
  ]

  it('traz as que se repetem, como a pagar; a avulsa nao vem', () => {
    const r = repeticoesPendentes('2026-10', setembro)
    expect(r.map((d) => [d.serieId, d.mes, d.pagoEm])).toEqual([
      ['aluguel', '2026-10', null],
      ['luz', '2026-10', null],
    ])
  })

  it('nao duplica a que ja existe no mes', () => {
    const r = repeticoesPendentes('2026-10', [
      ...setembro,
      despesa('aluguel', 210_000, { mes: '2026-10', repete: true, serieId: 'aluguel' }),
    ])
    expect(r.map((d) => d.serieId)).toEqual(['luz'])
  })
})
