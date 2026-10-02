/**
 * Ordem manual dos produtos na tela de venda.
 *
 * Quem tem `ordem` vem primeiro, na ordem escolhida; quem ainda nao tem
 * (produto recem-criado) vai para o fim, por nome. Assim cadastrar um produto
 * novo nunca embaralha a arrumacao que a pessoa fez.
 */
export function ordenarProdutos<T extends { nome: string; ordem?: number | null }>(produtos: T[]): T[] {
  return [...produtos].sort((a, b) => {
    const oa = a.ordem ?? Infinity
    const ob = b.ordem ?? Infinity
    return oa !== ob ? (oa < ob ? -1 : 1) : a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/** Tira `id` de onde esta e o poe na posicao que `alvoId` ocupa. */
export function moverPara(ids: string[], id: string, alvoId: string): string[] {
  const de = ids.indexOf(id)
  const para = ids.indexOf(alvoId)
  if (de < 0 || para < 0 || de === para) return ids
  const copia = [...ids]
  copia.splice(de, 1)
  copia.splice(para, 0, id)
  return copia
}
