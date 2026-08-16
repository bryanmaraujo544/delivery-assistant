import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sessao as sessaoTabela, tenant, tenantMembro, usuario } from '../../src/db/schema'
import { db } from '../db'
import { SESSAO_VALIDADE_MS, gerarTokenSessao, hashToken, normalizarEmail } from './otp'
import { SENHA_MIN, hashSenha, verificarSenha } from './senha'

/**
 * Login por e-mail e senha.
 *
 * Motivo de existir: OTP depende de enviar e-mail, e enviar e-mail depende de
 * um dominio verificado no Resend. Senha remove essa dependencia e permite
 * usuarias reais desde o primeiro dia.
 *
 * DIVIDA CONHECIDA: recuperacao de senha TAMBEM precisa de e-mail. Enquanto
 * nao houver dominio, quem esquecer a senha depende de reset manual no banco.
 * As rotas de OTP continuam no ar e voltam a ser o caminho preferido no dia em
 * que o dominio existir.
 */

const credenciais = z.object({
  email: z.email().max(254),
  senha: z.string().min(SENHA_MIN).max(200),
})

export async function registrarRotasSenha(app: FastifyInstance) {
  app.post(
    '/auth/registrar',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const parse = credenciais.safeParse(req.body)
      if (!parse.success) {
        return reply.code(400).send({ erro: `e-mail inválido ou senha com menos de ${SENHA_MIN} caracteres` })
      }
      const email = normalizarEmail(parse.data.email)

      const [existente] = await db.select().from(usuario).where(eq(usuario.email, email)).limit(1)

      // TRADE-OFF ASSUMIDO: dizer que a conta existe permite enumerar
      // e-mails cadastrados. A alternativa — fingir sucesso — deixaria a
      // pessoa presa sem entender por que nao consegue entrar. Para um app
      // deste porte, a clareza vale mais; o rate limit contem o abuso.
      if (existente?.senhaHash) {
        return reply.code(409).send({ erro: 'já existe uma conta com esse e-mail' })
      }

      const senhaHash = await hashSenha(parse.data.senha)
      const agora = new Date()

      // usuaria pode existir sem senha se entrou por OTP antes
      const [u] = existente
        ? await db
            .update(usuario)
            .set({ senhaHash, ultimoLoginEm: agora })
            .where(eq(usuario.id, existente.id))
            .returning()
        : await db.insert(usuario).values({ email, senhaHash, ultimoLoginEm: agora }).returning()

      await garantirTenant(u!.id, email)
      return reply.code(201).send(await abrirSessao(u!.id, u!.email))
    },
  )

  app.post(
    '/auth/entrar',
    // mais apertado que registrar: e aqui que a forca bruta bate
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const parse = credenciais.safeParse(req.body)
      // mensagem generica mesmo quando o formato esta errado: qualquer
      // diferenca de resposta ajuda o atacante a mapear contas
      const invalido = () => reply.code(401).send({ erro: 'e-mail ou senha inválidos' })
      if (!parse.success) return invalido()

      const email = normalizarEmail(parse.data.email)
      const [u] = await db.select().from(usuario).where(eq(usuario.email, email)).limit(1)

      if (!u?.senhaHash) {
        // Conta inexistente e conta sem senha respondem igual. Ainda assim
        // gastamos o tempo de um scrypt, para que "usuaria nao existe" e
        // "senha errada" nao sejam distinguiveis pelo tempo de resposta.
        await verificarSenha(parse.data.senha, 'scrypt$32768$8$1$YWFhYQ==$YmJiYg==')
        return invalido()
      }

      if (!(await verificarSenha(parse.data.senha, u.senhaHash))) return invalido()

      await db.update(usuario).set({ ultimoLoginEm: new Date() }).where(eq(usuario.id, u.id))
      await garantirTenant(u.id, u.email)
      return abrirSessao(u.id, u.email)
    },
  )
}

/** Primeiro login cria o tenant: ninguem deve encarar "criar organizacao". */
async function garantirTenant(usuarioId: string, email: string) {
  const membros = await db
    .select()
    .from(tenantMembro)
    .where(eq(tenantMembro.usuarioId, usuarioId))
    .limit(1)
  if (membros.length > 0) return
  const [t] = await db.insert(tenant).values({ nome: email }).returning()
  await db.insert(tenantMembro).values({ tenantId: t!.id, usuarioId })
}

async function abrirSessao(usuarioId: string, email: string) {
  const token = gerarTokenSessao()
  await db.insert(sessaoTabela).values({
    usuarioId,
    tokenHash: hashToken(token),
    expiraEm: new Date(Date.now() + SESSAO_VALIDADE_MS),
  })
  // o token em claro existe UMA vez, nesta resposta; o banco so tem o hash
  return { token, usuario: { id: usuarioId, email } }
}
