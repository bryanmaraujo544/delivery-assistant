import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Primitivas de OTP e sessao. Funcoes puras — sem I/O, sem banco — para
 * poderem ser testadas sozinhas. As decisoes de seguranca vivem aqui.
 */

export const OTP_DIGITOS = 6
export const OTP_VALIDADE_MS = 10 * 60_000
export const OTP_MAX_TENTATIVAS = 5
export const SESSAO_VALIDADE_MS = 30 * 24 * 60 * 60_000

/**
 * `Math.random()` NAO serve para gerar codigo de autenticacao: e previsivel a
 * partir de saidas anteriores. `randomInt` usa a fonte criptografica do SO.
 */
export function gerarCodigo(): string {
  return String(randomInt(0, 10 ** OTP_DIGITOS)).padStart(OTP_DIGITOS, '0')
}

/**
 * HMAC, nao hash simples.
 *
 * 6 digitos sao 1 milhao de possibilidades — um SHA-256 puro cai por forca
 * bruta offline em segundos se o banco vazar. Com HMAC, quem nao tem o segredo
 * do servidor nao consegue nem comecar.
 *
 * O e-mail entra na mensagem para que o mesmo codigo emitido a duas pessoas
 * gere hashes diferentes.
 */
export function hashCodigo(codigo: string, email: string, segredo: string): string {
  return createHmac('sha256', segredo).update(`${email}:${codigo}`).digest('hex')
}

/**
 * Comparacao em tempo constante.
 *
 * `a === b` sai no primeiro byte diferente, o que vaza — pelo tempo de resposta
 * — quantos caracteres iniciais estavam certos. Com codigo curto isso e
 * explorável.
 */
export function compararHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Token de sessao: 256 bits de entropia, opaco, sem significado embutido. */
export function gerarTokenSessao(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Aqui SHA-256 puro basta (diferente do OTP): 256 bits aleatorios nao tem
 * espaco de busca viavel, entao nao ha o que proteger com segredo extra.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Minusculo e sem espaco. "  Ana@X.com " e "ana@x.com" sao a mesma pessoa. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}
