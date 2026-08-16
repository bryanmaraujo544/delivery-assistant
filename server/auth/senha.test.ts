import { describe, expect, it } from 'vitest'
import { SENHA_MIN, hashSenha, verificarSenha } from './senha'

describe('hash de senha', () => {
  it('aceita a senha correta e rejeita a errada', async () => {
    const h = await hashSenha('bolo-de-cenoura-2026')
    expect(await verificarSenha('bolo-de-cenoura-2026', h)).toBe(true)
    expect(await verificarSenha('bolo-de-cenoura-2025', h)).toBe(false)
  })

  it('nunca guarda a senha em claro', async () => {
    const h = await hashSenha('senha-secreta-123')
    expect(h).not.toContain('senha-secreta-123')
  })

  it('a MESMA senha gera hashes DIFERENTES (salt por usuária)', async () => {
    // sem salt unico, duas pessoas com a mesma senha teriam o mesmo hash —
    // e quebrar uma quebraria as duas
    const a = await hashSenha('mesma-senha-aqui')
    const b = await hashSenha('mesma-senha-aqui')
    expect(a).not.toBe(b)
    expect(await verificarSenha('mesma-senha-aqui', a)).toBe(true)
    expect(await verificarSenha('mesma-senha-aqui', b)).toBe(true)
  })

  it('carrega os parâmetros no próprio hash, para poder encarecer no futuro', async () => {
    const h = await hashSenha('uma-senha-valida')
    const [algo, N, r, p] = h.split('$')
    expect(algo).toBe('scrypt')
    expect(Number(N)).toBeGreaterThanOrEqual(16384)
    expect(Number(r)).toBeGreaterThan(0)
    expect(Number(p)).toBeGreaterThan(0)
  })

  it('recusa senha curta demais', async () => {
    await expect(hashSenha('1234567')).rejects.toThrow()
    await expect(hashSenha('')).rejects.toThrow()
    await expect(hashSenha('a'.repeat(SENHA_MIN))).resolves.toBeTruthy()
  })

  it('normaliza unicode — acento composto e pré-composto são a mesma senha', async () => {
    // "pão" digitado no iPhone e no Android pode chegar com bytes diferentes
    const composto = 'pão-de-mel-123' // a + til
    const precomposto = 'pão-de-mel-123' // ã
    const h = await hashSenha(composto)
    expect(await verificarSenha(precomposto, h)).toBe(true)
  })

  it('não estoura com hash corrompido no banco — retorna false', async () => {
    for (const ruim of ['', 'lixo', 'scrypt$$$$', 'md5$1$1$1$aaaa$bbbb', 'scrypt$0$0$0$a$b']) {
      expect(await verificarSenha('qualquer-senha', ruim)).toBe(false)
    }
  })

  it('é lento de propósito (defesa contra força bruta)', async () => {
    const inicio = Date.now()
    await hashSenha('medindo-o-custo-123')
    // sha256 levaria microssegundos; se cair abaixo de 20ms, os parâmetros
    // foram enfraquecidos por engano
    expect(Date.now() - inicio).toBeGreaterThan(20)
  })
})
