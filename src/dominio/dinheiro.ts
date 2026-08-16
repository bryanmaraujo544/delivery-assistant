/**
 * Dinheiro no sistema.
 *
 * REGRA: valor digitado pela usuaria e SEMPRE inteiro em centavos.
 * Nunca `12.34` — sempre `1234`. Isso elimina a classe inteira de bugs de
 * ponto flutuante na entrada e no armazenamento.
 *
 * Durante o calculo, porem, centavo fracionado e inevitavel e CORRETO:
 * farinha a R$ 12,00/kg custa 1,2 centavos por grama. Arredondar isso para
 * 1 centavo erraria o custo em 17%. Entao o pipeline e:
 *
 *   entrada (inteiro) -> calculo (fracionado) -> saida (arredonda 1x no fim)
 *
 * Arredondar no meio do caminho e o erro classico de sistema de custo.
 */

/** Inteiro. Ex.: 1234 = R$ 12,34 */
export type Centavos = number

/** Pode ter casas decimais. Ex.: 1.2 centavos por grama. Uso interno. */
export type CentavosFracionados = number

/**
 * Arredonda para centavo inteiro, meio-para-cima.
 *
 * O `Number.EPSILON` corrige o caso em que uma soma de floats produz algo como
 * 2.4999999999999996 quando o valor exato seria 2.5 — sem ele, arredondaria
 * para 2 em vez de 3.
 */
export function arredondarCentavos(valor: CentavosFracionados): Centavos {
  if (!Number.isFinite(valor)) {
    throw new Error(`valor monetario invalido: ${valor}`)
  }
  const sinal = valor < 0 ? -1 : 1
  const abs = Math.abs(valor)
  return sinal * Math.round(abs + Number.EPSILON * abs)
}

/** Formata para exibicao em pt-BR. Aceita centavos fracionados. */
export function formatarBRL(valor: CentavosFracionados): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(arredondarCentavos(valor) / 100)
}

/**
 * Converte o que a usuaria digitou em centavos inteiros.
 *
 * Aceita os formatos que aparecem de verdade num teclado mobile pt-BR:
 * "12,34" · "12.34" · "1.234,56" · "R$ 12,34" · "12".
 */
export function parseValorBRL(texto: string): Centavos {
  const limpo = texto.replace(/[^\d.,-]/g, '').trim()
  if (limpo === '' || limpo === '-') throw new Error(`valor invalido: "${texto}"`)

  const temVirgula = limpo.includes(',')
  const temPonto = limpo.includes('.')

  let normalizado: string
  if (temVirgula && temPonto) {
    // "1.234,56" -> ponto e separador de milhar
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.')
  } else {
    normalizado = limpo
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) throw new Error(`valor invalido: "${texto}"`)
  return arredondarCentavos(n * 100)
}
