import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthGate } from './workforce/AuthGate'
import './tokens.css'
import './styles.css'
import './workforce/workforce.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
)
