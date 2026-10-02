import { useRef } from 'react'
import { formatarBRL } from '../dominio/dinheiro'

interface Props {
  valorCentavos: number
  onChange: (centavos: number) => void
  id?: string
  autoFocus?: boolean
  /**
   * Para campo que ja abre PREENCHIDO com uma sugestao (valor recebido, parte
   * do pagamento): ao focar, seleciona tudo, e a primeira tecla substitui.
   *
   * Sem isso a digitacao e ANEXADA ao que ja esta la: num campo sugerindo
   * R$ 15,00, digitar "5000" viraria R$ 150.050,00.
   */
  selecionarAoFocar?: boolean
}

/**
 * Entrada de dinheiro no padrao caixa eletronico: preenche da DIREITA para a
 * ESQUERDA, em centavos. Digitar 1-2-0-0 exibe "R$ 12,00".
 *
 * Por que assim: elimina a virgula do caminho da usuaria. Ela nunca precisa
 * decidir onde por o separador, nunca erra a casa decimal, e o cursor nunca
 * pula de lugar (que e o bug classico de mascara que reformata durante a
 * digitacao).
 *
 * `inputMode="numeric"` e nao "decimal": aqui so aceitamos digitos, entao um
 * teclado com virgula seria uma promessa falsa.
 */
export function CampoDinheiro({ valorCentavos, onChange, id, autoFocus, selecionarAoFocar }: Props) {
  const recemFocado = useRef(false)
  return (
    <div className="relative">
      <input
        id={id}
        autoFocus={autoFocus}
        inputMode="numeric"
        // sem type="number": setas de spinner, rejeita separador de milhar e
        // trata decimais de forma inconsistente entre navegadores e locales
        type="text"
        value={formatarBRL(valorCentavos)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '')
          // limite defensivo: R$ 99.999.999,99
          onChange(Math.min(Number(digitos || 0), 9_999_999_999))
        }}
        onFocus={(e) => {
          if (!selecionarAoFocar) return e.currentTarget.setSelectionRange(999, 999)
          e.currentTarget.select()
          recemFocado.current = true
        }}
        // o clique que deu o foco termina num mouseup que reposicionaria o
        // cursor e desfaria a selecao
        onMouseUp={(e) => {
          if (recemFocado.current) e.preventDefault()
          recemFocado.current = false
        }}
        className="h-14 w-full rounded-xl border border-slate-300 px-4 text-right text-xl
                   font-semibold tabular-nums focus:border-marca-600 focus:ring-2
                   focus:ring-marca-500/30 focus:outline-none"
      />
    </div>
  )
}
