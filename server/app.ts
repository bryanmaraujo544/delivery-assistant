import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import { registrarRotasAuth } from './auth/rotas'
import { registrarRotasSync } from './sync/rotas'
import { db, pool } from './db'
import { criarEnviador, type EnviadorEmail } from './email'

/**
 * API do app de precificacao.
 *
 * Contexto que motiva as escolhas abaixo: o cliente e um PWA offline-first.
 * Ele NUNCA depende desta API para funcionar — o Dexie e a leitura primaria.
 * Esta API existe para (a) autenticar e (b) ser a fonte da verdade durante a
 * sincronizacao. Portanto ela pode estar lenta ou fora do ar sem quebrar a
 * cozinha, e isso e requisito, nao acidente.
 */
export async function construirApp(opts: { enviador?: EnviadorEmail } = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // nunca logar a connection string nem token de sessao
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  })

  await app.register(cors, {
    // front e API ficam em origens diferentes (SPA estatica + processo Node)
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
  })

  // limite global; as rotas de auth apertam ainda mais via config.rateLimit
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  app.get('/health', async () => {
    const inicio = Date.now()
    await db.execute(sql`select 1`)
    return {
      ok: true,
      banco: 'conectado',
      // o compute do Neon suspende apos 5 min no free tier: a primeira chamada
      // depois da ociosidade paga o resume, as seguintes nao
      latenciaMs: Date.now() - inicio,
    }
  })

  await registrarRotasAuth(app, opts.enviador ?? criarEnviador())
  await registrarRotasSync(app)

  app.addHook('onClose', async () => {
    await pool.end()
  })

  return app
}
