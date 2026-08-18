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
  const [showPassword, setShowPassword] = useState(false)

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
                <span>Username or UserID</span>
                <input
                  name="device_id"
                  value={form.device_id}
                  onChange={onChange}
                  placeholder="Enter username or userID"
                  autoComplete="username"
                  spellCheck={false}
                  required
                />
              </label>

              <label>
                <span>Password</span>
                <div className="password-input-container">
                  <input
                    name="ps_cookie"
                    type={showPassword ? "text" : "password"}
                    value={form.ps_cookie}
                    onChange={onChange}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    spellCheck={false}
                    required
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn" 
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
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