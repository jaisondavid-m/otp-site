import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActivity, createActivity, formatImageUrl } from '../api/auth.js'

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


// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ item, navigate }) {
	const initials = getInitials(item.title)
	const { bg, color } = statusStyle(item.status)
	const duration = formatDuration(item.start_time, item.end_time)

	return (
		<div className="activity-card" onClick={() => navigate(`/activity/${item.id}`)} style={{ cursor: 'pointer' }}>
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
	const navigate = useNavigate()
	const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
	const [activities, setActivities] = useState([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')

	// Create Activity Modal State
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [creating, setCreating] = useState(false)
	const [toast, setToast] = useState(null)

	const INITIAL_FORM_STATE = {
		category_id: '',
		from_date: toDateInputValue(),
		to_date: toDateInputValue(),
		start_time: '',
		end_time: '',
		user_ids: '',
		users: [],
		description: '',
		is_package: false,
		is_single_activity: true,
		enable_activity_v2: false,
		repeat_enabled: false
	}

	const [form, setForm] = useState(INITIAL_FORM_STATE)

	const resetForm = () => setForm(INITIAL_FORM_STATE)

	const showToast = (message, type = 'error') => {
		setToast({ message, type })
		setTimeout(() => setToast(null), 4000)
	}

	const fetchActivities = async (date) => {
		setLoading(true)
		setError('')
		try {
			const res = await getActivity(date)
			setActivities(res.data ?? [])
		} catch (err) {
			setActivities([])
			setError(err.message || 'Failed to load activities')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchActivities(selectedDate)
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

	const handleAddUser = () => {
		setForm((prev) => ({
			...prev,
			users: [...prev.users, { id: '', name: '', role: 'participant' }]
		}))
	}

	const handleRemoveUser = (index) => {
		setForm((prev) => ({
			...prev,
			users: prev.users.filter((_, i) => i !== index)
		}))
	}

	const handleUserChange = (index, field, value) => {
		setForm((prev) => {
			const updatedUsers = [...prev.users]
			updatedUsers[index] = { ...updatedUsers[index], [field]: value }
			return { ...prev, users: updatedUsers }
		})
	}

	const handleCreateSubmit = async (e) => {
		e.preventDefault()
		setCreating(true)
		try {
			const userIdsArr = form.user_ids
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)

			const payload = {
				category_id: Number(form.category_id),
				from_date: form.from_date,
				to_date: form.to_date,
				start_time: form.start_time,
				end_time: form.end_time,
				user_ids: userIdsArr,
				users: form.users,
				user: form.users,
				is_package: form.is_package,
				description: form.description,
				repeat: form.repeat_enabled
					? {
							enabled: true,
							repeat_type: 'daily',
							repeat_interval: 1,
							include_sunday: false,
							week_days: [],
							month_day: 0,
							custom_dates: [],
							repeat_end_date: form.to_date,
							occurrence_count: 1
					  }
					: { enabled: false },
				is_single_activity: form.is_single_activity
			}

			const res = await createActivity(payload, form.enable_activity_v2)
			if (res.status || res.success) {
				showToast(res.message || 'Activity created successfully!', 'success')
				setShowCreateModal(false)
				fetchActivities(selectedDate)
			} else {
				showToast(res.message || res.error || 'Failed to create activity', 'error')
			}
		} catch (err) {
			showToast(err.message || 'Failed to create activity', 'error')
		} finally {
			setCreating(false)
		}
	}

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
						<button
							type="button"
							className="ad-primary-btn"
							style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff' }}
							onClick={() => {
								resetForm()
								setShowCreateModal(true)
							}}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Create Activity
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
									<ActivityCard key={item.id} item={item} navigate={navigate} />
								))}
							</div>
						) : (
							<div className="activity-empty-state">No activity data available for {selectedDate}.</div>
						)}
					</div>

				</div>
			</section>

			{/* Create Activity Modal */}
			{showCreateModal && (
				<div className="cam-overlay" onClick={() => setShowCreateModal(false)}>
					<div className="cam-modal" onClick={(e) => e.stopPropagation()}>
						{/* Header */}
						<div className="cam-header">
							<div className="cam-header-info">
								<div className="cam-header-icon">
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
										<line x1="16" y1="2" x2="16" y2="6" />
										<line x1="8" y1="2" x2="8" y2="6" />
										<line x1="3" y1="10" x2="21" y2="10" />
										<line x1="12" y1="14" x2="12" y2="18" />
										<line x1="10" y1="16" x2="14" y2="16" />
									</svg>
								</div>
								<div className="cam-header-text">
									<h3>Create Activity</h3>
									<p>Fill out activity parameters to post session</p>
								</div>
							</div>
							<button className="cam-close-btn" onClick={() => setShowCreateModal(false)} type="button" aria-label="Close">
								✕
							</button>
						</div>

						{/* Form */}
						<form onSubmit={handleCreateSubmit} style={{ display: 'contents' }}>
							<div className="cam-body">

								{/* Basic Info Section */}
								<div className="cam-section">
									<div className="cam-section-title">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
										General Info
									</div>
									<div className="cam-grid-2">
										<div className="cam-field">
											<label className="cam-label">
												Category ID <span style={{ color: 'var(--red)' }}>*</span>
											</label>
											<input
												type="number"
												placeholder="e.g. 4112"
												value={form.category_id}
												onChange={(e) => setForm({ ...form, category_id: e.target.value })}
												required
												className="cam-input cam-input-mono"
											/>
										</div>
										<div className="cam-field">
											<label className="cam-label">
												Description <span style={{ color: 'var(--red)' }}>*</span>
											</label>
											<input
												type="text"
												placeholder="e.g. Operating Systems Lab Session"
												value={form.description}
												onChange={(e) => setForm({ ...form, description: e.target.value })}
												required
												className="cam-input"
											/>
										</div>
									</div>
								</div>

								{/* Schedule Section */}
								<div className="cam-section">
									<div className="cam-section-title">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
										Schedule & Timing
									</div>
									<div className="cam-grid-2">
										<div className="cam-field">
											<label className="cam-label">From Date</label>
											<input
												type="date"
												value={form.from_date}
												onChange={(e) => setForm({ ...form, from_date: e.target.value })}
												required
												className="cam-input"
											/>
										</div>
										<div className="cam-field">
											<label className="cam-label">To Date</label>
											<input
												type="date"
												value={form.to_date}
												onChange={(e) => setForm({ ...form, to_date: e.target.value })}
												required
												className="cam-input"
											/>
										</div>
									</div>

									<div className="cam-grid-2">
										<div className="cam-field">
											<label className="cam-label">
												Start Time <span className="cam-label-sub">(HH:MM:SS)</span>
											</label>
											<input
												type="text"
												placeholder="e.g. 08:45:00"
												value={form.start_time}
												onChange={(e) => setForm({ ...form, start_time: e.target.value })}
												required
												className="cam-input cam-input-mono"
											/>
										</div>
										<div className="cam-field">
											<label className="cam-label">
												End Time <span className="cam-label-sub">(HH:MM:SS)</span>
											</label>
											<input
												type="text"
												placeholder="e.g. 16:25:00"
												value={form.end_time}
												onChange={(e) => setForm({ ...form, end_time: e.target.value })}
												required
												className="cam-input cam-input-mono"
											/>
										</div>
									</div>
								</div>

								{/* Users Section */}
								<div className="cam-section">
									<div className="cam-section-title">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
										Participants & User IDs
									</div>

									<div className="cam-field">
										<label className="cam-label">
											User IDs <span className="cam-label-sub">Comma separated string array</span>
										</label>
										<input
											type="text"
											placeholder="e.g. 2025UCS1023, 2025UCS1022"
											value={form.user_ids}
											onChange={(e) => setForm({ ...form, user_ids: e.target.value })}
											className="cam-input cam-input-mono"
										/>
									</div>

									<div className="cam-field">
										<div className="cam-users-header">
											<label className="cam-label">
												Users Array ({form.users.length})
											</label>
											<button
												type="button"
												className="cam-add-user-btn"
												onClick={handleAddUser}
											>
												+ Add User
											</button>
										</div>

										{form.users.length === 0 ? (
											<div className="cam-empty-users">
												No user objects added. Click <strong>+ Add User</strong> above to specify user details.
											</div>
										) : (
											<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
												{form.users.map((u, idx) => (
													<div key={idx} className="cam-user-row">
														<input
															type="text"
															placeholder="User ID"
															value={u.id}
															onChange={(e) => handleUserChange(idx, 'id', e.target.value)}
															className="cam-input cam-input-mono"
														/>
														<input
															type="text"
															placeholder="Full Name"
															value={u.name}
															onChange={(e) => handleUserChange(idx, 'name', e.target.value)}
															className="cam-input"
														/>
														<input
															type="text"
															placeholder="Role"
															value={u.role}
															onChange={(e) => handleUserChange(idx, 'role', e.target.value)}
															className="cam-input"
														/>
														<button
															type="button"
															className="cam-remove-user-btn"
															onClick={() => handleRemoveUser(idx)}
															title="Remove user"
														>
															✕
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>

								{/* Options Section */}
								<div className="cam-section">
									<div className="cam-section-title">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
										Activity Options
									</div>
									<div className="cam-checkbox-group">
										<label className={`cam-checkbox-chip ${form.is_single_activity ? 'active' : ''}`}>
											<input
												type="checkbox"
												checked={form.is_single_activity}
												onChange={(e) => setForm({ ...form, is_single_activity: e.target.checked })}
											/>
											Single Activity
										</label>

										<label className={`cam-checkbox-chip ${form.enable_activity_v2 ? 'active' : ''}`}>
											<input
												type="checkbox"
												checked={form.enable_activity_v2}
												onChange={(e) => setForm({ ...form, enable_activity_v2: e.target.checked })}
											/>
											Enable Activity V2
										</label>

										<label className={`cam-checkbox-chip ${form.is_package ? 'active' : ''}`}>
											<input
												type="checkbox"
												checked={form.is_package}
												onChange={(e) => setForm({ ...form, is_package: e.target.checked })}
											/>
											Is Package
										</label>
									</div>
								</div>

							</div>

							{/* Footer */}
							<div className="cam-footer">
								<button
									type="button"
									className="cam-btn-secondary"
									onClick={() => setShowCreateModal(false)}
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={creating}
									className="cam-btn-primary"
								>
									{creating ? (
										<>
											<span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
											Creating...
										</>
									) : (
										'Create Activity'
									)}
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

export default Activity