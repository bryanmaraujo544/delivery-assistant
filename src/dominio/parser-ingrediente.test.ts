import { describe, expect, it } from 'vitest'
import { parsearLinha, parsearReceita, resolverLinha } from './parser-ingrediente'

describe('parse de linha', () => {
  it('métrica grudada no número: "250g farinha de trigo"', () => {
    const r = parsearLinha('250g farinha de trigo')
    expect(r.quantidade).toBe(250)
    expect(r.unidade?.codigo).toBe('g')
    expect(r.unidade?.classe).toBe('metrica')
    expect(r.descricao).toBe('farinha de trigo')
  })

  it('métrica por extenso: "500 gramas de açúcar"', () => {
    const r = parsearLinha('500 gramas de açúcar')
    expect(r.quantidade).toBe(500)
    expect(r.unidade?.codigo).toBe('g')
    expect(r.descricao).toBe('açúcar')
  })

  it('contagem sem unidade: "2 ovos"', () => {
    const r = parsearLinha('2 ovos')
    expect(r.quantidade).toBe(2)
    expect(r.unidade).toBeNull()
    expect(r.descricao).toBe('ovos')
  })

  it('vírgula como separador decimal: "1,5 kg de chocolate"', () => {
    const r = parsearLinha('1,5 kg de chocolate meio amargo')
    expect(r.quantidade).toBe(1.5)
    expect(r.unidade?.codigo).toBe('kg')
    expect(r.descricao).toBe('chocolate meio amargo')
  })

  it('embalagem inteira: "1 lata de leite condensado"', () => {
    // caso central do nicho: receita calibrada para fechar a embalagem
    const r = parsearLinha('1 lata de leite condensado')
    expect(r.quantidade).toBe(1)
    expect(r.unidade?.classe).toBe('embalagem')
    expect(r.descricao).toBe('leite condensado')
  })

  it('"1 caixinha de creme de leite" não vira nome de ingrediente', () => {
    const r = parsearLinha('1 caixinha de creme de leite')
    expect(r.unidade?.classe).toBe('embalagem')
    expect(r.descricao).toBe('creme de leite')
  })

  it('medida caseira é RECONHECIDA mas não convertida', () => {
    // 1 xícara de farinha ~120g, de açúcar ~200g: converter sem densidade
    // daria número errado com cara de certo
    const r = parsearLinha('1/2 xícara de açúcar')
    expect(r.quantidade).toBe(0.5)
    expect(r.unidade?.classe).toBe('caseira')
    expect(r.unidade?.codigo).toBe('@caseira')
    expect(r.descricao).toBe('açúcar')
  })

  it('colher de sopa também é caseira', () => {
    const r = parsearLinha('2 colheres de sopa de manteiga')
    expect(r.unidade?.classe).toBe('caseira')
    expect(r.descricao).toContain('manteiga')
  })

  it('título de bloco não é ingrediente', () => {
    expect(parsearLinha('Para a massa:').ehTitulo).toBe(true)
    expect(parsearLinha('Para a cobertura:').ehTitulo).toBe(true)
  })

  it('linha sem quantidade não quebra — vira só o nome', () => {
    const r = parsearLinha('essência de baunilha a gosto')
    expect(r.descricao).toContain('baunilha')
    expect(r.ehTitulo).toBe(false)
  })

  it('texto vazio não estoura', () => {
    expect(() => parsearLinha('')).not.toThrow()
  })
})

describe('colar receita inteira', () => {
  it('parseia um bloco real com marcadores e títulos', () => {
    const colado = `
Para a massa:
- 250g farinha de trigo
- 200 g de açúcar refinado
- 3 ovos
• 1/2 xícara de óleo

Para a cobertura:
- 1 lata de leite condensado
- 2 colheres de sopa de chocolate em pó
    `.trim()

    const linhas = parsearReceita(colado)
    const titulos = linhas.filter((l) => l.ehTitulo)
    const itens = linhas.filter((l) => !l.ehTitulo)

    expect(titulos).toHaveLength(2)
    expect(itens).toHaveLength(6)

    // marcadores de lista foram removidos, não viraram parte do nome
    expect(itens.every((i) => !/^[-•*]/.test(i.descricao))).toBe(true)

    expect(itens[0]).toMatchObject({ quantidade: 250, descricao: 'farinha de trigo' })
    expect(itens[2]).toMatchObject({ quantidade: 3, descricao: 'ovos' })
    expect(itens[4]?.unidade?.classe).toBe('embalagem')
  })

  it('ignora linhas em branco', () => {
    expect(parsearReceita('\n\n  \n250g farinha\n\n')).toHaveLength(1)
  })

  it('uma receita de 12 linhas vira 1 colagem, não 12 cadastros', () => {
    const doze = Array.from({ length: 12 }, (_, i) => `${(i + 1) * 10}g ingrediente ${i}`).join('\n')
    expect(parsearReceita(doze)).toHaveLength(12)
  })
})

