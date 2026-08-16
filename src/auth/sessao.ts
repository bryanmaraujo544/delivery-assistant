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

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

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
