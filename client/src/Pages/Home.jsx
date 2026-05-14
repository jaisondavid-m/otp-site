import { useEffect, useState, useRef } from 'react'
import { getPendingActions, getActivityDetails } from '../api/auth.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
	Approved: { bg: 'rgba(79,199,144,0.12)',  color: 'rgba(79,199,144,1)'  },
	Active:   { bg: 'rgba(232,168,76,0.12)',  color: 'rgba(232,168,76,1)'  },
	Pending:  { bg: 'rgba(100,160,255,0.12)', color: 'rgba(100,160,255,1)' },
}

function statusStyle(status) {
	return STATUS_STYLES[status] ?? { bg: 'rgba(140,146,160,0.12)', color: 'rgba(140,146,160,1)' }
}

// ─── Detail Modal (shared with Activity page) ─────────────────────────────────

function ActivityDetailModal({ id, onClose }) {
	const [detail, setDetail] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = '' }
	}, [])

	useEffect(() => {
		const handler = (e) => { if (e.key === 'Escape') onClose() }
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [onClose])

	useEffect(() => {
		let active = true
		setLoading(true)
		setError('')
		setDetail(null)
		getActivityDetails(id)
			.then((res) => { if (active) setDetail(res.data) })
			.catch((err) => { if (active) setError(err.message || 'Failed to load details') })
			.finally(() => { if (active) setLoading(false) })
		return () => { active = false }
	}, [id])

	const handleBackdrop = (e) => {
		if (e.target === e.currentTarget) onClose()
	}

	const { bg, color } = detail ? statusStyle(detail.status) : {}

	return (
		<div className="modal-backdrop" onClick={handleBackdrop}>
			<div className="modal-sheet" role="dialog" aria-modal="true">
				<button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>

				{loading && (
					<div className="modal-state">Loading details…</div>
				)}

				{error && !loading && (
					<div className="modal-state error">{error}</div>
				)}

				{detail && !loading && (
					<>
						<div className="modal-header">
							<div
								className="activity-initials modal-initials"
								style={{ background: 'rgba(79,199,144,0.1)', borderColor: 'rgba(79,199,144,0.3)', color: 'var(--accent)' }}
							>
								{getInitials(detail.title)}
							</div>
							<div className="modal-title-block">
								<span className="activity-card-kicker">{detail.category}</span>
								<h2>{detail.title}</h2>
								{detail.description && detail.description !== detail.title && (
									<p className="activity-card-desc">{detail.description}</p>
								)}
							</div>
							<div className="activity-status-pill" style={{ background: bg, color }}>
								{detail.status}
							</div>
						</div>

						<div className="modal-meta-row">
							<div className="activity-meta-item">
								<span>Date</span>
								<strong>
									{detail.from_date}
									{detail.to_date && detail.to_date !== detail.from_date ? ` → ${detail.to_date}` : ''}
								</strong>
							</div>
							<div className="activity-meta-item">
								<span>Start</span>
								<strong>{detail.start_time}</strong>
							</div>
							<div className="activity-meta-item">
								<span>End</span>
								<strong>{detail.end_time}</strong>
							</div>
							<div className="activity-meta-item">
								<span>Score</span>
								<strong>{detail.score_earned ?? 0}</strong>
							</div>
						</div>

						{detail.institute_venue && detail.institute_venue !== '-' && (
							<div className="modal-section">
								<span className="modal-section-label">Venue</span>
								<span>{detail.institute_venue}</span>
								{detail.institute_block && detail.institute_block !== '-' && (
									<span className="modal-block-tag">{detail.institute_block}</span>
								)}
							</div>
						)}

						{detail.remarks && detail.remarks !== '-' && (
							<div className="modal-section">
								<span className="modal-section-label">Remarks</span>
								<span>{detail.remarks}</span>
							</div>
						)}

						<div className="modal-faculty-row">
							<img
								src={detail.user_profile}
								alt={detail.user_name}
								className="activity-user-avatar"
								onError={(e) => { e.currentTarget.style.display = 'none' }}
							/>
							<div>
								<div className="activity-user-name">{detail.user_name}</div>
								<div className="activity-user-id">{detail.user_id}</div>
							</div>
						</div>

						{detail.survey?.length > 0 && (
							<div className="modal-surveys">
								<span className="modal-section-label">Surveys</span>
								{detail.survey.map((s) => (
									<div key={s.survey_id} className="modal-survey-item">
										<span>{s.survey_name}</span>
										<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
											<span className="modal-survey-count">{s.questions_count} Qs</span>
											<span
												className="activity-status-pill"
												style={s.completed
													? { background: 'rgba(79,199,144,0.12)', color: 'rgba(79,199,144,1)' }
													: { background: 'rgba(232,168,76,0.12)',  color: 'rgba(232,168,76,1)'  }
												}
											>
												{s.completed ? 'Done' : 'Pending'}
											</span>
										</div>
									</div>
								))}
							</div>
						)}

						{detail.sub_activities?.length > 0 && (
							<div className="modal-surveys">
								<span className="modal-section-label">Sub-activities</span>
								{detail.sub_activities.map((sa, i) => (
									<div key={i} className="modal-survey-item">
										<span>{sa.title ?? sa.name ?? JSON.stringify(sa)}</span>
									</div>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	)
}

// ─── Home Page ────────────────────────────────────────────────────────────────

function Home() {
	const [activities, setActivities] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [query, setQuery] = useState('')
	const [selectedId, setSelectedId] = useState(null)
	const activeRef = useRef(true)

	const loadActivities = async () => {
		setLoading(true)
		setError('')
		try {
			const response = await getPendingActions()
			if (!activeRef.current) return
			setActivities(Array.isArray(response.data) ? response.data : [])
		} catch (err) {
			if (!activeRef.current) return
			setActivities([])
			setError(err.message || 'Failed to load pending actions')
		} finally {
			if (activeRef.current) setLoading(false)
		}
	}

	useEffect(() => {
		activeRef.current = true
		loadActivities()
		return () => { activeRef.current = false }
	}, [])

	const formatDate = (d) => {
		if (!d) return '--'
		try { return new Date(d).toLocaleDateString() }
		catch { return d }
	}

	const initialsFromName = (name) => {
		if (!name) return 'U'
		return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
	}

	const filtered = activities.filter(a => {
		if (!query) return true
		const q = query.toLowerCase()
		return (a.title || '').toLowerCase().includes(q) || (a.user_name || '').toLowerCase().includes(q)
	})

	return (
		<main className="home-shell">
			<section className="home-card">
				<div className="home-content">
					<div className="home-hero-compact">
						<div className="home-hero-title">
							<h1>Pending Actions</h1>
							<span className="home-item-count">{activities.length} items</span>
						</div>
					</div>

					<div className="home-controls">
						<input
							aria-label="Search activities"
							placeholder="Search by title or assigned-by"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="home-search"
						/>
						<div className="home-controls-actions">
							<button className="btn btn-ghost" onClick={loadActivities}>Refresh</button>
						</div>
					</div>

					{error && <div className="home-message error">{error}</div>}

					{loading ? (
						<div className="home-feed-grid">
							{Array.from({ length: 6 }).map((_, i) => (
								<div key={i} className="home-skeleton-card">
									<div className="skeleton-line skeleton-avatar" />
									<div className="skeleton-line" style={{ width: '60%' }} />
									<div className="skeleton-line" style={{ width: '95%' }} />
									<div className="skeleton-line" style={{ width: '80%' }} />
									<div className="skeleton-line" style={{ width: '40%' }} />
								</div>
							))}
						</div>
					) : filtered.length === 0 ? (
						<div className="home-message">No pending actions were found.</div>
					) : (
						<div className="home-feed-grid">
							{filtered.map((activity) => {
								const responseCount = Array.isArray(activity.survey_responses)
									? activity.survey_responses.length : 0
								const actionTypeLabel = Array.isArray(activity.action_type) && activity.action_type.length > 0
									? activity.action_type.join(', ') : 'No action type'

								return (
									<article
										key={activity.id}
										className="home-feed-card compact"
										onClick={() => setSelectedId(activity.id)}
										style={{ cursor: 'pointer' }}
									>
										<div className="home-feed-card-header compact">
											<div className="home-avatar-wrap compact">
												<div className="home-initials">{initialsFromName(activity.user_name)}</div>
											</div>
											<div className="home-feed-title-block">
												<div className="home-feed-kicker">{activity.category || 'Activity'}</div>
												<h3>{activity.title || 'Untitled activity'}</h3>
												<p className="muted">{activity.description || 'No description provided.'}</p>
											</div>
										</div>

										<div className="home-feed-meta-grid">
											<div className="home-feed-meta-item">
												<span>Date</span>
												<strong>{formatDate(activity.from_date)} to {formatDate(activity.to_date)}</strong>
											</div>
											<div className="home-feed-meta-item">
												<span>Time</span>
												<strong>{activity.start_time || '--'} - {activity.end_time || '--'}</strong>
											</div>
											<div className="home-feed-meta-item">
												<span>Status</span>
												<strong>{activity.status || '--'}</strong>
											</div>
											<div className="home-feed-meta-item">
												<span>Assigned by</span>
												<strong>{activity.user_name || '--'}</strong>
											</div>
										</div>

										<div className="home-feed-tags compact">
											<span>{activity.user_type || 'Unknown'}</span>
											<span>{actionTypeLabel}</span>
											<span>Resp {responseCount}</span>
											<span>Score {activity.score_earned ?? 0}</span>
										</div>

										<div className="home-feed-footer compact">
											<span className="muted">ID {activity.id}</span>
										</div>
									</article>
								)
							})}
						</div>
					)}
				</div>
			</section>

			{selectedId !== null && (
				<ActivityDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
			)}
		</main>
	)
}

export default Home