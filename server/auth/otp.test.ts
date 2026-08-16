import { describe, expect, it } from 'vitest'
import {
  OTP_DIGITOS,
  compararHash,
  gerarCodigo,
  gerarTokenSessao,
  hashCodigo,
  hashToken,
  normalizarEmail,
} from './otp'

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'

describe('geração de código', () => {
  it('tem sempre 6 dígitos, incluindo os que começam com zero', () => {
    for (let i = 0; i < 500; i++) {
      const c = gerarCodigo()
      expect(c).toMatch(/^\d{6}$/)
      expect(c.length).toBe(OTP_DIGITOS)
    }
  })

  it('cobre a faixa toda e não repete de forma óbvia', () => {
    const amostra = new Set(Array.from({ length: 300 }, gerarCodigo))
    // com 1M de possibilidades, 300 sorteios praticamente nao colidem
    expect(amostra.size).toBeGreaterThan(290)
  })
})

describe('hash do código', () => {
  it('é determinístico', () => {
    expect(hashCodigo('123456', 'a@b.com', SEGREDO)).toBe(hashCodigo('123456', 'a@b.com', SEGREDO))
  })

  it('nunca contém o código em claro', () => {
    expect(hashCodigo('123456', 'a@b.com', SEGREDO)).not.toContain('123456')
  })

  it('o mesmo código para e-mails diferentes gera hashes diferentes', () => {
    // sem isso, um código vazado serviria para outra conta
    expect(hashCodigo('123456', 'a@b.com', SEGREDO)).not.toBe(
      hashCodigo('123456', 'c@d.com', SEGREDO),
    )
  })

  it('trocar o segredo invalida os hashes — é o que protege se o banco vazar', () => {
    expect(hashCodigo('123456', 'a@b.com', SEGREDO)).not.toBe(
      hashCodigo('123456', 'a@b.com', 'outro-segredo-igualmente-longo-aqui'),
    )
  })
})

describe('comparação em tempo constante', () => {
  it('aceita iguais e rejeita diferentes', () => {
    const h = hashCodigo('123456', 'a@b.com', SEGREDO)
    expect(compararHash(h, h)).toBe(true)
    expect(compararHash(h, hashCodigo('654321', 'a@b.com', SEGREDO))).toBe(false)
  })

  it('não estoura com tamanhos diferentes (timingSafeEqual lançaria)', () => {
    expect(compararHash('abc', 'abcdef')).toBe(false)
    expect(compararHash('', 'x')).toBe(false)
  })
})

describe('token de sessão', () => {
  it('é único e tem entropia alta', () => {
    const tokens = new Set(Array.from({ length: 1000 }, gerarTokenSessao))
    expect(tokens.size).toBe(1000)
    // 32 bytes em base64url => 43 caracteres
    expect(gerarTokenSessao()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('o hash é determinístico e não devolve o token', () => {
    const t = gerarTokenSessao()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toContain(t)
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('normalização de e-mail', () => {
  it('trata variações de caixa e espaço como a mesma pessoa', () => {
    expect(normalizarEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
    expect(normalizarEmail('ANA@EXEMPLO.COM')).toBe(normalizarEmail('ana@exemplo.com'))
  })
})
