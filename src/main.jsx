import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="intro-wrap">
        <h1 className="intro-title">Something broke</h1>
        <p className="muted">
          The career sim hit an error. Your save is still on this device — reload to pick it up, or clear it and start
          again.
        </p>
        <pre className="share-box" style={{ whiteSpace: 'pre-wrap' }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            className="btn danger"
            onClick={() => {
              try {
                localStorage.removeItem('tourlife.save.v1')
              } catch {
                /* ignore */
              }
              window.location.reload()
            }}
          >
            Clear save and reload
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
