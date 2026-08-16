import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import { registrarRotasAuth } from './auth/rotas'
import { registrarRotasSenha } from './auth/senha-rotas'
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

  const ehProducao = process.env.NODE_ENV === 'production'
  const permitidas = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  await app.register(cors, {
    // front e API ficam em origens diferentes (SPA estatica + processo Node)
    origin: (origem, cb) => {
      // requisicao sem Origin (curl, health check do Railway) nao e do navegador
      if (!origem) return cb(null, true)
      if (permitidas.includes(origem)) return cb(null, true)

      // Em desenvolvimento, aceitar localhost em QUALQUER porta: o Vite troca
      // de porta quando a 5173 esta ocupada, e ficar perseguindo porta no .env
      // faz o CORS falhar de um jeito que parece bug da aplicacao.
      // Em producao essa brecha nao existe — so a lista explicita vale.
      if (!ehProducao && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) {
        return cb(null, true)
      }

      cb(new Error(`origem nao permitida: ${origem}`), false)
    },
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
  await registrarRotasSenha(app)
  await registrarRotasSync(app)

  app.addHook('onClose', async () => {
    await pool.end()
  })

  return app
}
