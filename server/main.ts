import 'dotenv/config'
import { construirApp } from './app'

const port = Number(process.env.PORT ?? 3333)

const app = await construirApp()

// 0.0.0.0 e obrigatorio em container (Fly/Railway/Render); 127.0.0.1 nao recebe
// trafego externo la dentro
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    await app.close()
    process.exit(0)
  })
}
