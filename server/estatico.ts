import { existsSync } from 'node:fs'
import { join } from 'node:path'
import estatico from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/**
 * Serve o front (dist/) pelo proprio Fastify.
 *
 * A alternativa seria CDN separada, e ate era o plano. Servir do mesmo processo
 * elimina de uma vez:
 *  - CORS (mesma origem — nao existe requisicao cross-origin);
 *  - VITE_API_URL (o front chama caminho relativo);
 *  - o segundo deploy e o segundo host.
 *
 * O custo e o front sair de um Node em vez de uma CDN. Nesta escala — um app de
 * precificacao com dezenas de usuarias — isso nao aparece em lugar nenhum.
 *
 * As ROTAS DE API tem precedencia: sao registradas antes, e o fallback de SPA
 * ignora explicitamente os prefixos delas.
 */

const PREFIXOS_API = ['/health', '/auth', '/sync']

export async function registrarEstatico(app: FastifyInstance) {
  const raiz = join(process.cwd(), 'dist')

  if (!existsSync(join(raiz, 'index.html'))) {
    app.log.warn('[estatico] dist/ ausente — rodando so como API (normal em dev)')
    return
  }

  await app.register(estatico, { root: raiz, wildcard: false })

  /**
   * Fallback de SPA: o roteamento e do cliente, entao abrir /fichas direto ou
   * recarregar a pagina precisa devolver index.html, nao 404.
   *
   * Requisicao de API que nao existe continua recebendo 404 de verdade — devolver
   * HTML para um endpoint errado transformaria erro de rota em erro de parse
   * de JSON no cliente, que e muito mais dificil de diagnosticar.
   */
  app.setNotFoundHandler((req, reply) => {
    if (PREFIXOS_API.some((p) => req.url.startsWith(p))) {
      return reply.code(404).send({ erro: 'rota não encontrada' })
    }
    return reply.sendFile('index.html')
  })
}
