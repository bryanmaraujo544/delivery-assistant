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

/**
 * Sem chave configurada, qualquer envio falha ALTO — mas só quando alguém
 * tenta enviar, não no boot.
 */
class EnviadorIndisponivel implements EnviadorEmail {
  async enviar() {
    throw new Error('envio de e-mail não configurado (falta RESEND_API_KEY)')
  }
}

/**
 * Escolhe o enviador.
 *
 * ATE 15/08/2026 isto derrubava o processo em producao quando faltava a chave.
 * Fazia sentido enquanto OTP era o unico login: sem e-mail, ninguem entrava.
 *
 * Com login por SENHA, e-mail deixou de ser caminho critico — so o OTP usa. Um
 * throw no boot passou a impedir o deploy inteiro por causa de um metodo de
 * login secundario. Agora a falha e adiada para o momento do envio: quem tentar
 * OTP sem chave recebe erro claro, e o resto do app sobe normalmente.
 */
export function criarEnviador(): EnviadorEmail {
  const apiKey = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE

  if (!apiKey) {
    console.warn(
      process.env.NODE_ENV === 'production'
        ? '[email] RESEND_API_KEY ausente — login por OTP indisponível (senha continua funcionando)'
        : '[email] RESEND_API_KEY ausente — usando console (dev)',
    )
    return process.env.NODE_ENV === 'production'
      ? new EnviadorIndisponivel()
      : new EnviadorConsole()
  }

  if (!remetente) throw new Error('EMAIL_REMETENTE ausente (ex.: "Precifica <login@seu-dominio.com>")')
  return new EnviadorResend(apiKey, remetente)
}
