import { useState } from 'react'
import { registerUser, loginUser } from '../api/auth.js'

const initialForm = {
  device_id: '',
  ps_cookie: '',
}

function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const submitForm = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response =
        mode === 'register'
          ? await registerUser(form)
          : await loginUser(form)

      setMessage(response.message || (mode === 'register' ? 'Device registered.' : 'Login successful.'))

      if (response.token) {
        localStorage.setItem('session_token', response.token)
        if (mode === 'login' && onAuthSuccess) {
          setTimeout(() => onAuthSuccess(), 500)
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-panel">

          <div className="auth-copy">
            <span className="auth-badge">PCDP</span>
            <h1>
              {mode === 'register' ? 'Register device' : 'Welcome back'}
            </h1>
            <p>
              {mode === 'register'
                ? 'Bind your device ID and PS cookie to gain access.'
                : 'Sign in with your registered device credentials.'}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => { setMode('register'); setError(''); setMessage('') }}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={submitForm}>
            <label>
              <span>User Name</span>
              <input
                name="device_id"
                value={form.device_id}
                onChange={onChange}
                placeholder="e.g. d3v1c3-a1b2c3"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                name="ps_cookie"
                value={form.ps_cookie}
                onChange={onChange}
                placeholder="Paste your ps_cookie value"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'register' ? 'Register device' : 'Sign in'}
            </button>
          </form>

          {message && <p className="auth-message success">{message}</p>}
          {error   && <p className="auth-message error">{error}</p>}

        </div>
      </section>
    </main>
  )
}

export default AuthPage