import { useEffect, useState } from 'react'
import { createShareToken, revokeShareToken } from '../api/auth.js'

function ShareManage() {
    const [shareData, setShareData] = useState(null)   // { share_token, expires_at, link }
    const [ttl, setTtl] = useState(30)
    const [loading, setLoading] = useState(false)
    const [revoking, setRevoking] = useState(false)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)

    const handleCreate = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await createShareToken(ttl)
            setShareData(res)
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

    const expiresIn = shareData
        ? shareData.permanent
            ? 'Never expires'
            : (() => {
                const diff = Math.max(0, new Date(shareData.expires_at) - Date.now())
                const mins = Math.floor(diff / 60000)
                return mins > 0 ? `${mins} min` : 'Expired'
            })()
        : null

    return (
        <main className="activity-shell">
            <section className="activity-page-card">
                <div className="activity-page-content">

                    <div className="activity-page-header">
                        <div className="activity-badge">Share OTP Link</div>
                    </div>

                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -8 }}>
                        Generate a temporary link so someone else can submit an OTP on your behalf — no account needed on their end.
                    </p>

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

                    {error && <div className="activity-message error">{error}</div>}

                    {/* Generated Link */}
                    {shareData && (
                        <div className="share-link-panel">
                            <div className="share-link-header">
                                <span className="share-link-badge">Active link</span>
                                <span className="share-link-ttl">
                                    {shareData.permanent ? '∞ No expiry' : `⏱ ${expiresIn} remaining`}
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
                    )}

                    {/* Actions */}
                    <div className="share-actions">
                        <button
                            type="button"
                            className="otp-submit-btn"
                            onClick={handleCreate}
                            disabled={loading}
                            style={{ maxWidth: 260 }}
                        >
                            {loading ? <span className="btn-spinner">⟳</span> : null}
                            {shareData ? 'Regenerate link' : 'Generate share link'}
                        </button>

                        {shareData && (
                            <button
                                type="button"
                                className="share-revoke-btn"
                                onClick={handleRevoke}
                                disabled={revoking}
                            >
                                {revoking ? 'Revoking…' : 'Revoke link'}
                            </button>
                        )}
                    </div>

                    {/* How it works */}
                    <div className="share-howto">
                        <div className="share-howto-label">How it works</div>
                        <ol className="share-howto-list">
                            <li>Generate a link above and copy it.</li>
                            <li>Send it to anyone — they don't need to be logged in.</li>
                            <li>They open the link and enter the OTP from your screen.</li>
                            <li>The OTP is submitted using your session automatically.</li>
                            <li>Revoke the link at any time or let it expire.</li>
                        </ol>
                    </div>

                </div>
            </section>
        </main>
    )
}

export default ShareManage