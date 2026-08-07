import { useEffect, useState, useMemo } from 'react'
import {
  sendFriendRequest,
  getFriendRequests,
  approveFriendRequest,
  rejectFriendRequest,
  listFriends,
  removeFriend,
  setFriendNickname,
  submitFriendsOTP,
  createShareToken,
  revokeShareToken,
  getMyShareToken,
  formatImageUrl,
} from '../api/auth.js'

function Friends() {
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [newDeviceId, setNewDeviceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('friends') // 'friends' | 'requests' | 'add'

  // Nickname inline editing state
  const [editingNicknameId, setEditingNicknameId] = useState(null)
  const [nicknameInput, setNicknameInput] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  // Multi-select & OTP state
  const [selectedFriends, setSelectedFriends] = useState([]) // array of device_ids
  const [includeSelf, setIncludeSelf] = useState(true)
  const [otp, setOtp] = useState('')
  const [submittingOtp, setSubmittingOtp] = useState(false)
  const [otpResults, setOtpResults] = useState(null)
  const [otpError, setOtpError] = useState('')

  // Group share link state
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [shareTtl, setShareTtl] = useState(30)
  const [customShareCode, setCustomShareCode] = useState('')
  const [creatingShare, setCreatingShare] = useState(false)
  const [groupShareData, setGroupShareData] = useState(null)
  const [shareError, setShareError] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [revokingShare, setRevokingShare] = useState(false)

  // Single friend quick OTP modal state
  const [quickTarget, setQuickTarget] = useState(null) // { device_id, nickname }
  const [quickOtp, setQuickOtp] = useState('')
  const [quickSubmitting, setQuickSubmitting] = useState(false)
  const [quickResult, setQuickResult] = useState(null)

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
    }
    try {
      const s = await getMyShareToken()
      if (s && s.active) {
        setGroupShareData(s)
      } else {
        setGroupShareData(null)
      }
    } catch {
      // Ignore share fetch error on load
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Map of device_id -> friend object for fast nickname lookup
  const friendMap = useMemo(() => {
    const map = {}
    friends.forEach((f) => {
      map[f.device_id] = f
    })
    return map
  }, [friends])

  // Multi-select helpers
  const toggleSelectFriend = (deviceId) => {
    setSelectedFriends((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    )
  }

  const selectAllFriends = () => {
    setSelectedFriends(friends.map((f) => f.device_id))
  }

  const deselectAllFriends = () => {
    setSelectedFriends([])
  }

  // Handle setting / updating friend nickname
  const handleSaveNickname = async (friendDeviceId) => {
    setSavingNickname(true)
    try {
      await setFriendNickname(friendDeviceId, nicknameInput.trim())
      setEditingNicknameId(null)
      setNicknameInput('')
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to update nickname')
    } finally {
      setSavingNickname(false)
    }
  }

  const handleSend = async (e) => {
    if (e) e.preventDefault()
    if (!newDeviceId.trim()) return
    setError('')
    try {
      await sendFriendRequest(newDeviceId.trim())
      setNewDeviceId('')
      await loadAll()
      alert('Friend request sent successfully!')
    } catch (err) {
      setError(err.message || 'Failed to send request')
    }
  }

  const handleApprove = async (id) => {
    try {
      await approveFriendRequest(id)
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to approve request')
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectFriendRequest(id)
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to reject request')
    }
  }

  const handleRemove = async (deviceId) => {
    const friend = friendMap[deviceId]
    const displayName = friend?.nickname ? `${friend.nickname} (${deviceId})` : deviceId
    if (!confirm(`Remove ${displayName} from friends?`)) return
    try {
      await removeFriend(deviceId)
      setSelectedFriends((prev) => prev.filter((id) => id !== deviceId))
      await loadAll()
    } catch (err) {
      alert(err.message || 'Failed to remove friend')
    }
  }

  // Multi-Target OTP Submission
  const handleSubmitGroupOTP = async (e) => {
    if (e) e.preventDefault()
    const cleanOtp = otp.trim().replace(/\D/g, '').slice(0, 6)
    if (cleanOtp.length !== 6) {
      setOtpError('OTP must be exactly 6 digits')
      return
    }
    if (!includeSelf && selectedFriends.length === 0) {
      setOtpError('Please select at least one friend or check "Include Myself"')
      return
    }

    setSubmittingOtp(true)
    setOtpError('')
    setOtpResults(null)

    try {
      const res = await submitFriendsOTP(cleanOtp, selectedFriends, includeSelf)
      setOtpResults(res.results || [])
      setOtp('')
    } catch (err) {
      setOtpError(err.message || 'Failed to submit OTP for selected targets')
    } finally {
      setSubmittingOtp(false)
    }
  }

  // Single Friend Quick OTP Submission
  const handleQuickOTP = async (e) => {
    if (e) e.preventDefault()
    const cleanQuickOtp = quickOtp.trim().replace(/\D/g, '').slice(0, 6)
    if (!quickTarget || cleanQuickOtp.length !== 6) return
    setQuickSubmitting(true)
    setQuickResult(null)
    try {
      const res = await submitFriendsOTP(cleanQuickOtp, [quickTarget.device_id], false)
      setQuickResult(res.results && res.results[0] ? res.results[0] : { success: true })
      setQuickOtp('')
    } catch (err) {
      setQuickResult({ success: false, error: err.message || 'Failed to submit OTP' })
    } finally {
      setQuickSubmitting(false)
    }
  }

  // Group Broadcast Share Link Creation
  const handleCreateGroupShare = async (e) => {
    if (e) e.preventDefault()
    if (!includeSelf && selectedFriends.length === 0) {
      setShareError('Please select at least one friend or check "Include Myself"')
      return
    }
    setCreatingShare(true)
    setShareError('')
    try {
      const res = await createShareToken(shareTtl, customShareCode, selectedFriends, includeSelf)
      setGroupShareData(res)
      setShowShareModal(false)
      setCustomShareCode('')
    } catch (err) {
      setShareError(err.message || 'Failed to create group share link')
    } finally {
      setCreatingShare(false)
    }
  }

  const handleRevokeGroupShare = async () => {
    if (!confirm('Are you sure you want to delete this broadcast share link?')) return
    setRevokingShare(true)
    try {
      await revokeShareToken()
      setGroupShareData(null)
      setShowDetailsModal(false)
    } catch (err) {
      alert(err.message || 'Failed to delete share link')
    } finally {
      setRevokingShare(false)
    }
  }

  const handleCopyShare = () => {
    if (!groupShareData?.link) return
    navigator.clipboard.writeText(groupShareData.link)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const totalTargetsCount = (includeSelf ? 1 : 0) + selectedFriends.length

  // Build readable target names summary
  const selectedTargetNames = useMemo(() => {
    const names = selectedFriends.map((id) => friendMap[id]?.nickname || id)
    if (includeSelf) names.unshift('Myself')
    return names
  }, [selectedFriends, includeSelf, friendMap])

  const TTL_OPTIONS = [
    { label: '10m', value: 10 },
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '2h', value: 120 },
    { label: 'Never', value: 0 },
  ]

  const shareExpiresAtLabel = groupShareData?.permanent
    ? 'Never expires'
    : groupShareData?.expires_at
      ? new Date(groupShareData.expires_at).toLocaleString()
      : null

  if (loading) {
    return (
      <main className="activity-shell">
        <section className="activity-page-card">
          <div className="activity-page-content">
            <div className="activity-page-header">
              <div className="activity-badge">Friends & Group OTP</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center' }}>
              <div className="spinner" />
              <span>Loading friends...</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="activity-shell">
      <section className="activity-page-card">
        <div className="activity-page-content">
          {/* Page Header & Navigation Tabs */}
          <div className="activity-page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="activity-badge">Friends & Group OTP</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0', color: 'var(--text-primary)' }}>
                Multi-Friend OTP Broadcast
              </h1>
            </div>

            {/* Tab Controls */}
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg-input)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <button
                type="button"
                className={`share-ttl-chip${activeTab === 'friends' ? ' active' : ''}`}
                onClick={() => setActiveTab('friends')}
              >
                Friends ({friends.length})
              </button>
              <button
                type="button"
                className={`share-ttl-chip${activeTab === 'requests' ? ' active' : ''}`}
                onClick={() => setActiveTab('requests')}
              >
                Requests {incoming.length > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{incoming.length}</span>}
              </button>
              <button
                type="button"
                className={`share-ttl-chip${activeTab === 'add' ? ' active' : ''}`}
                onClick={() => setActiveTab('add')}
              >
                + Add Friend
              </button>
            </div>
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -4 }}>
            Assign private nicknames to your friends for easy identification, select friends to submit OTPs for multiple accounts at once, or create group broadcast share links.
          </p>

          {error && <div className="activity-message error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* ACTIVE BROADCAST SHARE LINK CARD (PERMANENT UNTIL DELETED) */}
          {groupShareData && (
            <div
              className="share-link-panel"
              style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border-accent)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                marginBottom: 20,
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
              onClick={() => setShowDetailsModal(true)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="share-link-badge" style={{ background: 'var(--accent)', color: '#fff' }}>
                    Active Broadcast Link
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                    ⏱ {groupShareData.permanent ? '∞ No Expiry' : `Expires ${shareExpiresAtLabel}`}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDetailsModal(true)
                    }}
                    style={{
                      background: 'var(--accent-dim)',
                      border: '1px solid var(--border-accent)',
                      color: 'var(--accent)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    👁 View Target Details ({groupShareData.target_devices?.length || 1})
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRevokeGroupShare()
                    }}
                    disabled={revokingShare}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {revokingShare ? 'Deleting…' : '🗑 Delete Link'}
                  </button>
                </div>
              </div>

              <div className="share-link-box" onClick={(e) => e.stopPropagation()}>
                <span className="share-link-text">{groupShareData.link}</span>
                <button type="button" className="share-copy-btn" onClick={handleCopyShare}>
                  {shareCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                💡 Click this card to view the full list of assigned friends/accounts for this link.
              </p>
            </div>
          )}

          {/* TAB 1: FRIENDS LIST & MULTI-TARGET OTP SUBMISSION */}
          {activeTab === 'friends' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 12 }}>

              {/* Selection Control Toolbar */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border-accent)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={includeSelf}
                      onChange={(e) => setIncludeSelf(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span>Include Myself in Targets</span>
                  </label>

                  <div style={{ height: 20, width: 1, background: 'var(--border)' }} />

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={selectAllFriends}
                      className="share-ttl-chip"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      Select All Friends
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllFriends}
                      className="share-ttl-chip"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-accent)',
                  maxWidth: '100%',
                  wordBreak: 'break-word'
                }}>
                  🎯 {totalTargetsCount} Target{totalTargetsCount === 1 ? '' : 's'} Selected:
                  <span style={{ fontWeight: 400, marginLeft: 4, color: 'var(--text-primary)' }}>
                    {selectedTargetNames.length > 0 ? selectedTargetNames.join(', ') : 'None'}
                  </span>
                </div>
              </div>

              {/* DIRECT OTP SUBMISSION PANEL FOR SELECTED TARGETS */}
              <div className="share-link-panel" style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    ⚡ Direct OTP Broadcast to Selected Targets
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowShareModal(!showShareModal)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-accent)',
                      color: 'var(--accent)',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {showShareModal ? 'Close Link Creator' : '🔗 Create Broadcast Share Link'}
                  </button>
                </div>

                <form onSubmit={handleSubmitGroupOTP} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="share-code-input"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit OTP"
                    maxLength={6}
                    style={{ maxWidth: 220, fontSize: 18, letterSpacing: '0.1em', fontWeight: 700, textAlign: 'center' }}
                  />
                  <button
                    type="submit"
                    className="otp-submit-btn"
                    disabled={submittingOtp || totalTargetsCount === 0 || otp.trim().length !== 6}
                    style={{ maxWidth: 260 }}
                  >
                    {submittingOtp ? <span className="btn-spinner">⟳</span> : null}
                    🚀 Submit OTP for {totalTargetsCount} Target{totalTargetsCount === 1 ? '' : 's'}
                  </button>
                </form>

                {otpError && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{otpError}</p>}

                {/* OTP Results Breakdown */}
                {otpResults && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Target Response Breakdown ({otpResults.length} Account{otpResults.length === 1 ? '' : 's'}):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                      {otpResults.map((res, i) => {
                        const targetFriend = friendMap[res.device_id]
                        const displayName = res.device_id === 'me' ? 'Myself' : (targetFriend?.nickname ? `${targetFriend.nickname} (${res.device_id})` : res.device_id)
                        let respMsg = ''
                        if (res.error) {
                          respMsg = res.error
                        } else if (res.data) {
                          if (typeof res.data === 'string') respMsg = res.data
                          else if (res.data.message) respMsg = res.data.message
                          else if (res.data.error) respMsg = res.data.error
                          else respMsg = JSON.stringify(res.data)
                        } else {
                          respMsg = res.success ? 'Success' : 'Failed'
                        }

                        return (
                          <div
                            key={i}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 'var(--radius-md)',
                              border: `1.5px solid ${res.success ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                              background: res.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                {displayName}
                              </span>
                              <span style={{ fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 4, background: res.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: res.success ? '#22c55e' : '#ef4444' }}>
                                {res.success ? '✓ Success' : `✕ Failed (${res.status || 'Err'})`}
                              </span>
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                              <strong>Response:</strong> {respMsg}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* GROUP BROADCAST SHARE LINK CREATOR (ACCORDION / PANEL) */}
              {showShareModal && (
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--border-accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    🔗 Create Group Share Link for {totalTargetsCount} Selected Target{totalTargetsCount === 1 ? '' : 's'}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Anyone who opens this link can enter an OTP, and it will automatically submit the OTP for all {totalTargetsCount} selected accounts at once!
                  </p>

                  <label className="share-code-field" style={{ margin: 0 }}>
                    <span className="share-code-label">Custom group share code</span>
                    <input
                      type="text"
                      className="share-code-input"
                      value={customShareCode}
                      onChange={(e) => setCustomShareCode(e.target.value)}
                      placeholder="e.g. squad-otp-link"
                    />
                  </label>

                  <div className="share-ttl-row">
                    <span className="share-ttl-label">Link Expiry</span>
                    <div className="share-ttl-options">
                      {TTL_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`share-ttl-chip${shareTtl === opt.value ? ' active' : ''}`}
                          onClick={() => setShareTtl(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shareError && <div className="activity-message error">{shareError}</div>}

                  <button
                    type="button"
                    className="otp-submit-btn"
                    onClick={handleCreateGroupShare}
                    disabled={creatingShare || totalTargetsCount === 0}
                    style={{ maxWidth: 280 }}
                  >
                    {creatingShare ? <span className="btn-spinner">⟳</span> : null}
                    Generate Broadcast Share Link
                  </button>
                </div>
              )}

              {/* FRIENDS LIST WITH NICKNAME SUPPORT */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>
                  Your Friends ({friends.length})
                </h3>

                {friends.length === 0 ? (
                  <div style={{
                    padding: 30,
                    textAlign: 'center',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border)',
                    color: 'var(--text-muted)'
                  }}>
                    <p style={{ margin: 0, fontSize: 14 }}>No friends added yet.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('add')}
                      className="share-ttl-chip active"
                      style={{ marginTop: 12 }}
                    >
                      + Add a friend using their Device ID
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                    {friends.map((f) => {
                      const isSelected = selectedFriends.includes(f.device_id)
                      const isEditingThisNickname = editingNicknameId === f.device_id

                      return (
                        <div
                          key={f.device_id}
                          style={{
                            background: isSelected ? 'var(--accent-dim)' : 'var(--bg-input)',
                            border: `1.5px solid ${isSelected ? 'var(--border-accent)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            transition: 'var(--transition)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFriend(f.device_id)}
                              style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', marginTop: 4 }}
                            />
                            <img
                              src={formatImageUrl('', f.device_id)}
                              alt={f.nickname || f.device_id}
                              style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--border)', objectFit: 'cover', flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Friend Name / Nickname Display */}
                              {f.nickname ? (
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                                      {f.nickname}
                                    </span>
                                    <button
                                      type="button"
                                      title="Edit private nickname"
                                      onClick={() => {
                                        setEditingNicknameId(f.device_id)
                                        setNicknameInput(f.nickname || '')
                                      }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 12, opacity: 0.7 }}
                                    >
                                      ✏️
                                    </button>
                                  </div>
                                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>
                                    ID: {f.device_id}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                    {f.device_id}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNicknameId(f.device_id)
                                      setNicknameInput('')
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--accent)',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      padding: 0,
                                      marginTop: 2,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    + Add Private Nickname
                                  </button>
                                </div>
                              )}

                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                Added {new Date(f.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          {/* Inline Nickname Editor */}
                          {isEditingThisNickname && (
                            <div style={{
                              background: 'var(--bg-card)',
                              border: '1.5px solid var(--border-accent)',
                              borderRadius: 'var(--radius-sm)',
                              padding: 12,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10
                            }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>
                                PRIVATE NICKNAME (Only visible to you)
                              </span>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  value={nicknameInput}
                                  onChange={(e) => setNicknameInput(e.target.value)}
                                  placeholder="e.g. Rahul, Alex, Project Mate"
                                  autoFocus
                                  style={{
                                    flex: '1 1 auto',
                                    minWidth: 0,
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: 14,
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-accent)',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text-primary)',
                                    outline: 'none'
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveNickname(f.device_id)}
                                  disabled={savingNickname}
                                  style={{
                                    padding: '8px 14px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: 'none',
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {savingNickname ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNicknameId(null)}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Quick Action buttons */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickTarget({ device_id: f.device_id, nickname: f.nickname })
                                setQuickOtp('')
                                setQuickResult(null)
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-accent)',
                                background: 'var(--bg-card)',
                                color: 'var(--accent)',
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: 'pointer'
                              }}
                            >
                              ⚡ Submit OTP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(f.device_id)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#ef4444',
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: 'pointer'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FRIEND REQUESTS */}
          {activeTab === 'requests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 12 }}>
              {/* Incoming Requests */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Incoming Friend Requests ({incoming.length})
                </h3>
                {incoming.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No pending incoming requests</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {incoming.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 14,
                          background: 'var(--bg-input)',
                          border: '1.5px solid var(--border)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                          {r.from}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="otp-submit-btn"
                            style={{ padding: '6px 14px', fontSize: 13 }}
                            onClick={() => handleApprove(r.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="share-revoke-btn"
                            style={{ padding: '6px 14px', fontSize: 13 }}
                            onClick={() => handleReject(r.id)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Outgoing Sent Requests ({outgoing.length})
                </h3>
                {outgoing.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No pending outgoing requests</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {outgoing.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 14,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                          {r.to}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '3px 8px', borderRadius: 4 }}>
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ADD FRIEND FORM */}
          {activeTab === 'add' && (
            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12, maxWidth: 460 }}>
              <label className="share-code-field" style={{ margin: 0 }}>
                <span className="share-code-label">Friend's Device ID</span>
                <input
                  type="text"
                  className="share-code-input"
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  placeholder="e.g. B9B6863D-9947-4B2E-920B-D60D67B79BD1"
                  required
                />
                <p className="share-code-hint">
                  Ask your friend for their Device ID (found in their profile or account settings).
                </p>
              </label>

              <button type="submit" className="otp-submit-btn" style={{ maxWidth: 200 }}>
                Send Friend Request
              </button>
            </form>
          )}

        </div>
      </section>

      {/* MODAL 1: ASSIGNED TARGET DETAILS FOR BROADCAST SHARE LINK */}
      {showDetailsModal && groupShareData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            width: '100%',
            maxWidth: 480,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="share-link-badge" style={{ background: 'var(--accent)', color: '#fff' }}>
                  Group Broadcast Link
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 0', color: 'var(--text-primary)' }}>
                  Assigned Targets Breakdown
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Link & Copy Box */}
            <div className="share-link-box">
              <span className="share-link-text">{groupShareData.link}</span>
              <button type="button" className="share-copy-btn" onClick={handleCopyShare}>
                {shareCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              ⏱ <strong>Expiry:</strong> {groupShareData.permanent ? 'Never expires' : shareExpiresAtLabel}
            </div>

            {/* List of Assigned Accounts */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                Target Accounts ({groupShareData.target_devices?.length || 1}):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(groupShareData.target_devices || []).map((devId, idx) => {
                  const targetFriend = friendMap[devId]
                  const isSelf = devId === 'me'
                  const displayName = isSelf ? 'Myself' : (targetFriend?.nickname || devId)

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <img
                        src={formatImageUrl('', isSelf ? '' : devId)}
                        alt={displayName}
                        style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--border)', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                          {displayName} {isSelf && <span style={{ fontSize: 11, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>You</span>}
                        </div>
                        {!isSelf && targetFriend?.nickname && (
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            ID: {devId}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={handleRevokeGroupShare}
                disabled={revokingShare}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                {revokingShare ? 'Deleting…' : '🗑 Delete Link'}
              </button>

              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK SINGLE FRIEND OTP MODAL */}
      {quickTarget && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            width: '100%',
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Submit OTP for Friend</h3>
              <button
                type="button"
                onClick={() => setQuickTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Target: <strong style={{ color: 'var(--accent)' }}>{quickTarget.nickname || quickTarget.device_id}</strong>
              {quickTarget.nickname && <span style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>ID: {quickTarget.device_id}</span>}
            </p>

            <form onSubmit={handleQuickOTP} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="text"
                className="share-code-input"
                inputMode="numeric"
                value={quickOtp}
                onChange={(e) => setQuickOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                maxLength={6}
                autoFocus
                style={{ textAlign: 'center', fontSize: 20, letterSpacing: '0.1em', fontWeight: 700 }}
              />

              <button
                type="submit"
                className="otp-submit-btn"
                disabled={quickSubmitting || quickOtp.trim().length !== 6}
              >
                {quickSubmitting ? <span className="btn-spinner">⟳</span> : null}
                Submit OTP
              </button>
            </form>

            {quickResult && (
              <div style={{
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                background: quickResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${quickResult.success ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                color: quickResult.success ? '#22c55e' : '#ef4444',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center'
              }}>
                {quickResult.success ? `✓ OTP submitted successfully for ${quickTarget.nickname || quickTarget.device_id}!` : `✗ ${quickResult.error || 'Failed to submit OTP'}`}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default Friends
