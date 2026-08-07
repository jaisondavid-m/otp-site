import { useState, useEffect } from 'react'
import { createShareToken, revokeShareToken, getMyShareToken } from '../api/auth.js'

function ShareManage() {
    const [shareData, setShareData] = useState(null)   // { active, share_token, expires_at, link, permanent }
    const [isCreatingNew, setIsCreatingNew] = useState(false)
    const [ttl, setTtl] = useState(30)
    const [shareCode, setShareCode] = useState('')
    const [fetching, setFetching] = useState(true)
    const [loading, setLoading] = useState(false)
    const [revoking, setRevoking] = useState(false)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let isMounted = true
        const fetchExistingToken = async () => {
            setFetching(true)
            try {
                const res = await getMyShareToken()
                if (isMounted) {
                    if (res && res.active) {
                        setShareData(res)
                        setIsCreatingNew(false)
                    } else {
                        setShareData(null)
                        setIsCreatingNew(true)
                    }
                }
            } catch {
                if (isMounted) setIsCreatingNew(true)
            } finally {
                if (isMounted) setFetching(false)
            }
        }
        fetchExistingToken()
        return () => { isMounted = false }
    }, [])

    const handleCreate = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await createShareToken(ttl, shareCode)
            setShareData(res)
            setIsCreatingNew(false)
            setShareCode('')
        } catch (err) {
            setError(err.message || 'Failed to create share link')
        } finally {
            setLoading(false)
        }
    }

    const handleRevoke = async () => {
        setRevoking(true)
        setError('')
        try {
            await revokeShareToken()
            setShareData(null)
            setIsCreatingNew(true)
            setShareCode('')
        } catch (err) {
            setError(err.message || 'Failed to revoke share link')
        } finally {
            setRevoking(false)
        }
    }

    const handleCopy = () => {
        if (!shareData?.link) return
        navigator.clipboard.writeText(shareData.link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const TTL_OPTIONS = [
        { label: '10m', value: 10 },
        { label: '30m', value: 30 },
        { label: '1h', value: 60 },
        { label: '2h', value: 120 },
        { label: 'Never', value: 0 },
    ]

    const expiresAtLabel = shareData?.permanent
        ? 'Never expires'
        : shareData?.expires_at
            ? new Date(shareData.expires_at).toLocaleString()
            : null

    return (
        <main className="activity-shell">
            <section className="activity-page-card">
                <div className="activity-page-content">

                    <div className="activity-page-header">
                        <div className="activity-badge">Share OTP Link</div>
                    </div>

                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -8 }}>
                        Generate a share link so someone else can submit an OTP on your behalf — no login required on their end.
                    </p>

                    {fetching ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--text-muted)' }}>
                            <div className="spinner" style={{ width: 18, height: 18 }} />
                            <span>Checking existing share link...</span>
                        </div>
                    ) : (
                        <>
                            {error && <div className="activity-message error" style={{ marginBottom: 16 }}>{error}</div>}

                            {/* Mode A: Active Share Link Display (Input box hidden) */}
                            {shareData && !isCreatingNew && (
                                <div className="share-active-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
                                    <div className="share-link-panel">
                                        <div className="share-link-header">
                                            <span className="share-link-badge">Active link</span>
                                            <span className="share-link-ttl">
                                                {shareData.permanent ? '∞ No expiry' : `⏱ Expires ${expiresAtLabel}`}
                                            </span>
                                        </div>
                                        <div className="share-link-box">
                                            <span className="share-link-text">{shareData.link}</span>
                                            <button
                                                type="button"
                                                className="share-copy-btn"
                                                onClick={handleCopy}
                                            >
                                                {copied ? '✓ Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="share-link-hint">
                                            Anyone with this link can submit an OTP using your session — no login required.
                                        </p>
                                    </div>

                                    {/* Actions: Create New Code & Delete Link */}
                                    <div className="share-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="otp-submit-btn"
                                            onClick={() => {
                                                setIsCreatingNew(true)
                                                setShareCode('')
                                                setError('')
                                            }}
                                            style={{ maxWidth: 220 }}
                                        >
                                            + Create New Code
                                        </button>

                                        <button
                                            type="button"
                                            className="share-revoke-btn"
                                            onClick={handleRevoke}
                                            disabled={revoking}
                                            style={{
                                                padding: '12px 20px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                color: '#ef4444',
                                                fontWeight: 600,
                                                fontSize: 14,
                                                cursor: 'pointer',
                                                transition: 'var(--transition)',
                                            }}
                                        >
                                            {revoking ? 'Deleting…' : '🗑 Delete Link'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Mode B: Creation Form (shown when no active link exists OR when user clicks "Create New Code") */}
                            {isCreatingNew && (
                                <div className="share-create-form" style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 8 }}>
                                    <label className="share-code-field">
                                        <span className="share-code-label">Custom share code</span>
                                        <input
                                            type="text"
                                            className="share-code-input"
                                            value={shareCode}
                                            onChange={(e) => setShareCode(e.target.value)}
                                            placeholder="e.g. my-custom-code"
                                            autoComplete="off"
                                            spellCheck="false"
                                        />
                                        <p className="share-code-hint">
                                            Leave this empty to generate a random link. Custom codes must be unique across all users.
                                        </p>
                                    </label>

                                    {/* TTL Selector */}
                                    <div className="share-ttl-row">
                                        <span className="share-ttl-label">Link expires after</span>
                                        <div className="share-ttl-options">
                                            {TTL_OPTIONS.map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    className={`share-ttl-chip${ttl === opt.value ? ' active' : ''}`}
                                                    onClick={() => setTtl(opt.value)}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Submit / Cancel Actions */}
                                    <div className="share-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="otp-submit-btn"
                                            onClick={handleCreate}
                                            disabled={loading}
                                            style={{ maxWidth: 220 }}
                                        >
                                            {loading ? <span className="btn-spinner">⟳</span> : null}
                                            Generate share link
                                        </button>

                                        {shareData && (
                                            <button
                                                type="button"
                                                className="share-revoke-btn"
                                                onClick={() => {
                                                    setIsCreatingNew(false)
                                                    setError('')
                                                }}
                                                style={{
                                                    padding: '12px 20px',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--border)',
                                                    background: 'transparent',
                                                    color: 'var(--text-secondary)',
                                                    fontWeight: 500,
                                                    fontSize: 14,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* How it works */}
                    <div className="share-howto" style={{ marginTop: 28 }}>
                        <div className="share-howto-label">How it works</div>
                        <ol className="share-howto-list">
                            <li>Generate a link above and copy it. Each user has 1 active link.</li>
                            <li>Send it to anyone — they don't need to be logged in.</li>
                            <li>They open the link and enter the OTP from your screen.</li>
                            <li>The OTP is submitted using your session automatically.</li>
                            <li>Delete the link at any time or let it expire.</li>
                        </ol>
                    </div>

                </div>
            </section>
        </main>
    )
}

export default ShareManage