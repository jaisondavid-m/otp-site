import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingActionsV2, acceptPendingAction, formatImageUrl } from '../api/auth.js'

function toDateInputValue(date = new Date()) {
	const offset = date.getTimezoneOffset() * 60 * 1000
	return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function PendingActions() {
	const navigate = useNavigate()
	const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [activeTab, setActiveTab] = useState('inbox')
	const [acceptingMap, setAcceptingMap] = useState({})
	const [toast, setToast] = useState(null)

	const showToast = (message, type = 'error') => {
		setToast({ message, type })
		setTimeout(() => setToast(null), 4000)
	}

	const fetchPendingData = async (date) => {
		setLoading(true)
		setError('')
		try {
			const res = await getPendingActionsV2(date)
			setData(res.data ?? null)
		} catch (err) {
			setData(null)
			setError(err.message || 'Failed to load pending actions')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchPendingData(selectedDate)
	}, [selectedDate])

	const handleAccept = async (activityId) => {
		setAcceptingMap((prev) => ({ ...prev, [activityId]: true }))
		try {
			const res = await acceptPendingAction(activityId)
			if (res.status || res.success) {
				showToast(res.message || 'Activity accepted successfully!', 'success')
				fetchPendingData(selectedDate)
			} else {
				showToast(res.message || 'Failed to accept activity', 'error')
			}
		} catch (err) {
			showToast(err.message || 'Failed to accept activity', 'error')
		} finally {
			setAcceptingMap((prev) => ({ ...prev, [activityId]: false }))
		}
	}

	const inboxList = data?.inbox ?? []
	const floatingList = data?.floating_activity ?? []
	const todayList = data?.today ?? []
	const timelineSessions = data?.timeline_sessions ?? []

	const currentList = useMemo(() => {
		if (activeTab === 'inbox') return inboxList
		if (activeTab === 'floating') return floatingList
		if (activeTab === 'today') return todayList
		return []
	}, [activeTab, inboxList, floatingList, todayList])

	return (
		<main className="activity-shell">
			<section className="activity-page-card">
				<div className="activity-page-content">

					{/* Header */}
					<div className="activity-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
							<div className="activity-badge" style={{ background: 'rgba(125,83,246,0.15)', color: '#7D53F6' }}>
								Pending Actions
							</div>
							<span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
								Manage assigned & floating activities
							</span>
						</div>
					</div>

					{/* Controls & Date Filter */}
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
							style={{ marginLeft: 'auto', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1.5px solid var(--border)' }}
							onClick={() => fetchPendingData(selectedDate)}
							disabled={loading}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
							</svg>
							{loading ? 'Refreshing…' : 'Refresh'}
						</button>
					</div>

					{error && <div className="activity-message error">{error}</div>}

					{/* Tabs */}
					<div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginTop: '16px', overflowX: 'auto' }}>
						<button
							className={`navbar-link${activeTab === 'inbox' ? ' active' : ''}`}
							onClick={() => setActiveTab('inbox')}
							style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
						>
							Inbox
							<span style={{ background: 'rgba(245, 167, 66, 0.2)', color: '#f5a742', padding: '2px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
								{inboxList.length}
							</span>
						</button>
						<button
							className={`navbar-link${activeTab === 'floating' ? ' active' : ''}`}
							onClick={() => setActiveTab('floating')}
							style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
						>
							Floating
							<span style={{ background: 'rgba(125, 83, 246, 0.2)', color: '#7D53F6', padding: '2px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
								{floatingList.length}
							</span>
						</button>
						<button
							className={`navbar-link${activeTab === 'today' ? ' active' : ''}`}
							onClick={() => setActiveTab('today')}
							style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
						>
							Today
							<span style={{ background: 'rgba(79, 199, 144, 0.2)', color: '#4fc790', padding: '2px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
								{todayList.length}
							</span>
						</button>
						<button
							className={`navbar-link${activeTab === 'timeline' ? ' active' : ''}`}
							onClick={() => setActiveTab('timeline')}
							style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
						>
							Sessions ({timelineSessions.length})
						</button>
					</div>

					{/* Timeline Sessions Tab Content */}
					{activeTab === 'timeline' && (
						<div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
							{timelineSessions.map((s) => (
								<div key={s.id} style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '700' }}>Session #{s.id} ({s.session})</span>
									<strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{s.label}</strong>
									<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.start_time} - {s.end_time}</span>
								</div>
							))}
						</div>
					)}

					{/* Main List */}
					{activeTab !== 'timeline' && (
						<div className="activity-log-panel" style={{ marginTop: '20px' }}>
							{loading ? (
								<div className="activity-empty-state">Loading pending actions…</div>
							) : currentList.length > 0 ? (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
									{currentList.map((item) => {
										const isAccepting = !!acceptingMap[item.id]
										const canAccept = item.status === 'Pending Acceptance' || (item.action_type && item.action_type.includes('accept'))

										return (
											<div key={item.id} className="activity-card" style={{ cursor: 'default' }}>
												<div className="activity-card-header">
													<div className="activity-initials" style={{ background: 'rgba(125,83,246,0.1)', borderColor: 'rgba(125,83,246,0.3)', color: '#7D53F6' }}>
														{item.title?.slice(0, 2).toUpperCase() || 'PA'}
													</div>
													<div className="activity-card-title-block">
														<div className="activity-card-kicker">{item.category}</div>
														<h3>{item.title}</h3>
														{item.description && (
															<p className="activity-card-desc">{item.description}</p>
														)}
													</div>
													<div
														className="activity-status-pill"
														style={{
															background: item.status_color ? `${item.status_color}22` : 'rgba(140,146,160,0.12)',
															color: item.status_color || 'var(--text-primary)',
															border: `1px solid ${item.status_color || 'var(--border)'}44`
														}}
													>
														{item.status}
													</div>
												</div>

												<div className="activity-card-meta">
													<div className="activity-meta-item">
														<span>Time</span>
														<strong>{item.start_time} - {item.end_time}</strong>
													</div>
													<div className="activity-meta-item">
														<span>Dates</span>
														<strong>{item.from_date} {item.to_date && item.to_date !== item.from_date ? `→ ${item.to_date}` : ''}</strong>
													</div>
													{item.overdue_on && (
														<div className="activity-meta-item">
															<span>Overdue</span>
															<strong style={{ color: '#f87171' }}>{item.overdue_on}</strong>
														</div>
													)}
													<div className="activity-meta-item">
														<span>ID</span>
														<strong>#{item.id}</strong>
													</div>
												</div>

												{/* Footer & Actions */}
												<div className="activity-card-footer" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
													<div className="activity-user">
														<img
															src={formatImageUrl(item.user_profile, item.user_id)}
															alt={item.user_name}
															className="activity-user-avatar"
															onError={(e) => { e.currentTarget.style.display = 'none' }}
														/>
														<div style={{ display: 'flex', flexDirection: 'column' }}>
															<span className="activity-user-name">{item.user_name}</span>
															<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.user_type} ({item.user_id})</span>
														</div>
													</div>

													<div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
														{canAccept && (
															<button
																type="button"
																className="ad-primary-btn"
																style={{ background: 'rgba(79, 199, 144, 0.2)', color: '#4fc790', border: '1.5px solid rgba(79, 199, 144, 0.4)', padding: '6px 16px', fontSize: '13px' }}
																onClick={() => handleAccept(item.id)}
																disabled={isAccepting}
															>
																<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
																	<polyline points="20 6 9 17 4 12" />
																</svg>
																{isAccepting ? 'Accepting...' : 'Accept Activity'}
															</button>
														)}

														<button
															type="button"
															className="ad-primary-btn"
															style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '6px 12px', fontSize: '12px' }}
															onClick={() => navigate(`/activity/${item.id}`)}
														>
															View Details
														</button>
													</div>
												</div>
											</div>
										)
									})}
								</div>
							) : (
								<div className="activity-empty-state">No pending actions found in this tab.</div>
							)}
						</div>
					)}

				</div>
			</section>

			{toast && (
				<div className={`ad-toast ad-toast-${toast.type}`}>
					<span>{toast.type === 'success' ? '✓' : '⚠'}</span>
					<p>{toast.message}</p>
				</div>
			)}
		</main>
	)
}

export default PendingActions