describe('resolução contra o catálogo', () => {
  const CATALOGO = [
    { id: '1', nome: 'Farinha de trigo', nomeNormalizado: 'farinha de trigo', dimensao: 'massa' as const, embalagemQuantidade: 1, embalagemUnidade: 'kg' },
    { id: '2', nome: 'Leite condensado', nomeNormalizado: 'leite condensado', dimensao: 'massa' as const, embalagemQuantidade: 395, embalagemUnidade: 'g' },
    { id: '3', nome: 'Ovo', nomeNormalizado: 'ovo', dimensao: 'contagem' as const, embalagemQuantidade: 30, embalagemUnidade: 'un' },
    { id: '4', nome: 'Leite integral', nomeNormalizado: 'leite integral', dimensao: 'volume' as const, embalagemQuantidade: 1, embalagemUnidade: 'l' },
    { id: '5', nome: 'Chocolate em pó', nomeNormalizado: 'chocolate em po', dimensao: 'massa' as const, embalagemQuantidade: 200, embalagemUnidade: 'g' },
    { id: '6', nome: 'Chocolate branco', nomeNormalizado: 'chocolate branco', dimensao: 'massa' as const, embalagemQuantidade: 1, embalagemUnidade: 'kg' },
  ]
  const resolver = (t: string) => resolverLinha(parsearLinha(t), CATALOGO)

  it('métrica que bate com a dimensão fica pronta', () => {
    const r = resolver('250g farinha de trigo')
    expect(r.status).toBe('pronto')
    expect(r.insumo?.nome).toBe('Farinha de trigo')
    expect(r.quantidade).toBe(250)
    expect(r.unidade).toBe('g')
  })

  it('casa sem acento: "chocolate em po" encontra "Chocolate em pó"', () => {
    expect(resolver('40g chocolate em po').insumo?.nome).toBe('Chocolate em pó')
  })

  it('"1 lata de leite condensado" vira 395 g', () => {
    // a receita do nicho e calibrada para fechar a embalagem
    const r = resolver('1 lata de leite condensado')
    expect(r.status).toBe('pronto')
    expect(r.quantidade).toBe(395)
    expect(r.unidade).toBe('g')
    expect(r.aviso).toContain('395')
  })

  it('"2 ovos" resolve para 2 un', () => {
    const r = resolver('2 ovos')
    expect(r.status).toBe('pronto')
    expect(r.quantidade).toBe(2)
    expect(r.unidade).toBe('un')
  })

  it('medida caseira NÃO é convertida — pede revisão e explica', () => {
    const r = resolver('1 xícara de farinha de trigo')
    expect(r.status).toBe('revisar')
    expect(r.insumo?.nome).toBe('Farinha de trigo')
    expect(r.aviso).toMatch(/densidade/)
  })

  it('ml em insumo de massa é recusado, não convertido às cegas', () => {
    const r = resolver('100 ml de farinha de trigo')
    expect(r.status).toBe('revisar')
    expect(r.aviso).toMatch(/não serve/)
  })

  it('insumo inexistente vira "novo"', () => {
    const r = resolver('50g de pistache')
    expect(r.status).toBe('novo')
    expect(r.insumo).toBeNull()
  })

  it('termo ambíguo devolve os candidatos em vez de escolher sozinho', () => {
    const r = resolver('100g chocolate')
    expect(r.status).toBe('ambiguo')
    expect(r.candidatos.length).toBeGreaterThan(1)
  })

  it('sem quantidade pede revisão', () => {
    expect(resolver('farinha de trigo a gosto').status).toBe('revisar')
  })
})
