import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { sessao, usuario } from '../../src/db/schema'
import { normalizarEmail } from '../auth/otp'
import { SENHA_MIN, hashSenha } from '../auth/senha'
import { db, pool } from '../db'

/**
 * Redefine a senha de uma conta direto no banco.
 *
 * Existe porque a recuperacao por e-mail depende de dominio verificado, que
 * ainda nao ha: quem esquece a senha so volta por aqui.
 *
 *   npx tsx server/scripts/redefinir-senha.ts fulana@exemplo.com
 *
 * A senha e DIGITADA, sem eco, e nunca passada como argumento: argumento de
 * linha de comando fica no historico do shell e aparece em `ps`.
 *
 * Roda contra o banco de DATABASE_URL. Confira o `.env` antes — o padrao deste
 * projeto aponta para producao.
 */

function perguntarSemEco(pergunta: string): Promise<string> {
  let mudo = false
  const saida = new Writable({
    write(pedaco, _enc, cb) {
      if (!mudo) process.stdout.write(pedaco)
      cb()
    },
  })
  const rl = createInterface({ input: process.stdin, output: saida, terminal: true })
  return new Promise((resolve) => {
    rl.question(pergunta, (resposta) => {
      rl.close()
      process.stdout.write('\n')
      resolve(resposta)
    })
    mudo = true
  })
}

const email = normalizarEmail(process.argv[2] ?? '')
if (!email) {
  console.error('uso: npx tsx server/scripts/redefinir-senha.ts <e-mail>')
  process.exit(1)
}

try {
  const [conta] = await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, email))
  if (!conta) throw new Error(`nenhuma conta com o e-mail ${email}`)

  const senha = await perguntarSemEco(`Nova senha para ${email}: `)
  if (senha.length < SENHA_MIN) throw new Error(`a senha precisa de ao menos ${SENHA_MIN} caracteres`)
  if ((await perguntarSemEco('Repita a senha: ')) !== senha) throw new Error('as senhas não conferem')

  await db.transaction(async (tx) => {
    await tx.update(usuario).set({ senhaHash: await hashSenha(senha) }).where(eq(usuario.id, conta.id))
    // quem redefine a senha quer que os acessos antigos parem de valer
    await tx.delete(sessao).where(eq(sessao.usuarioId, conta.id))
  })
  console.log('Senha redefinida. As sessões abertas dessa conta foram encerradas.')
} catch (e) {
  console.error(`Não foi possível redefinir: ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
