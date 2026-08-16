import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router'
import { lerSessao, limparSessao } from '../auth/sessao'
import { iniciarSyncAutomatico, jaSincronizou, type EstadoSync } from '../db/sync'
import { NavInferior } from './NavInferior'

/**
 * Guarda as rotas autenticadas e mantém a sincronização rodando.
 *
 * Importante: o app NÃO espera a sincronização para renderizar. O Dexie já tem
 * os dados; a rede é melhoria, não pré-requisito. Bloquear a tela esperando o
 * servidor quebraria justamente o caso de uso (cozinha, Wi-Fi ruim).
 */
/** O que as telas filhas precisam saber sobre a sincronizacao. */
export interface ContextoApp {
  /**
   * Ja houve ao menos um sync bem-sucedido.
   *
   * Precisa ser ESTADO, nao leitura de localStorage em tempo de render: numa
   * conta nova o servidor nao devolve nada, o Dexie nao muda, e nada
   * dispararia um re-render — a tela ficaria presa no estado anterior.
   */
  sincronizado: boolean
}

export function Guardiao() {
  const [estado, setEstado] = useState<EstadoSync>('ocioso')
  const [sincronizado, setSincronizado] = useState(jaSincronizou())
  const sessao = lerSessao()

  useEffect(() => {
    if (!sessao) return
    return iniciarSyncAutomatico((e) => {
      setEstado(e)
      setSincronizado(jaSincronizou())
    })
  }, [sessao?.token])

  if (!sessao) return <Navigate to="/login" replace />

  return (
    <>
      <IndicadorSync estado={estado} />
      <Outlet context={{ sincronizado } satisfies ContextoApp} />
      <NavInferior
        onSair={() => {
          limparSessao()
          localStorage.removeItem('precifica.ultimoSync')
          location.href = '/login'
        }}
      />
    </>
  )
}

/**
 * Só aparece quando há algo a dizer.
 *
 * Um selo permanente de "sincronizado" vira ruído e a pessoa para de ver.
 * "Offline" e "erro" são o que importa — e mesmo eles são informativos, não
 * bloqueantes, porque o app continua funcionando.
 */
function IndicadorSync({ estado }: { estado: EstadoSync }) {
  if (estado === 'ocioso') return null

  const texto =
    estado === 'sincronizando'
      ? 'Sincronizando…'
      : estado === 'offline'
        ? 'Sem conexão — suas alterações ficam salvas e sobem depois'
        : 'Não consegui sincronizar agora — vou tentar de novo'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-40 px-4 py-1.5 text-center text-xs ${
        estado === 'sincronizando' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-900'
      }`}
    >
      {texto}
    </div>
  )
}
