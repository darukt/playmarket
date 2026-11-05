import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './ui.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 1000 * 60 * 30,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

const rootElement = document.getElementById('root')!

// Prerendered pages carry static markup for crawlers/no-JS. Wipe it, then
// mount the interactive app instead of trying to hydrate mismatched DOM.
if (rootElement.dataset.prerendered === 'true') {
  rootElement.innerHTML = ''
  delete rootElement.dataset.prerendered
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
