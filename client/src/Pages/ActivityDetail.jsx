import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getActivityDetails, formatImageUrl, startActivity, addParticipants, transferActivity } from '../api/auth.js'

function getInitials(title) {
	if (!title) return '??'
	const words = title.replace(/^[\dA-Z]+ - /, '').split(' ')
	return words
		.filter((w) => w.length > 2)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase() || title.slice(0, 2).toUpperCase()
}

const STATUS_STYLES = {
	Approved: { bg: 'rgba(79,199,144,0.12)', color: 'rgba(79,199,144,1)' },
	Active: { bg: 'rgba(232,168,76,0.12)', color: 'rgba(232,168,76,1)' },
	Pending: { bg: 'rgba(100,160,255,0.12)', color: 'rgba(100,160,255,1)' },
}

function statusStyle(status) {
	return STATUS_STYLES[status] ?? { bg: 'rgba(140,146,160,0.12)', color: 'rgba(140,146,160,1)' }
}

function formatDuration(start, end) {
	if (!start || !end) return ''
	const toMins = (t) => {
		const [h, m] = t.split(':').map(Number)
		return h * 60 + m
	}
	const startParts = start.match(/(\d+):(\d+)\s*(AM|PM)?/i)
	const endParts = end.match(/(\d+):(\d+)\s*(AM|PM)?/i)
	if (!startParts || !endParts) return ''

	let sh = parseInt(startParts[1], 10)
	const sm = parseInt(startParts[2], 10)
	const sAmPm = startParts[3]
	let eh = parseInt(endParts[1], 10)
	const em = parseInt(endParts[2], 10)
	const eAmPm = endParts[3]

	if (sAmPm) {
		if (sAmPm.toUpperCase() === 'PM' && sh !== 12) sh += 12
		if (sAmPm.toUpperCase() === 'AM' && sh === 12) sh = 0
	}
	if (eAmPm) {
		if (eAmPm.toUpperCase() === 'PM' && eh !== 12) eh += 12
		if (eAmPm.toUpperCase() === 'AM' && eh === 12) eh = 0
	}

	const mins = (eh * 60 + em) - (sh * 60 + sm)
	if (mins <= 0) return ''
	const h = Math.floor(mins / 60)
	const m = mins % 60
	if (h === 0) return `${m}m`
	return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ─── QR Code Helper Component ──────────────────────────────────────────────────
function QRCode({ value }) {
	const containerRef = useRef(null)
	const qrInstanceRef = useRef(null)

	useEffect(() => {
		if (!value || !containerRef.current) return

		containerRef.current.innerHTML = ''
		qrInstanceRef.current = null

		if (typeof window.QRCode !== 'undefined') {
			qrInstanceRef.current = new window.QRCode(containerRef.current, {
				text: value,
				width: 180,
				height: 180,
				colorDark: '#1a1a2e',
				colorLight: '#ffffff',
				correctLevel: window.QRCode.CorrectLevel.M,
			})
		} else {
			containerRef.current.innerHTML = `<p style="font-size:12px;word-break:break-all;color:#666">${value}</p>`
		}

		return () => {
			if (containerRef.current) containerRef.current.innerHTML = ''
		}
	}, [value])

	return (
		<div className="qr-code-wrapper">
			<div ref={containerRef} className="qr-canvas" />
		</div>
	)
}

// ─── Participant Card ─────────────────────────────────────────────────────────

function ParticipantCard({ participant, isCurrentUser }) {
	const { bg, color } = statusStyle(participant.status)
	return (
		<div className={`ad-participant-card${isCurrentUser ? ' ad-participant-highlight' : ''}`}>
			<div className="ad-participant-top">
				<img
					src={formatImageUrl(participant.user_profile, participant.user_id)}
					alt={participant.user_name}
					className="ad-participant-avatar"
					onError={(e) => {
						e.currentTarget.style.display = 'none'
						e.currentTarget.nextElementSibling.style.display = 'flex'
					}}
				/>
				<div
					className="ad-participant-avatar-fallback"
					style={{ display: 'none' }}
				>
					{participant.user_name?.charAt(0) || '?'}
				</div>
				{isCurrentUser && <span className="ad-you-badge">You</span>}
			</div>
			<div className="ad-participant-info">
				<span className="ad-participant-name">{participant.user_name}</span>
				<span className="ad-participant-id">{participant.user_id}</span>
			</div>
			<div className="activity-status-pill" style={{ background: bg, color, alignSelf: 'center', marginTop: 'auto' }}>
				{participant.status}
			</div>
		</div>
	)
}

// ─── Activity Detail Page ─────────────────────────────────────────────────────

export default function ActivityDetail() {
	const { id } = useParams()
	const navigate = useNavigate()

	const [detail, setDetail] = useState(null)
	const [masterData, setMasterData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [masterLoading, setMasterLoading] = useState(false)
	const [error, setError] = useState('')
	const [participantSearch, setParticipantSearch] = useState('')
	const [qrData, setQrData] = useState(null)
	const [timeLeft, setTimeLeft] = useState(0)
	const [starting, setStarting] = useState(false)
	const [addingParticipants, setAddingParticipants] = useState(false)
	const [toast, setToast] = useState(null)

	const showToast = (message, type = 'error') => {
		setToast({ message, type })
		setTimeout(() => setToast(null), 4000)
	}

	// Countdown for OTP/QR code expiry
	useEffect(() => {
		if (timeLeft <= 0) {
			if (qrData) setQrData(null)
			return
		}
		const timer = setTimeout(() => {
			setTimeLeft((prev) => prev - 1)
		}, 1000)
		return () => clearTimeout(timer)
	}, [timeLeft, qrData])

	const handleStartActivity = async () => {
		if (!detail) return
		setStarting(true)
		try {
			const masterId = detail.parent_activity_id || detail.group_formation?.master_activity_id || detail.id
			const res = await startActivity(masterId)
			if (res.success && res.data) {
				setQrData(res.data)
				setTimeLeft(res.data.expire || 20)
			} else {
				showToast(res.message || 'Failed to start activity', 'error')
			}
		} catch (err) {
			showToast(err.message || 'Failed to start activity', 'error')
		} finally {
			setStarting(false)
		}
	}

	const handleAddParticipants = async () => {
		if (!detail) return
		setAddingParticipants(true)
		try {
			const masterId = detail.parent_activity_id || detail.group_formation?.master_activity_id || detail.id
			const res = await addParticipants(masterId)
			if (res.success && res.data) {
				setQrData(res.data)
				setTimeLeft(res.data.expire || 20)
			} else {
				showToast(res.message || 'Failed to generate add-participant code', 'error')
			}
		} catch (err) {
			showToast(err.message || 'Failed to generate add-participant code', 'error')
		} finally {
			setAddingParticipants(false)
		}
	}

	const [showTransferModal, setShowTransferModal] = useState(false)
	const [transferToUser, setTransferToUser] = useState('')
	const [transferRemarks, setTransferRemarks] = useState('')
	const [transferring, setTransferring] = useState(false)

	const handleTransferActivity = async (e) => {
		e.preventDefault()
		if (!detail || !transferToUser.trim()) return
		setTransferring(true)
		try {
			const masterId = detail.parent_activity_id || detail.group_formation?.master_activity_id || detail.id
			const res = await transferActivity(masterId, transferToUser.trim(), transferRemarks.trim())
			if (res.success) {
				showToast(res.message || 'Activity transferred successfully', 'success')
				setShowTransferModal(false)
				setTransferToUser('')
				setTransferRemarks('')
				// Refresh details
				getActivityDetails(id).then((res) => setDetail(res.data)).catch(() => {})
			} else {
				showToast(res.message || 'Failed to transfer activity', 'error')
			}
		} catch (err) {
			showToast(err.message || 'Failed to transfer activity', 'error')
		} finally {
			setTransferring(false)
		}
	}

	// Fetch activity details
	useEffect(() => {
		let active = true
		setLoading(true)
		setError('')
		setDetail(null)
		setMasterData(null)

		getActivityDetails(id)
			.then((res) => {
				if (!active) return
				const data = res.data
				setDetail(data)

				// If there's a parent (master) activity, fetch it for participant list
				const masterId = data.parent_activity_id || data.group_formation?.master_activity_id
				if (masterId && masterId > 0 && masterId !== data.id) {
					setMasterLoading(true)
					getActivityDetails(masterId)
						.then((masterRes) => {
							if (active) setMasterData(masterRes.data)
						})
						.catch(() => { /* silently fail */ })
						.finally(() => { if (active) setMasterLoading(false) })
				}
			})
			.catch((err) => {
				if (active) setError(err.message || 'Failed to load activity details')
			})
			.finally(() => {
				if (active) setLoading(false)
			})

		return () => { active = false }
	}, [id])

	const { bg, color } = detail ? statusStyle(detail.status) : {}
	const participants = masterData?.sub_activities ?? detail?.sub_activities ?? []
	const duration = detail ? formatDuration(detail.start_time, detail.end_time) : ''

	const filteredParticipants = useMemo(() => {
		if (!participantSearch.trim()) return participants
		const q = participantSearch.trim().toLowerCase()
		return participants.filter((p) =>
			(p.user_name && p.user_name.toLowerCase().includes(q)) ||
			(p.user_id && p.user_id.toLowerCase().includes(q))
		)
	}, [participants, participantSearch])

	return (
		<main className="ad-shell">
			<div className="ad-container">
				{/* Back button */}
				<button className="ad-back-btn" onClick={() => navigate('/activity')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
					</svg>
					Back to Activities
				</button>

				{/* Loading State */}
				{loading && (
					<div className="ad-loading-state">
						<div className="spinner" />
						<p>Loading activity details…</p>
					</div>
				)}

				{/* Error State */}
				{error && !loading && (
					<div className="ad-error-state">
						<span>⚠</span>
						<p>{error}</p>
						<button onClick={() => navigate('/activity')}>Go back</button>
					</div>
				)}

				{/* Detail Content */}
				{detail && !loading && (
					<>
						{/* Hero Card */}
						<section className="ad-hero-card">
							<div className="ad-hero-header">
								<div
									className="activity-initials ad-hero-initials"
									style={{ background: 'rgba(79,199,144,0.1)', borderColor: 'rgba(79,199,144,0.3)', color: 'var(--accent)' }}
								>
									{getInitials(detail.title)}
								</div>
								<div className="ad-hero-title-block">
									<span className="activity-card-kicker">{detail.category}</span>
									<h1>{detail.title}</h1>
									{detail.description_raw && detail.description_raw !== '-' && (
										<p className="ad-hero-desc">{detail.description_raw}</p>
									)}
								</div>
								<div className="activity-status-pill" style={{ background: bg, color, fontSize: '13px', padding: '6px 16px' }}>
									{detail.status}
								</div>
							</div>

							{/* Meta Grid */}
							<div className="ad-meta-grid">
								<div className="ad-meta-cell">
									<span>Date</span>
									<strong>
										{detail.from_date}
										{detail.to_date && detail.to_date !== detail.from_date ? ` → ${detail.to_date}` : ''}
									</strong>
								</div>
								<div className="ad-meta-cell">
									<span>Start</span>
									<strong>{detail.start_time || '--'}</strong>
								</div>
								<div className="ad-meta-cell">
									<span>End</span>
									<strong>{detail.end_time || '--'}</strong>
								</div>
								{duration && (
									<div className="ad-meta-cell">
										<span>Duration</span>
										<strong>{duration}</strong>
									</div>
								)}
								<div className="ad-meta-cell">
									<span>Score</span>
									<strong>{detail.score_earned ?? 0}</strong>
								</div>
								<div className="ad-meta-cell">
									<span>Activity ID</span>
									<strong>#{detail.id}</strong>
								</div>
							</div>

							{/* Faculty / Assigned User */}
							{detail.user_name && (
								<div className="ad-faculty-card">
									<img
										src={formatImageUrl(detail.user_profile, detail.user_id)}
										alt={detail.user_name}
										className="ad-faculty-avatar"
										onError={(e) => { e.currentTarget.style.display = 'none' }}
									/>
									<div className="ad-faculty-info">
										<span className="ad-faculty-label">Faculty / Assigned</span>
										<span className="ad-faculty-name">{detail.user_name}</span>
										<span className="ad-faculty-id">{detail.user_id}</span>
									</div>
								</div>
							)}

							{/* Venue */}
							{detail.institute_venue && detail.institute_venue !== '-' && (
								<div className="ad-info-row">
									<span className="ad-info-label">Venue</span>
									<span className="ad-info-value">
										{detail.institute_venue}
										{detail.institute_block && detail.institute_block !== '-' && (
											<span className="ad-block-tag">{detail.institute_block}</span>
										)}
									</span>
								</div>
							)}

							{/* Remarks */}
							{detail.remarks && detail.remarks !== '-' && (
								<div className="ad-info-row">
									<span className="ad-info-label">Remarks</span>
									<span className="ad-info-value">{detail.remarks}</span>
								</div>
							)}

							{/* Current Status */}
							{detail.current_status && (
								<div className="ad-info-row">
									<span className="ad-info-label">Current Status</span>
									<span className="ad-info-value ad-current-status">{detail.current_status.replace(/_/g, ' ')}</span>
								</div>
							)}

							{/* Actions Area */}
							<div className="ad-actions-area" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
								<button className="ad-primary-btn" onClick={handleStartActivity} disabled={starting}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<polygon points="5 3 19 12 5 21 5 3" />
									</svg>
									{starting ? 'Starting...' : 'Start Activity'}
								</button>
								<button className="ad-primary-btn" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', boxShadow: 'none', border: '1.5px solid var(--border-accent)' }} onClick={handleAddParticipants} disabled={addingParticipants}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
									</svg>
									{addingParticipants ? 'Adding...' : 'Add Participant'}
								</button>
								<button className="ad-primary-btn" style={{ background: 'var(--red-bg)', color: 'var(--red)', boxShadow: 'none', border: '1.5px solid rgba(209, 77, 114, 0.3)' }} onClick={() => setShowTransferModal(true)}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
									</svg>
									Transfer Activity
								</button>
							</div>
						</section>

						{/* Surveys */}
						{detail.survey?.length > 0 && (
							<section className="ad-section-card">
								<div className="ad-section-header">
									<h2>Surveys</h2>
									<span className="ad-section-count">{detail.survey.length}</span>
								</div>
								<div className="ad-survey-list">
									{detail.survey.map((s) => (
										<div key={s.survey_id} className="ad-survey-item">
											<div className="ad-survey-info">
												<span className="ad-survey-name">{s.survey_name}</span>
												<span className="ad-survey-qs">{s.questions_count} Question{s.questions_count !== 1 ? 's' : ''}</span>
											</div>
											<span
												className="activity-status-pill"
												style={s.completed
													? { background: 'rgba(79,199,144,0.12)', color: 'rgba(79,199,144,1)' }
													: { background: 'rgba(232,168,76,0.12)', color: 'rgba(232,168,76,1)' }
												}
											>
												{s.completed ? 'Completed' : 'Pending'}
											</span>
										</div>
									))}
								</div>
							</section>
						)}

						{/* Master Activity Info */}
						{detail.parent_activity_id > 0 && (
							<section className="ad-section-card">
								<div className="ad-section-header">
									<h2>Master Activity</h2>
									<span className="ad-section-count">#{detail.parent_activity_id}</span>
								</div>
								<p className="ad-master-note">
									This activity is part of a group managed under master activity <strong>#{detail.parent_activity_id}</strong>.
									{participants.length > 0 && ` There are ${participants.length} participants.`}
								</p>
							</section>
						)}

						{/* Participants */}
						{masterLoading && (
							<section className="ad-section-card">
								<div className="ad-section-header">
									<h2>Participants</h2>
								</div>
								<div className="ad-loading-state" style={{ padding: '2rem 0' }}>
									<div className="spinner" />
									<p>Loading participants…</p>
								</div>
							</section>
						)}

						{!masterLoading && participants.length > 0 && (
							<section className="ad-section-card">
								<div className="ad-section-header">
									<h2>Participants</h2>
									<span className="ad-section-count">{filteredParticipants.length} / {participants.length}</span>
								</div>
								<div className="ad-search-bar">
									<svg className="ad-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
									</svg>
									<input
										type="text"
										placeholder="Search by name or ID…"
										value={participantSearch}
										onChange={(e) => setParticipantSearch(e.target.value)}
										className="ad-search-input"
									/>
									{participantSearch && (
										<button className="ad-search-clear" onClick={() => setParticipantSearch('')} aria-label="Clear search">✕</button>
									)}
								</div>
								{filteredParticipants.length > 0 ? (
									<div className="ad-participants-grid">
										{filteredParticipants.map((p) => (
											<ParticipantCard
												key={p.id}
												participant={p}
												isCurrentUser={p.id === detail.id}
											/>
										))}
									</div>
								) : (
									<div className="ad-no-results">No participants match "{participantSearch}"</div>
								)}
							</section>
						)}
					</>
				)}
			</div>

			{qrData && (
				<div className="ad-modal-overlay" onClick={() => setQrData(null)}>
					<div className="ad-modal-content" onClick={(e) => e.stopPropagation()}>
						<button className="ad-modal-close" onClick={() => setQrData(null)}>✕</button>
						
						<div className="ad-modal-header">
							<h3>Activity Started</h3>
							<p>Scan the QR code or enter the OTP to join</p>
						</div>

						<div className="ad-modal-qr-container">
							{qrData.qr_value && <QRCode value={qrData.qr_value} />}
						</div>

						<div className="ad-modal-otp-section">
							<span className="ad-otp-label">OTP Code</span>
							<div className="ad-otp-display">
								{String(qrData.otp).split('').map((char, index) => (
									<span key={index} className="ad-otp-digit">{char}</span>
								))}
							</div>
						</div>

						<div className="ad-modal-footer">
							<div className="ad-timer-bar">
								<div 
									className="ad-timer-progress" 
									style={{ width: `${(timeLeft / (qrData.expire || 20)) * 100}%` }}
								/>
							</div>
							<span className="ad-timer-text">Expires in <strong>{timeLeft}s</strong></span>
						</div>
					</div>
				</div>
			)}

			{showTransferModal && (
				<div className="ad-modal-overlay" onClick={() => setShowTransferModal(false)}>
					<div className="ad-modal-content" style={{ maxWidth: '400px', textAlign: 'left', alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
						<button className="ad-modal-close" onClick={() => setShowTransferModal(false)}>✕</button>
						
						<div className="ad-modal-header" style={{ textAlign: 'center', marginBottom: '10px' }}>
							<h3>Transfer Activity</h3>
							<p>Reassign this activity to another user</p>
						</div>

						<form onSubmit={handleTransferActivity} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
								<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Recipient User ID</label>
								<input 
									type="text" 
									value={transferToUser} 
									onChange={(e) => setTransferToUser(e.target.value)}
									placeholder="e.g. 2025UCS1023"
									required
									style={{
										background: 'var(--bg-input)',
										border: '1.5px solid var(--border)',
										borderRadius: 'var(--radius-md)',
										padding: '10px 14px',
										fontSize: '14px',
										color: 'var(--text-primary)',
										outline: 'none',
										fontFamily: 'var(--font-mono)'
									}}
								/>
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
								<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Remarks</label>
								<textarea 
									value={transferRemarks} 
									onChange={(e) => setTransferRemarks(e.target.value)}
									placeholder="Reason for transfer..."
									rows="3"
									style={{
										background: 'var(--bg-input)',
										border: '1.5px solid var(--border)',
										borderRadius: 'var(--radius-md)',
										padding: '10px 14px',
										fontSize: '14px',
										color: 'var(--text-primary)',
										outline: 'none',
										resize: 'none',
										fontFamily: 'var(--font-ui)'
									}}
								/>
							</div>

							<div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
								<button 
									type="button" 
									onClick={() => setShowTransferModal(false)}
									style={{
										flex: 1,
										background: 'var(--bg-input)',
										color: 'var(--text-primary)',
										border: 'none',
										borderRadius: 'var(--radius-md)',
										padding: '12px',
										fontWeight: '600',
										cursor: 'pointer'
									}}
								>
									Cancel
								</button>
								<button 
									type="submit" 
									disabled={transferring || !transferToUser.trim()}
									style={{
										flex: 1,
										background: 'var(--red)',
										color: '#fff',
										border: 'none',
										borderRadius: 'var(--radius-md)',
										padding: '12px',
										fontWeight: '600',
										cursor: 'pointer',
										opacity: transferring ? 0.7 : 1
									}}
								>
									{transferring ? 'Transferring...' : 'Transfer'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{toast && (
				<div className={`ad-toast ad-toast-${toast.type}`}>
					<span>{toast.type === 'success' ? '✓' : '⚠'}</span>
					<p>{toast.message}</p>
				</div>
			)}
		</main>
	)
}
