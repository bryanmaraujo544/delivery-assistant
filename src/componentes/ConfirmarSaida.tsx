import { useEffect, useState } from 'react'
import { contarPendentes } from '../db/sync'

/**
 * Confirmacao antes de sair.
 *
 * Nosso principio geral e undo em vez de "tem certeza?" — mas ele diz que a
 * confirmacao e proporcional ao CUSTO DE RECONSTRUIR, e sair e caro por dois
 * motivos concretos:
 *
 * 1. Nao existe recuperacao de senha (depende de e-mail, que depende de dominio
 *    verificado). Quem sair e nao lembrar a senha fica de fora ate reset manual.
 * 2. Sair LIMPA os dados deste aparelho — e precisa limpar, ver abaixo.
 *
 * Nao ha "desfazer" possivel para nenhum dos dois. Aqui a confirmacao paga.
 */

interface Props {
  aberto: boolean
  email: string
  onCancelar: () => void
  onConfirmar: () => void
}

export function ConfirmarSaida({ aberto, email, onCancelar, onConfirmar }: Props) {
  const [pendentes, setPendentes] = useState<number | null>(null)

  useEffect(() => {
    if (!aberto) return
    contarPendentes().then(setPendentes).catch(() => setPendentes(null))
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onCancelar()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [aberto, onCancelar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancelar} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-sair"
        className="vidro-solido relative w-full max-w-sm rounded-3xl p-5 shadow-2xl"
      >
        <h2 id="titulo-sair" className="text-lg font-semibold text-slate-900">
          Sair da conta?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Você está entrando como <strong>{email}</strong>. Para voltar, vai precisar da senha —
          e a recuperação automática ainda não está disponível.
        </p>

        {/* Aviso concreto, nao generico: dizer QUANTAS alteracoes estao em risco
            e o que faz a pessoa parar e pensar, em vez de tocar em "OK" no automatico. */}
        {pendentes !== null && pendentes > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>
              {pendentes} {pendentes === 1 ? 'alteração ainda não subiu' : 'alterações ainda não subiram'}
            </strong>{' '}
            para o servidor. Sair agora perde {pendentes === 1 ? 'ela' : 'elas'}.
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Os dados deste aparelho serão limpos. O que já sincronizou volta quando você entrar de
          novo.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancelar}
            className="h-12 flex-1 rounded-xl border border-slate-300 font-medium text-slate-700"
          >
            Ficar
          </button>
          <button
            onClick={onConfirmar}
            className="h-12 flex-1 rounded-xl bg-red-600 font-semibold text-white"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
