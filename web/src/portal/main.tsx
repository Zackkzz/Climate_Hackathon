import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/nsw.css'
import './styles/utilities.css'
import './styles/mw-components.css'
import PortalApp from './App'

document.documentElement.lang = 'en-AU'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalApp />
  </StrictMode>,
)
