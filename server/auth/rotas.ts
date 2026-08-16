import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db'
import type { EnviadorEmail } from '../email'
import { otpCodigo, sessao, tenant, tenantMembro, usuario } from '../../src/db/schema'
import {
  OTP_MAX_TENTATIVAS,
  OTP_VALIDADE_MS,
  SESSAO_VALIDADE_MS,
  compararHash,
  gerarCodigo,
  gerarTokenSessao,
  hashCodigo,
  hashToken,
  normalizarEmail,
} from './otp'

const solicitarSchema = z.object({ email: z.email().max(254) })
const verificarSchema = z.object({
  email: z.email().max(254),
  codigo: z.string().regex(/^\d{6}$/, 'código deve ter 6 dígitos'),
})

export async function registrarRotasAuth(app: FastifyInstance, enviador: EnviadorEmail) {
  const segredo = process.env.AUTH_SECRET
  if (!segredo || segredo.length < 32) {
    throw new Error('AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres)')
  }

  /**
   * Pede um código.
   *
   * Responde SEMPRE `{ ok: true }`, exista ou não a conta. Diferenciar as
   * respostas transformaria este endpoint num verificador de e-mails
   * cadastrados — vazamento clássico de enumeração de usuários.
   */
  app.post(
    '/auth/otp/solicitar',
    {
      config: {
        // 5 pedidos por 15 min por IP: o custo do Resend e a caixa de entrada
        // de quem for alvo de spam dependem disso
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (req, reply) => {
      const parse = solicitarSchema.safeParse(req.body)
      if (!parse.success) return reply.code(400).send({ erro: 'e-mail inválido' })

      const email = normalizarEmail(parse.data.email)
      const codigo = gerarCodigo()

      await db.insert(otpCodigo).values({
        email,
        codigoHash: hashCodigo(codigo, email, segredo),
        expiraEm: new Date(Date.now() + OTP_VALIDADE_MS),
      })

      try {
        await enviador.enviar(
          email,
          `${codigo} é seu código de acesso`,
          `Seu código de acesso é ${codigo}.\n\nEle vale por 10 minutos e só pode ser usado uma vez.\nSe você não pediu, ignore este e-mail.`,
        )
      } catch (e) {
        // logamos o erro real, mas nao contamos ao cliente se o envio falhou —
        // isso tambem revelaria existencia de conta
        req.log.error({ err: e }, 'falha ao enviar OTP')
      }

      return { ok: true }
    },
  )

  /** Troca o código por um token de sessão. */
  app.post(
    '/auth/otp/verificar',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const parse = verificarSchema.safeParse(req.body)
      if (!parse.success) return reply.code(400).send({ erro: 'dados inválidos' })

      const email = normalizarEmail(parse.data.email)

      // o mais recente ainda válido e não consumido
      const [registro] = await db
        .select()
        .from(otpCodigo)
        .where(
          and(
            eq(otpCodigo.email, email),
            isNull(otpCodigo.consumidoEm),
            gt(otpCodigo.expiraEm, new Date()),
          ),
        )
        .orderBy(desc(otpCodigo.criadoEm))
        .limit(1)

      const invalido = () => reply.code(401).send({ erro: 'código inválido ou expirado' })
      if (!registro) return invalido()

      if (registro.tentativas >= OTP_MAX_TENTATIVAS) {
        // queima o código: sem isso, 1M de combinações cai por força bruta
        await db
          .update(otpCodigo)
          .set({ consumidoEm: new Date() })
          .where(eq(otpCodigo.id, registro.id))
        return invalido()
      }

      const esperado = hashCodigo(parse.data.codigo, email, segredo)
      if (!compararHash(esperado, registro.codigoHash)) {
        await db
          .update(otpCodigo)
          .set({ tentativas: sql`${otpCodigo.tentativas} + 1` })
          .where(eq(otpCodigo.id, registro.id))
        return invalido()
      }

      // uso único
      await db.update(otpCodigo).set({ consumidoEm: new Date() }).where(eq(otpCodigo.id, registro.id))

      const agora = new Date()
      const [u] = await db
        .insert(usuario)
        .values({ email, ultimoLoginEm: agora })
        .onConflictDoUpdate({ target: usuario.email, set: { ultimoLoginEm: agora } })
        .returning()

      // primeiro login cria o tenant: a usuária não deve encarar uma etapa de
      // "criar organização" para começar a usar um app de precificação
      const membros = await db
        .select()
        .from(tenantMembro)
        .where(eq(tenantMembro.usuarioId, u!.id))
        .limit(1)

      if (membros.length === 0) {
        const [t] = await db.insert(tenant).values({ nome: email }).returning()
        await db.insert(tenantMembro).values({ tenantId: t!.id, usuarioId: u!.id })
      }

      const token = gerarTokenSessao()
      await db.insert(sessao).values({
        usuarioId: u!.id,
        tokenHash: hashToken(token),
        expiraEm: new Date(Date.now() + SESSAO_VALIDADE_MS),
      })

      // o token em claro existe UMA vez, nesta resposta. O banco só tem o hash.
      return { token, usuario: { id: u!.id, email: u!.email } }
    },
  )

  app.get('/auth/eu', async (req, reply) => {
    const ctx = await autenticar(req.headers.authorization)
    if (!ctx) return reply.code(401).send({ erro: 'não autenticado' })
    return ctx
  })

  app.post('/auth/sair', async (req, reply) => {
    const token = extrairBearer(req.headers.authorization)
    if (token) await db.delete(sessao).where(eq(sessao.tokenHash, hashToken(token)))
    return reply.code(204).send()
  })
}

/* ─────────────────────── contexto autenticado ─────────────────────── */

export interface ContextoAuth {
  usuarioId: string
  email: string
  tenantId: string
}

function extrairBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const t = header.slice(7).trim()
  return t.length > 0 ? t : null
}

/**
 * Resolve o token para usuário + tenant.
 *
 * Retorna `tenantId` porque TODA query de dados precisa ser escopada por ele —
 * multi-tenant que confia no cliente para mandar o tenant é vazamento garantido.
 */
export async function autenticar(header: string | undefined): Promise<ContextoAuth | null> {
  const token = extrairBearer(header)
  if (!token) return null

  const [linha] = await db
    .select({ usuarioId: usuario.id, email: usuario.email, tenantId: tenantMembro.tenantId })
    .from(sessao)
    .innerJoin(usuario, eq(usuario.id, sessao.usuarioId))
    .innerJoin(tenantMembro, eq(tenantMembro.usuarioId, usuario.id))
    .where(and(eq(sessao.tokenHash, hashToken(token)), gt(sessao.expiraEm, new Date())))
    .limit(1)

  if (!linha) return null

  await db
    .update(sessao)
    .set({ ultimoUsoEm: new Date() })
    .where(eq(sessao.tokenHash, hashToken(token)))

  return linha
}
