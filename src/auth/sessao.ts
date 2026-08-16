/**
 * Sessão no cliente.
 *
 * O token fica em `localStorage`, não em cookie: front e API ficam em origens
 * diferentes, e cookie cross-origin exigiria `SameSite=None` + domínio pai.
 *
 * Consequência aceita conscientemente: `localStorage` é legível por JavaScript,
 * então um XSS rouba a sessão. A mitigação real é não ter XSS — o app não
 * renderiza HTML de terceiros nem usa `dangerouslySetInnerHTML` em lugar
 * nenhum. Cookie `HttpOnly` seria mais seguro contra XSS, e é o caminho se um
 * dia front e API ficarem no mesmo domínio.
 */

const CHAVE = 'precifica.sessao'

/**
 * Endereco da API.
 *
 * Em producao vem de VITE_API_URL (lida em build time).
 *
 * Em desenvolvimento NAO da para fixar "localhost": quando o app e aberto do
 * celular pelo IP da maquina, "localhost" seria o proprio celular. Derivar do
 * host de onde o front veio faz o teste em aparelho real funcionar sem
 * configurar nada.
 */
export const API =
  import.meta.env.VITE_API_URL ??
  // Em producao o front e servido pelo PROPRIO Fastify: mesma origem, caminho
  // relativo, sem CORS. Em dev sao processos separados (Vite 5173, API 3333),
  // entao apontamos para a porta da API no mesmo host — o que tambem faz o
  // teste pelo celular funcionar sem configurar nada.
  (import.meta.env.PROD ? '' : `${location.protocol}//${location.hostname}:3333`)

export interface Sessao {
  token: string
  email: string
  usuarioId: string
}

export function lerSessao(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as Sessao) : null
  } catch {
    return null
  }
}

export const gravarSessao = (s: Sessao) => localStorage.setItem(CHAVE, JSON.stringify(s))
export const limparSessao = () => localStorage.removeItem(CHAVE)

/**
 * `fetch` com o bearer. Trata 401 limpando a sessão: token expirado ou revogado
 * deve devolver a usuária ao login em vez de deixá-la num app que falha calado.
 */
export async function api(caminho: string, init: RequestInit = {}): Promise<Response> {
  const s = lerSessao()
  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
      ...init.headers,
    },
  })
  if (resposta.status === 401 && s) {
    limparSessao()
    // recarrega para o roteador reavaliar o guard
    location.href = '/login'
  }
  return resposta
}
