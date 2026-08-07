import { useEffect, useState, useMemo } from 'react'
import { getActivity, getActivityDetails, formatImageUrl } from '../api/auth.js'

function toDateInputValue(date = new Date()) {
	const offset = date.getTimezoneOffset() * 60 * 1000
	return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatTime(timeStr) {
	if (!timeStr) return '--'
	const [h, m] = timeStr.split(':')
	const hour = parseInt(h, 10)
	const ampm = hour >= 12 ? 'PM' : 'AM'
	const display = hour % 12 || 12
	return `${display}:${m} ${ampm}`
}

function formatDuration(start, end) {
	if (!start || !end) return ''
	const [sh, sm] = start.split(':').map(Number)
	const [eh, em] = end.split(':').map(Number)
	const mins = (eh * 60 + em) - (sh * 60 + sm)
	if (mins <= 0) return ''
	const h = Math.floor(mins / 60)
	const m = mins % 60
	if (h === 0) return `${m}m`
	return m === 0 ? `${h}h` : `${h}h ${m}m`
}

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

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ActivityDetailModal({ id, onClose }) {
	const [detail, setDetail] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	// Lock body scroll while open
	useEffect(() => {
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = '' }
	}, [])

	// Close on Escape
	useEffect(() => {
		const handler = (e) => { if (e.key === 'Escape') onClose() }
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [onClose])

	// Fetch details
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
						{/* Header */}
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

						{/* Date + Time */}
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

						{/* Venue */}
						{detail.institute_venue && detail.institute_venue !== '-' && (
							<div className="modal-section">
								<span className="modal-section-label">Venue</span>
								<span>{detail.institute_venue}</span>
								{detail.institute_block && detail.institute_block !== '-' && (
									<span className="modal-block-tag">{detail.institute_block}</span>
								)}
							</div>
						)}

						{/* Remarks */}
						{detail.remarks && detail.remarks !== '-' && (
							<div className="modal-section">
								<span className="modal-section-label">Remarks</span>
								<span>{detail.remarks}</span>
							</div>
						)}

						{/* Faculty */}
						<div className="modal-faculty-row">
							<img
								src={formatImageUrl(detail.user_profile, detail.user_id)}
								alt={detail.user_name}
								className="activity-user-avatar"
								onError={(e) => { e.currentTarget.style.display = 'none' }}
							/>
							<div>
								<div className="activity-user-name">{detail.user_name}</div>
								<div className="activity-user-id">{detail.user_id}</div>
							</div>
						</div>

						{/* Surveys */}
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

						{/* Sub-activities */}
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

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ item, onSelect }) {
	const initials = getInitials(item.title)
	const { bg, color } = statusStyle(item.status)
	const duration = formatDuration(item.start_time, item.end_time)

	return (
		<div className="activity-card" onClick={() => onSelect(item.id)} style={{ cursor: 'pointer' }}>
			<div className="activity-card-header">
				<div
					className="activity-initials"
					style={{ background: 'rgba(79,199,144,0.1)', borderColor: 'rgba(79,199,144,0.3)', color: 'var(--accent)' }}
				>
					{initials}
				</div>
				<div className="activity-card-title-block">
					<div className="activity-card-kicker">{item.category}</div>
					<h3>{item.title}</h3>
					{item.description && item.description !== item.title && (
						<p className="activity-card-desc">{item.description}</p>
					)}
				</div>
				<div className="activity-status-pill" style={{ background: bg, color }}>
					{item.status}
				</div>
			</div>

			<div className="activity-card-meta">
				<div className="activity-meta-item">
					<span>Start</span>
					<strong>{formatTime(item.start_time)}</strong>
				</div>
				<div className="activity-meta-item">
					<span>End</span>
					<strong>{formatTime(item.end_time)}</strong>
				</div>
				{duration && (
					<div className="activity-meta-item">
						<span>Duration</span>
						<strong>{duration}</strong>
					</div>
				)}
				<div className="activity-meta-item">
					<span>Score</span>
					<strong>{item.score_earned ?? 0}</strong>
				</div>
			</div>

			<div className="activity-card-footer">
				<div className="activity-user">
					<img
						src={formatImageUrl(item.user_profile, item.user_id)}
						alt={item.user_name}
						className="activity-user-avatar"
						onError={(e) => { e.currentTarget.style.display = 'none' }}
					/>
					<span className="activity-user-name">{item.user_name}</span>
				</div>
				<span className="activity-user-id">{item.user_id}</span>
			</div>
		</div>
	)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Activity() {
	const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
	const [activities, setActivities] = useState([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [selectedId, setSelectedId] = useState(null)

	useEffect(() => {
		let active = true
		const load = async () => {
			setLoading(true)
			setError('')
			try {
				const res = await getActivity(selectedDate)
				if (active) setActivities(res.data ?? [])
			} catch (err) {
				if (active) {
					setActivities([])
					setError(err.message || 'Failed to load activities')
				}
			} finally {
				if (active) setLoading(false)
			}
		}
		load()
		return () => { active = false }
	}, [selectedDate])

	const stats = useMemo(() => {
		const total = activities.length
		const approved = activities.filter((a) => a.status === 'Approved').length
		const active = activities.filter((a) => a.status === 'Active').length
		const categories = [...new Set(activities.map((a) => a.category))].length
		return { total, approved, active, categories }
	}, [activities])

	const summaryCards = [
		{ label: 'Total',    value: loading ? '--' : stats.total,      description: 'Activities today'   },
		{ label: 'Approved', value: loading ? '--' : stats.approved,   description: 'Confirmed sessions' },
		{ label: 'Active',   value: loading ? '--' : stats.active,     description: 'Ongoing sessions'   },
		{ label: 'Subjects', value: loading ? '--' : stats.categories, description: 'Unique categories'  },
	]

	return (
		<main className="activity-shell">
			<section className="activity-page-card">
				<div className="activity-page-content">

					<div className="activity-page-header">
						<div className="activity-badge">Activity</div>
					</div>

					<div className="activity-controls">
						<label className="activity-date-field">
							<span>Select date</span>
							<input
								type="date"
								value={selectedDate}
								onChange={(e) => setSelectedDate(e.target.value)}
							/>
						</label>
						<button
							type="button"
							className="activity-today-btn"
							onClick={() => setSelectedDate(toDateInputValue())}
						>
							Today
						</button>
					</div>

					{error && <div className="activity-message error">{error}</div>}

					<div className="activity-summary-grid">
						{summaryCards.map((card) => (
							<div key={card.label} className="activity-summary-card">
								<div className="activity-summary-label">{card.label}</div>
								<div className="activity-summary-value">{card.value}</div>
								<div className="activity-summary-description">{card.description}</div>
							</div>
						))}
					</div>

					<div className="activity-log-panel">
						<div className="activity-log-header">
							<h2>Schedule</h2>
							<span>{loading ? 'Loading…' : `${activities.length} entries`}</span>
						</div>

						{loading ? (
							<div className="activity-empty-state">Loading activities for {selectedDate}…</div>
						) : activities.length > 0 ? (
							<div className="activity-list">
								{activities.map((item) => (
									<ActivityCard key={item.id} item={item} onSelect={setSelectedId} />
								))}
							</div>
						) : (
							<div className="activity-empty-state">No activity data available for {selectedDate}.</div>
						)}
					</div>

				</div>
			</section>

			{selectedId !== null && (
				<ActivityDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
			)}
		</main>
	)
}

export default Activity