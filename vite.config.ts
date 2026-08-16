import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Falha o build na Vercel quando `VITE_API_URL` nao esta definida.
 *
 * A variavel e lida em BUILD TIME. Sem ela, o build passaria, o deploy seria
 * publicado com sucesso, e a quebra so apareceria como tela branca no celular
 * de alguem — com a causa escondida no console.
 *
 * `VERCEL` so existe no ambiente de build deles, entao build local segue
 * funcionando sem configurar nada.
 */
function exigirApiUrlNaVercel() {
  if (process.env.VERCEL && !process.env.VITE_API_URL) {
    throw new Error(
      'VITE_API_URL nao definida. Configure em Environment Variables na Vercel ' +
        'ANTES do build — o valor e embutido no bundle e mudar exige rebuild.',
    )
  }
}
exigirApiUrlNaVercel()

export default defineConfig({
  server: {
    // 0.0.0.0: sem isso o dev server so aceita conexao do proprio computador,
    // e testar no celular exigiria deploy. Com host aberto, basta abrir o IP
    // da maquina na mesma Wi-Fi.
    host: true,
    // O Vite nao le PORT por conta propria: se a porta padrao estiver ocupada,
    // ele pula para a proxima e quem orquestra o processo fica apontando para
    // o lugar errado. Honrar PORT torna o dev server previsivel para qualquer
    // ferramenta que atribua porta.
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Precificação para Confeitaria',
        short_name: 'Precifica',
        description: 'Saiba quanto custa cada produto e quanto cobrar.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f766e',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // A API nunca entra no precache: dado de custo desatualizado silenciosamente
        // é pior que erro de rede. O cache de leitura fica no TanStack Query.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
