import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// GitHub Pages can't send frame-blocking headers, so refuse to run inside someone else's page
if (window.top !== window.self) throw new Error('framed')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
