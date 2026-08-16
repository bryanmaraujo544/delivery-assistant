import { formatarBRL } from '../dominio/dinheiro'

interface Props {
  valorCentavos: number
  onChange: (centavos: number) => void
  id?: string
  autoFocus?: boolean
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
export function CampoDinheiro({ valorCentavos, onChange, id, autoFocus }: Props) {
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
        onFocus={(e) => e.currentTarget.setSelectionRange(999, 999)}
        className="h-14 w-full rounded-xl border border-slate-300 px-4 text-right text-xl
                   font-semibold tabular-nums focus:border-marca-600 focus:ring-2
                   focus:ring-marca-500/30 focus:outline-none"
      />
    </div>
  )
}
