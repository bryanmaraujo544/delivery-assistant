import type { ContextoAuth } from './auth/rotas'

/**
 * Augmenta o FastifyRequest com o contexto autenticado.
 *
 * Sem isso, cada rota faria `(req as any).ctx` — e um `any` no ponto onde vive
 * o `tenantId` e exatamente onde um erro vira vazamento entre contas.
 */
declare module 'fastify' {
  interface FastifyRequest {
    ctx?: ContextoAuth
  }
}
