import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Wrapper tipado em vez de `promisify`: o promisify colapsa as sobrecargas do
 * scrypt e perde o parametro de opcoes, entao `{ N, r, p }` seria silenciosamente
 * ignorado — o hash sairia com os parametros padrao, bem mais fracos.
 */
const scrypt = (senha: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(senha, salt, keylen, opts, (err, dk) => (err ? reject(err) : resolve(dk))),
  )

/**
 * Hash de senha com scrypt.
 *
 * Por que scrypt e nao bcrypt/argon2: vem no `node:crypto`, sem dependencia
 * nativa para compilar no deploy. Argon2id seria marginalmente melhor, mas
 * exige modulo nativo — e modulo nativo e uma das formas mais comuns de um
 * build quebrar em container.
 *
 * Por que NAO sha256/md5: sao rapidos DE PROPOSITO, o que e exatamente o que
 * nao se quer aqui. Uma GPU testa bilhoes de sha256 por segundo; scrypt e
 * memory-hard e derruba essa vantagem.
 */

/** 2^15 iteracoes. Custa ~100ms por verificacao — lento para o atacante,
 *  imperceptivel para quem esta logando. */
const N = 32768
const r = 8
const p = 1
const KEYLEN = 64
const SALT_BYTES = 16

// scrypt precisa de memoria proporcional a N*r; sem isso o Node recusa
const MAXMEM = 128 * N * r * 2

export const SENHA_MIN = 8

/**
 * Formato: scrypt$N$r$p$salt$hash
 *
 * Guardar os parametros junto permite aumentar o custo no futuro sem
 * invalidar as senhas ja existentes — cada hash sabe como foi gerado.
 */
export async function hashSenha(senha: string): Promise<string> {
  if (senha.length < SENHA_MIN) throw new Error(`senha precisa de ${SENHA_MIN}+ caracteres`)
  const salt = randomBytes(SALT_BYTES)
  const derivada = await scrypt(senha.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: MAXMEM })
  return ['scrypt', N, r, p, salt.toString('base64'), derivada.toString('base64')].join('$')
}

/**
 * Verifica em tempo constante.
 *
 * Retorna false em vez de lancar quando o hash esta corrompido: um registro
 * ruim no banco nao deve virar 500 nem revelar nada ao cliente.
 */
export async function verificarSenha(senha: string, guardado: string): Promise<boolean> {
  try {
    const [algo, sN, sr, sp, saltB64, hashB64] = guardado.split('$')
    if (algo !== 'scrypt' || !saltB64 || !hashB64) return false

    const nN = Number(sN)
    const nr = Number(sr)
    const np = Number(sp)
    if (!nN || !nr || !np) return false

    const salt = Buffer.from(saltB64, 'base64')
    const esperado = Buffer.from(hashB64, 'base64')
    const derivada = await scrypt(senha.normalize('NFKC'), salt, esperado.length, {
      N: nN,
      r: nr,
      p: np,
      maxmem: 128 * nN * nr * 2,
    })

    if (derivada.length !== esperado.length) return false
    return timingSafeEqual(derivada, esperado)
  } catch {
    return false
  }
}
