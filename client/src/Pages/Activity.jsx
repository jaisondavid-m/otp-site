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

	const [form, setForm] = useState({
		category_id: 4112,
		from_date: toDateInputValue(),
		to_date: toDateInputValue(),
		start_time: '08:45:00',
		end_time: '16:25:00',
		user_ids: '2025UCS1023',
		users: [
			{ id: '2025UCS1023', name: 'jaison david m', role: 'participant' },
			{ id: '2025UCS1022', name: 'jagaprasanth p', role: 'participant' }
		],
		description: 'testing session',
		is_package: false,
		is_single_activity: true,
		enable_activity_v2: false,
		repeat_enabled: false
	})

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
							onClick={() => setShowCreateModal(true)}
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
				<div className="ad-modal-overlay" onClick={() => setShowCreateModal(false)}>
					<div className="ad-modal-content" style={{ maxWidth: '580px', textAlign: 'left', alignItems: 'stretch', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
						<button className="ad-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>

						<div className="ad-modal-header" style={{ textAlign: 'center', marginBottom: '14px' }}>
							<h3>Create Activity</h3>
							<p>Fill out activity payload parameters to post session</p>
						</div>

						<form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Category ID</label>
									<input
										type="number"
										value={form.category_id}
										onChange={(e) => setForm({ ...form, category_id: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none' }}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Description</label>
									<input
										type="text"
										value={form.description}
										onChange={(e) => setForm({ ...form, description: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none' }}
									/>
								</div>
							</div>

							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>From Date</label>
									<input
										type="date"
										value={form.from_date}
										onChange={(e) => setForm({ ...form, from_date: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none' }}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>To Date</label>
									<input
										type="date"
										value={form.to_date}
										onChange={(e) => setForm({ ...form, to_date: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none' }}
									/>
								</div>
							</div>

							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Start Time</label>
									<input
										type="text"
										placeholder="08:45:00"
										value={form.start_time}
										onChange={(e) => setForm({ ...form, start_time: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>End Time</label>
									<input
										type="text"
										placeholder="16:25:00"
										value={form.end_time}
										onChange={(e) => setForm({ ...form, end_time: e.target.value })}
										required
										style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
									/>
								</div>
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
								<label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>User IDs (comma separated string array)</label>
								<input
									type="text"
									placeholder="2025UCS1023"
									value={form.user_ids}
									onChange={(e) => setForm({ ...form, user_ids: e.target.value })}
									required
									style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
								/>
							</div>

							{/* Users List */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									<label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Users Array ({form.users.length})</label>
									<button
										type="button"
										onClick={handleAddUser}
										style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: '4px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
									>
										+ Add User
									</button>
								</div>
								{form.users.map((u, idx) => (
									<div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
										<input
											type="text"
											placeholder="User ID"
											value={u.id}
											onChange={(e) => handleUserChange(idx, 'id', e.target.value)}
											style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
										/>
										<input
											type="text"
											placeholder="Name"
											value={u.name}
											onChange={(e) => handleUserChange(idx, 'name', e.target.value)}
											style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
										/>
										<input
											type="text"
											placeholder="Role"
											value={u.role}
											onChange={(e) => handleUserChange(idx, 'role', e.target.value)}
											style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
										/>
										<button
											type="button"
											onClick={() => handleRemoveUser(idx)}
											style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'none', borderRadius: '50%', width: '26px', height: '26px', fontSize: '12px', cursor: 'pointer' }}
										>
											✕
										</button>
									</div>
								))}
							</div>

							<div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
								<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
									<input
										type="checkbox"
										checked={form.enable_activity_v2}
										onChange={(e) => setForm({ ...form, enable_activity_v2: e.target.checked })}
									/>
									Enable Activity V2
								</label>
								<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
									<input
										type="checkbox"
										checked={form.is_single_activity}
										onChange={(e) => setForm({ ...form, is_single_activity: e.target.checked })}
									/>
									Single Activity
								</label>
								<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
									<input
										type="checkbox"
										checked={form.is_package}
										onChange={(e) => setForm({ ...form, is_package: e.target.checked })}
									/>
									Is Package
								</label>
							</div>

							<div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
								<button
									type="button"
									onClick={() => setShowCreateModal(false)}
									style={{ flex: 1, background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px', fontWeight: '600', cursor: 'pointer' }}
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={creating}
									style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontWeight: '600', cursor: 'pointer', opacity: creating ? 0.7 : 1 }}
								>
									{creating ? 'Creating...' : 'Create Activity'}
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