import { useEffect, useState } from 'react'
import { createAdminUser, deleteAdminUser, listAdminUsers, updateAdminUserPassword, updateAdminUserName } from '../api/auth.js'

const initialForm = {
  device_id: '',
  name: '',
  ps_cookie: '',
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [passwordForms, setPasswordForms] = useState({})
  const [nameForms, setNameForms] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingDeviceId, setUpdatingDeviceId] = useState('')
  const [updatingNameDeviceId, setUpdatingNameDeviceId] = useState('')
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

  const onPasswordChange = (deviceId, value) => {
    setPasswordForms((current) => ({
      ...current,
      [deviceId]: value,
    }))
  }

  const onNameChange = (deviceId, value) => {
    setNameForms((current) => ({
      ...current,
      [deviceId]: value,
    }))
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

  const handlePasswordUpdate = async (deviceId) => {
    const nextPassword = (passwordForms[deviceId] || '').trim()
    if (!nextPassword) {
      setError('Password is required')
      return
    }

    setUpdatingDeviceId(deviceId)
    setError('')
    setMessage('')

    try {
      await updateAdminUserPassword(deviceId, { ps_cookie: nextPassword })
      setPasswordForms((current) => ({
        ...current,
        [deviceId]: '',
      }))
      setMessage('Password updated successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to update password')
    } finally {
      setUpdatingDeviceId('')
    }
  }

  const handleNameUpdate = async (deviceId) => {
    const user = users.find((u) => u.device_id === deviceId)
    const nextName = (nameForms[deviceId] !== undefined ? nameForms[deviceId] : (user?.name || '')).trim()

    setUpdatingNameDeviceId(deviceId)
    setError('')
    setMessage('')

    try {
      await updateAdminUserName(deviceId, { name: nextName })
      setMessage('User name updated successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to update name')
    } finally {
      setUpdatingNameDeviceId('')
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
                  <span>Name</span>
                  <input
                    name="name"
                    value={form.name}
                    onChange={onChange}
                    placeholder="Enter user name"
                    autoComplete="off"
                    spellCheck={false}
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
                          <div className="admin-user-id" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {user.name ? (
                              <>
                                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{user.name}</span>
                                <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {user.device_id}</span>
                              </>
                            ) : (
                              <span>{user.device_id}</span>
                            )}
                          </div>
                          <div className="admin-user-meta">Created {createdAt}</div>
                          <div className="admin-user-meta">Updated {updatedAt}</div>

                          <form
                            className="admin-user-password-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              handleNameUpdate(user.device_id)
                            }}
                            style={{ marginBottom: 6 }}
                          >
                            <input
                              className="admin-user-password-input"
                              type="text"
                              value={nameForms[user.device_id] !== undefined ? nameForms[user.device_id] : (user.name || '')}
                              onChange={(event) => onNameChange(user.device_id, event.target.value)}
                              placeholder="Name"
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              type="submit"
                              className="admin-password-btn"
                              disabled={updatingNameDeviceId === user.device_id}
                            >
                              {updatingNameDeviceId === user.device_id ? 'Saving…' : 'Update name'}
                            </button>
                          </form>

                          <form
                            className="admin-user-password-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              handlePasswordUpdate(user.device_id)
                            }}
                          >
                            <input
                              className="admin-user-password-input"
                              type="password"
                              value={passwordForms[user.device_id] || ''}
                              onChange={(event) => onPasswordChange(user.device_id, event.target.value)}
                              placeholder="New password"
                              autoComplete="off"
                              spellCheck={false}
                              required
                            />
                            <button
                              type="submit"
                              className="admin-password-btn"
                              disabled={updatingDeviceId === user.device_id}
                            >
                              {updatingDeviceId === user.device_id ? 'Saving…' : 'Update password'}
                            </button>
                          </form>
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
