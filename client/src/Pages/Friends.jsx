import { useEffect, useState } from 'react'
import { sendFriendRequest, getFriendRequests, approveFriendRequest, rejectFriendRequest, listFriends, removeFriend } from '../api/auth.js'

function Friends() {
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [newDeviceId, setNewDeviceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const f = await listFriends()
      setFriends(f.friends || [])
    } catch (err) {
      setError(err.message || 'Failed to load friends')
    }
    try {
      const r = await getFriendRequests()
      setIncoming(r.incoming || [])
      setOutgoing(r.outgoing || [])
    } catch (err) {
      setError(err.message || 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleSend = async () => {
    if (!newDeviceId) return
    try {
      await sendFriendRequest(newDeviceId)
      setNewDeviceId('')
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to send request')
    }
  }

  const handleApprove = async (id) => {
    try {
      await approveFriendRequest(id)
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to approve')
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectFriendRequest(id)
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to reject')
    }
  }

  const handleRemove = async (deviceId) => {
    if (!confirm(`Remove ${deviceId} from friends?`)) return
    try {
      await removeFriend(deviceId)
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to remove friend')
    }
  }

  if (loading) return (
    <main className="friends-shell">
      <section className="page-card">
        <h2>Friends</h2>
        <div className="spinner" />
      </section>
    </main>
  )

  return (
    <main className="friends-shell">
      <section className="page-card">
        <div className="page-header">
          <h2>Friends</h2>
        </div>

        <div className="friend-actions">
          <input value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} placeholder="Device ID to add" />
          <button className="btn btn-primary" onClick={handleSend}>Send Request</button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="friends-grid">
          <div className="friends-card">
            <h3>Current Friends</h3>
            {friends.length === 0 ? <p>No friends yet</p> : (
              <ul>
                {friends.map((f) => (
                  <li key={f.device_id}>
                    <span>{f.device_id}</span>
                    <button className="btn btn-ghost" onClick={() => handleRemove(f.device_id)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="friends-card">
            <h3>Incoming Requests</h3>
            {incoming.length === 0 ? <p>No incoming requests</p> : (
              <ul>
                {incoming.map((r) => (
                  <li key={r.id}>
                    <span>{r.from_device}</span>
                    <div>
                      <button className="btn btn-primary" onClick={() => handleApprove(r.id)}>Approve</button>
                      <button className="btn btn-ghost" onClick={() => handleReject(r.id)}>Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="friends-card">
            <h3>Outgoing Requests</h3>
            {outgoing.length === 0 ? <p>No outgoing requests</p> : (
              <ul>
                {outgoing.map((r) => (
                  <li key={r.id}>
                    <span>{r.to_device}</span>
                    <span className="small">({r.status})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default Friends
