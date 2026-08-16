import { Resend } from 'resend'

/**
 * Envio de e-mail.
 *
 * Interface propria em vez de chamar o Resend direto nas rotas por dois
 * motivos praticos: (a) em desenvolvimento nao queremos gastar cota nem
 * depender de rede para testar login, e (b) o codigo do OTP precisa estar
 * visivel em algum lugar para o teste automatizado ler.
 */
export interface EnviadorEmail {
  enviar(para: string, assunto: string, texto: string): Promise<void>
}

/** Produção. Falha alto: e-mail nao entregue = usuaria nao entra no app. */
class EnviadorResend implements EnviadorEmail {
  private readonly resend: Resend
  constructor(
    apiKey: string,
    private readonly remetente: string,
  ) {
    this.resend = new Resend(apiKey)
  }

  async enviar(para: string, assunto: string, texto: string) {
    const { error } = await this.resend.emails.send({
      from: this.remetente,
      to: para,
      subject: assunto,
      text: texto,
    })
    if (error) throw new Error(`Resend falhou: ${error.message}`)
  }
}

/** Desenvolvimento. Imprime no console — nada sai da máquina. */
class EnviadorConsole implements EnviadorEmail {
  async enviar(para: string, assunto: string, texto: string) {
    console.log(`\n──── EMAIL (dev) ────\npara: ${para}\nassunto: ${assunto}\n${texto}\n─────────────────────\n`)
  }
}

export function criarEnviador(): EnviadorEmail {
  const apiKey = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE

  if (!apiKey) {
    // Em producao isso seria um login silenciosamente quebrado — barrar cedo.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY ausente em producao')
    }
    console.warn('[email] RESEND_API_KEY ausente — usando console (dev)')
    return new EnviadorConsole()
  }

  if (!remetente) throw new Error('EMAIL_REMETENTE ausente (ex.: "Precifica <login@seu-dominio.com>")')
  return new EnviadorResend(apiKey, remetente)
}
