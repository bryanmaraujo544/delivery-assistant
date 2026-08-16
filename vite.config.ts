import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
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
