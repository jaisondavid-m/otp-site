import { useEffect, useState } from 'react'
import { createAdminUser, deleteAdminUser, listAdminUsers } from '../api/auth.js'

const initialForm = {
  device_id: '',
  ps_cookie: '',
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingDeviceId, setDeletingDeviceId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await listAdminUsers()
      setUsers(response.users || [])
    } catch (err) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      await createAdminUser(form)
      setForm(initialForm)
      setMessage('User created successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (deviceId) => {
    if (!window.confirm(`Delete ${deviceId}? This will remove the user and their sessions.`)) {
      return
    }

    setDeletingDeviceId(deviceId)
    setError('')
    setMessage('')

    try {
      await deleteAdminUser(deviceId)
      setMessage('User deleted successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setDeletingDeviceId('')
    }
  }

  return (
    <main className="activity-shell admin-shell">
      <section className="activity-page-card">
        <div className="activity-page-content">
          <div className="activity-page-header">
            <div className="activity-badge">Admin</div>
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -8 }}>
            Create new user accounts and remove access from existing users. This page is available only to the configured admin session.
          </p>

          {message && <div className="auth-message success">{message}</div>}
          {error && <div className="auth-message error">{error}</div>}

          <div className="admin-grid">
            <section className="admin-panel">
              <div className="activity-page-header" style={{ marginBottom: 0 }}>
                <div className="activity-badge">Add User</div>
              </div>

              <form className="auth-form admin-form" onSubmit={handleCreate}>
                <label>
                  <span>UserID</span>
                  <input
                    name="device_id"
                    value={form.device_id}
                    onChange={onChange}
                    placeholder="Enter user ID"
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
                    placeholder="Enter password"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>

                <button type="submit" className="auth-submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Create user'}
                </button>
              </form>

              <p className="admin-form-note">
                New users will sign in using the same login screen after you create their account.
              </p>
            </section>

            <section className="admin-panel">
              <div className="activity-page-header" style={{ marginBottom: 0 }}>
                <div className="activity-badge">Users</div>
              </div>

              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                  <div className="spinner" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading users…</span>
                </div>
              ) : users.length === 0 ? (
                <div className="admin-empty-state">No users found.</div>
              ) : (
                <div className="admin-users-list">
                  {users.map((user) => {
                    const createdAt = user.created_at ? new Date(user.created_at).toLocaleString() : 'Unknown'
                    const updatedAt = user.updated_at ? new Date(user.updated_at).toLocaleString() : 'Unknown'
                    const isProtected = Boolean(user.is_admin)

                    return (
                      <article key={user.device_id} className="admin-user-item">
                        <main>
                          <div className="admin-user-id">{user.device_id}</div>
                          <div className="admin-user-meta">Created {createdAt}</div>
                          <div className="admin-user-meta">Updated {updatedAt}</div>
                        </main>

                        <div className="admin-user-actions">
                          {isProtected && <span className="admin-user-badge">Admin</span>}
                          <button
                            type="button"
                            className="admin-delete-btn"
                            onClick={() => handleDelete(user.device_id)}
                            disabled={isProtected || deletingDeviceId === user.device_id}
                          >
                            {isProtected ? 'Protected' : deletingDeviceId === user.device_id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

export default AdminUsers
