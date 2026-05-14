import { useEffect, useState, useRef } from 'react'
import { getPendingActions } from '../api/auth.js'

function Home() {
	const [activities, setActivities] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [query, setQuery] = useState('')
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
		return () => {
			activeRef.current = false
		}
	}, [])

	const handleRefresh = () => {
		loadActivities()
	}

	const handleMarkDone = (id) => {
		setActivities((prev) => prev.map(a => a.id === id ? { ...a, status: 'Done' } : a))
	}

	const formatDate = (d) => {
		if (!d) return '--'
		try {
			return new Date(d).toLocaleDateString()
		} catch {
			return d
		}
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
							<button className="btn btn-ghost" onClick={handleRefresh}>Refresh</button>
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
								const responseCount = Array.isArray(activity.survey_responses) ? activity.survey_responses.length : 0
								const actionTypeLabel = Array.isArray(activity.action_type) && activity.action_type.length > 0
									? activity.action_type.join(', ')
									: 'No action type'

								return (
									<article key={activity.id} className="home-feed-card compact">
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
		</main>
	)
}

export default Home
