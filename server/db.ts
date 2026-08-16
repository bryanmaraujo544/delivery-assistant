import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/db/schema'

/**
 * Conexao do servidor com o Neon.
 *
 * Usamos `node-postgres` (pool persistente), NAO `neon-http`.
 *
 * O driver HTTP da Neon existe para ambiente serverless, onde cada invocacao e
 * um processo novo e nao ha o que reusar — la, uma requisicao HTTP por query e
 * o menor custo possivel. Num processo Fastify de longa duracao o calculo se
 * inverte: um pool mantem conexoes TCP abertas e elimina o handshake por query.
 *
 * Aponte para o host COM `-pooler`: o compute do Neon suspende apos 5 min de
 * ociosidade no plano free, e o PgBouncer absorve o ciclo de suspend/resume
 * melhor do que conexoes diretas de vida longa.
 */

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL ausente — veja .env.example')

export const pool = new Pool({
  connectionString: url,
  // o compute suspende no free tier; conexao ociosa demais morre do outro lado
  idleTimeoutMillis: 30_000,
  // resume do compute suspenso leva algumas centenas de ms — nao seja impaciente
  connectionTimeoutMillis: 10_000,
  max: 10,
})

pool.on('error', (err) => {
  // conexao ociosa derrubada pelo suspend do Neon nao deve derrubar o processo
  console.error('[pg] erro em conexao ociosa:', err.message)
})

export const db = drizzle(pool, { schema })
