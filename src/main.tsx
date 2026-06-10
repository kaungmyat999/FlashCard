import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DesktopAuthHandoff } from './components/DesktopAuthHandoff.tsx'

// When the Electron desktop app sends the user here to sign in, it appends
// `?desktop_auth=1`. In that case we render a lightweight handoff screen that
// signs in (with browser AutoFill) and bounces the session back via the
// `flashcard://` URL scheme — instead of booting the whole app.
const isDesktopAuth = new URLSearchParams(window.location.search).has('desktop_auth')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesktopAuth ? <DesktopAuthHandoff /> : <App />}
  </StrictMode>,
)
