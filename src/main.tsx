import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router'
import { Guardiao } from './componentes/Guardiao'
import './app.css'

const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => ({ Component: (await import('./rotas/login')).Login }),
  },
  {
    // tudo aqui dentro exige sessao e mantem a sincronizacao rodando
    element: <Guardiao />,
    children: [
      { path: '/', element: <Navigate to="/fichas" replace /> },
      {
        path: '/fichas',
        lazy: async () => ({ Component: (await import('./rotas/fichas')).Fichas }),
      },
      {
        path: '/fichas/:id',
        lazy: async () => ({ Component: (await import('./rotas/ficha-editor')).FichaEditor }),
      },
      {
        path: '/insumos',
        lazy: async () => ({ Component: (await import('./rotas/insumos')).Insumos }),
      },
    ],
  },
])

const raiz = document.getElementById('root')
if (!raiz) throw new Error('elemento #root nao encontrado')

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
