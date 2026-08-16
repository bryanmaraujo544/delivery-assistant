import { useState } from 'react'
import { useNavigate } from 'react-router'
import { API, gravarSessao } from '../auth/sessao'

/**
 * Login por código de 6 dígitos.
 *
 * Escolhido em vez de magic link porque é imune ao problema de PWA standalone
 * no iOS: o fluxo NUNCA sai do app, então não existe "abriu no Safari e perdeu
 * a sessão". E o público já conhece o padrão de banco.
 */
export function Login() {
  const navigate = useNavigate()
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const r = await fetch(`${API}/auth/otp/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!r.ok) throw new Error('Não conseguimos enviar o código. Confira o e-mail.')
      setEtapa('codigo')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na conexão.')
    } finally {
      setOcupado(false)
    }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const r = await fetch(`${API}/auth/otp/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, codigo }),
      })
      if (!r.ok) throw new Error('Código inválido ou expirado.')
      const d = (await r.json()) as { token: string; usuario: { id: string; email: string } }
      gravarSessao({ token: d.token, email: d.usuario.email, usuarioId: d.usuario.id })
      navigate('/fichas', { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na conexão.')
      setCodigo('')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-bold text-marca-700">Precifica</h1>
      <p className="mt-2 text-slate-600">
        Saiba quanto custa cada produto e quanto cobrar.
      </p>

      {etapa === 'email' ? (
        <form onSubmit={pedirCodigo} className="mt-8">
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Seu e-mail
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 w-full rounded-xl border border-slate-300 px-4
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
          <p className="mt-2 text-sm text-slate-500">
            Enviamos um código de 6 dígitos. Sem senha para lembrar.
          </p>
          <button
            disabled={ocupado}
            className="mt-5 h-14 w-full rounded-xl bg-marca-600 font-semibold text-white
                       disabled:opacity-60"
          >
            {ocupado ? 'Enviando…' : 'Receber código'}
          </button>
        </form>
      ) : (
        <form onSubmit={entrar} className="mt-8">
          <label htmlFor="codigo" className="mb-1.5 block text-sm font-medium text-slate-700">
            Código enviado para {email}
          </label>
          <input
            id="codigo"
            // `one-time-code` faz o iOS e o Android oferecerem o codigo do SMS/
            // e-mail direto no teclado — economiza a viagem ate a caixa de entrada
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            className="h-16 w-full rounded-xl border border-slate-300 text-center text-3xl
                       font-semibold tracking-[0.4em] tabular-nums
                       focus:border-marca-600 focus:outline-none"
          />
          <button
            disabled={ocupado || codigo.length !== 6}
            className="mt-5 h-14 w-full rounded-xl bg-marca-600 font-semibold text-white
                       disabled:opacity-60"
          >
            {ocupado ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEtapa('email')
              setCodigo('')
              setErro(null)
            }}
            className="mt-2 h-12 w-full rounded-xl text-slate-600"
          >
            Usar outro e-mail
          </button>
        </form>
      )}

      {erro && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}
    </main>
  )
}
