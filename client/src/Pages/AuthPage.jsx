import { useState } from 'react'
import { loginUser } from '../api/auth.js'

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
      const response = await loginUser(form)

      setMessage(response.message || 'Login successful.')

      if (response.token) {
        localStorage.setItem('session_token', response.token)
        if (onAuthSuccess) {
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
              {mode === 'register' ? 'Account registration' : 'Welcome back'}
            </h1>
            <p>
              {mode === 'register'
                ? 'Registration is handled by the administrator.'
                : 'Sign in with your registered credentials.'}
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

          {mode === 'register' ? (
            <div className="auth-register-note">
              <p>
                Contact <a href="mailto:developer@bitsathy.in">developer@bitsathy.in</a> to register your account.
              </p>
              <p>
                Once your account is created, return here and sign in with your credentials.
              </p>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submitForm}>
              <label>
                <span>UserID</span>
                <input
                  name="device_id"
                  value={form.device_id}
                  onChange={onChange}
                  placeholder="Enter your userID"
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
                  placeholder="Enter the password"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Please wait…' : 'Sign in'}
              </button>
            </form>
          )}

          {message && <p className="auth-message success">{message}</p>}
          {error   && <p className="auth-message error">{error}</p>}

        </div>
      </section>
    </main>
  )
}

export default AuthPage