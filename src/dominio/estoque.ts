import type { Venda } from './venda'

/**
 * Estoque de produto pronto.
 *
 * O saldo NAO e guardado em lugar nenhum. O que existe sao contagens ("agora
 * tem 12") e as vendas; o saldo e a ultima contagem menos o que foi vendido
 * depois dela.
 *
 * Por que nao um campo `estoque` no produto: com caixa no balcao e celular na
 * cozinha, dois aparelhos vendendo o mesmo bolo gravariam cada um o seu
 * numero, e o ultimo apagaria a baixa do outro. Somando fatos, cada venda
 * conta uma vez, em qualquer ordem que chegue.
 *
 * De brinde: excluir uma venda devolve o estoque sem nenhum codigo de
 * estorno — a venda cancelada simplesmente deixa de entrar na soma.
 */

export interface ContagemEstoque {
  id: string
  produtoId: string
  /** quanto havia no momento da contagem; null = parou de controlar o estoque */
  quantidade: number | null
  criadoEm: number
}

/** Ultima contagem de cada produto. */
export function ultimasContagens(contagens: ContagemEstoque[]): Map<string, ContagemEstoque> {
  const ultimas = new Map<string, ContagemEstoque>()
  for (const c of contagens) {
    const atual = ultimas.get(c.produtoId)
    if (!atual || c.criadoEm > atual.criadoEm) ultimas.set(c.produtoId, c)
  }
  return ultimas
}

/**
 * Saldo por produto. Produto fora do mapa = estoque nao controlado (que e
 * diferente de zero: bolo de encomenda nao tem "quantidade na vitrine").
 *
 * O saldo pode ficar NEGATIVO, e isso e informacao: vendeu-se mais do que a
 * contagem dizia ter, entao a contagem estava errada.
 */
export function estoqueAtual(contagens: ContagemEstoque[], vendas: Venda[]): Map<string, number> {
  const saldo = new Map<string, number>()
  const ultimas = ultimasContagens(contagens)
  for (const [produtoId, c] of ultimas) {
    if (c.quantidade != null) saldo.set(produtoId, c.quantidade)
  }
  for (const v of vendas) {
    if (v.canceladaEm) continue
    for (const i of v.itens) {
      const c = ultimas.get(i.produtoId)
      // so baixa o que foi vendido DEPOIS da contagem: o que saiu antes ja
      // estava descontado no numero que a pessoa contou
      if (c?.quantidade == null || v.criadaEm <= c.criadoEm) continue
      saldo.set(i.produtoId, saldo.get(i.produtoId)! - i.quantidade)
    }
  }
  return saldo
}
