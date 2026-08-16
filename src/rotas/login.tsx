import { useState } from 'react'
import { useNavigate } from 'react-router'
import { API, gravarSessao } from '../auth/sessao'

const SENHA_MIN = 8

/**
 * Login por e-mail e senha.
 *
 * O plano original era OTP por e-mail (imune ao problema de PWA standalone no
 * iOS, porque o fluxo nunca sai do app). Senha mantem essa mesma propriedade —
 * tambem nunca sai do app — e remove a dependencia de dominio verificado no
 * Resend, que bloqueava usuarias reais.
 *
 * As rotas de OTP continuam no ar e voltam a ser oferecidas quando existir
 * dominio. DIVIDA CONHECIDA: recuperacao de senha precisa de e-mail; ate la,
 * quem esquecer depende de reset manual.
 */
export function Login() {
  const navigate = useNavigate()
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const criando = modo === 'registrar'

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const r = await fetch(`${API}/auth/${criando ? 'registrar' : 'entrar'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string }
        throw new Error(corpo.erro ?? 'Não foi possível entrar.')
      }
      const d = (await r.json()) as { token: string; usuario: { id: string; email: string } }
      gravarSessao({ token: d.token, email: d.usuario.email, usuarioId: d.usuario.id })
      navigate('/fichas', { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na conexão.')
      setSenha('')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-bold text-marca-700">Precifica</h1>
      <p className="mt-2 text-slate-600">Saiba quanto custa cada produto e quanto cobrar.</p>

      <form onSubmit={enviar} className="mt-8">
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-14 w-full rounded-xl border border-slate-300 px-4
                     focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
        />

        <label htmlFor="senha" className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">
          Senha
        </label>
        <div className="relative">
          <input
            id="senha"
            type={verSenha ? 'text' : 'password'}
            // o gerenciador de senhas do celular precisa saber se e login ou
            // cadastro para oferecer preenchimento ou sugerir senha forte
            autoComplete={criando ? 'new-password' : 'current-password'}
            required
            minLength={SENHA_MIN}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-14 w-full rounded-xl border border-slate-300 px-4 pr-20
                       focus:border-marca-600 focus:ring-2 focus:ring-marca-500/30 focus:outline-none"
          />
          {/* digitar senha em teclado de celular erra muito; ver o que se
              digitou evita a frustracao de tentar de novo sem saber o que houve */}
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute top-0 right-0 h-14 px-4 text-sm font-medium text-slate-500"
          >
            {verSenha ? 'ocultar' : 'ver'}
          </button>
        </div>
        {criando && (
          <p className="mt-1.5 text-xs text-slate-500">Mínimo de {SENHA_MIN} caracteres.</p>
        )}

        <button
          disabled={ocupado || !email || senha.length < SENHA_MIN}
          className="mt-6 h-14 w-full rounded-xl bg-marca-600 font-semibold text-white
                     disabled:opacity-60"
        >
          {ocupado ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
        </button>
      </form>

      <button
        onClick={() => {
          setModo(criando ? 'entrar' : 'registrar')
          setErro(null)
        }}
        className="mt-3 h-12 w-full rounded-xl text-slate-600"
      >
        {criando ? 'Já tenho conta' : 'Criar uma conta'}
      </button>

      {erro && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}

      {!criando && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Esqueceu a senha? Fale com o suporte — a recuperação automática ainda não está
          disponível.
        </p>
      )}
    </main>
  )
}
