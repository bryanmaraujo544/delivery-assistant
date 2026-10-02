import { useState } from 'react'
import { abrirCaixa } from '../db/caixa'
import { CampoDinheiro } from './CampoDinheiro'

/**
 * Abertura de caixa: uma pergunta, um botao.
 *
 * Aparece tanto em Caixa quanto em Vender — quem chega para vender com o
 * caixa fechado abre ali mesmo, sem ser mandada para outra tela.
 */
export function AbrirCaixa() {
  const [fundo, setFundo] = useState(0)

  return (
    <div className="vidro-cartao mx-auto w-full max-w-md rounded-3xl p-6">
      <h2 className="text-xl font-bold">Abrir o caixa</h2>
      <label htmlFor="fundo" className="mt-4 mb-1.5 block text-slate-700">
        Quanto tem de dinheiro na gaveta para troco?
      </label>
      <CampoDinheiro id="fundo" valorCentavos={fundo} onChange={setFundo} />
      <p className="mt-1.5 text-sm text-slate-500">Se a gaveta está vazia, deixe em R$ 0,00.</p>
      <button
        onClick={() => abrirCaixa(fundo)}
        className="mt-5 h-14 w-full rounded-2xl bg-marca-600 text-lg font-semibold text-white active:bg-marca-700"
      >
        Abrir caixa
      </button>
    </div>
  )
}
