import { useEffect, useState, useRef, useMemo } from 'react'
import { getProfile } from '../api/auth.js'
import { useNavigate } from 'react-router-dom'

function getTimeOfDayIcon(timeStr) {
	if (!timeStr) return '🕒'
	const hour = parseInt(timeStr.split(':')[0], 10)
	if (isNaN(hour)) return '🕒'
	if (hour >= 5 && hour < 12) return '🌅 Morning'
	if (hour >= 12 && hour < 17) return '☀️ Afternoon'
	if (hour >= 17 && hour < 21) return '🌆 Evening'
	return '🌙 Night'
}

function Biometric() {
	const navigate = useNavigate()
	const [profile, setProfile] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedDate, setSelectedDate] = useState('')
	const [sortOrder, setSortOrder] = useState('desc') // 'desc' or 'asc'
	const activeRef = useRef(true)

	const loadProfile = async () => {
		setLoading(true)
		setError('')

		try {
			const response = await getProfile()
			if (!activeRef.current) return

			if (response.data) {
				setProfile(response.data)
			} else {
				setError('No profile data available')
			}
		} catch (err) {
			if (!activeRef.current) return
			setProfile(null)
			setError(err.message || 'Failed to load biometric details')
		} finally {
			if (activeRef.current) setLoading(false)
		}
	}

	useEffect(() => {
		activeRef.current = true
		loadProfile()
		return () => {
			activeRef.current = false
		}
	}, [])

	const handleRefresh = () => {
		loadProfile()
	}

	const logs = useMemo(() => {
		return profile?.biometric || []
	}, [profile])

	// Extract unique dates for filtering
	const uniqueDates = useMemo(() => {
		const dates = logs.map(log => log.date).filter(Boolean)
		return Array.from(new Set(dates)).sort((a, b) => new Date(b) - new Date(a))
	}, [logs])

	// Filter logs
	const filteredLogs = useMemo(() => {
		return logs.filter(log => {
			const deviceName = log.device_name || ''
			const matchesSearch = deviceName.toLowerCase().includes(searchTerm.toLowerCase())
			const matchesDate = selectedDate ? log.date === selectedDate : true
			return matchesSearch && matchesDate
		})
	}, [logs, searchTerm, selectedDate])

	// Sort logs
	const sortedLogs = useMemo(() => {
		return [...filteredLogs].sort((a, b) => {
			const dateTimeA = new Date(`${a.date}T${a.time}`)
			const dateTimeB = new Date(`${b.date}T${b.time}`)
			return sortOrder === 'desc' ? dateTimeB - dateTimeA : dateTimeA - dateTimeB
		})
	}, [filteredLogs, sortOrder])

	// Stats
	const stats = useMemo(() => {
		const total = logs.length
		const uniqueDevices = new Set(logs.map(log => log.device_name).filter(Boolean)).size
		
		let latest = null
		if (logs.length > 0) {
			// Find the one with most recent date & time
			const sortedAll = [...logs].sort((a, b) => {
				return new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`)
			})
			latest = sortedAll[0]
		}

		return { total, uniqueDevices, latest }
	}, [logs])

	if (loading) {
		return (
			<main className="biometric-shell">
				<section className="biometric-page-card">
					<div className="biometric-page-content">
						<div className="biometric-page-header">
							<div className="biometric-badge">Biometrics</div>
						</div>
						<div className="profile-loading-state">
							<div className="spinner" />
							<p>Loading biometric logs...</p>
						</div>
					</div>
				</section>
			</main>
		)
	}

	if (error) {
		return (
			<main className="biometric-shell">
				<section className="biometric-page-card">
					<div className="biometric-page-content">
						<div className="biometric-page-header">
							<div className="biometric-badge">Biometrics</div>
						</div>
						<div className="profile-error-state">
							<p className="profile-error-message">{error}</p>
							<button className="profile-retry-btn" onClick={handleRefresh}>
								Retry
							</button>
						</div>
					</div>
				</section>
			</main>
		)
	}

	return (
		<main className="biometric-shell">
			<section className="biometric-page-card">
				<div className="biometric-page-content">
					<div className="biometric-page-header">
						<div className="biometric-badge">Biometrics</div>
						<div className="biometric-header-actions">
							<button className="biometric-back-btn" onClick={() => navigate('/profile')}>
								Back to Profile
							</button>
							<button className="profile-refresh-btn" onClick={handleRefresh} title="Refresh biometric data">
								↻
							</button>
						</div>
					</div>

					{/* Stats Grid */}
					<div className="biometric-stats-grid">
						<div className="biometric-stat-card">
							<h3 className="stat-label">TOTAL LOGS</h3>
							<p className="stat-value">{stats.total}</p>
							<span className="stat-desc">Overall check-ins recorded</span>
						</div>
						<div className="biometric-stat-card">
							<h3 className="stat-label">ACTIVE DEVICES</h3>
							<p className="stat-value">{stats.uniqueDevices}</p>
							<span className="stat-desc">Distinct biometric devices used</span>
						</div>
						<div className="biometric-stat-card full-on-mobile">
							<h3 className="stat-label">LATEST CHECK-IN</h3>
							{stats.latest ? (
								<>
									<p className="stat-value text-accent">{stats.latest.device_name}</p>
									<span className="stat-desc">
										{stats.latest.date} at {stats.latest.time}
									</span>
								</>
							) : (
								<>
									<p className="stat-value">--</p>
									<span className="stat-desc">No logs available</span>
								</>
							)}
						</div>
					</div>

					{/* Filters Section */}
					<div className="biometric-controls-card">
						<div className="biometric-filters">
							<div className="filter-group search">
								<label htmlFor="device-search">Search Device</label>
								<input
									id="device-search"
									type="text"
									placeholder="e.g. RUBY, HKV..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="biometric-input"
								/>
							</div>

							<div className="filter-group select">
								<label htmlFor="date-filter">Filter by Date</label>
								<select
									id="date-filter"
									value={selectedDate}
									onChange={(e) => setSelectedDate(e.target.value)}
									className="biometric-select"
								>
									<option value="">All Dates</option>
									{uniqueDates.map(date => (
										<option key={date} value={date}>
											{date}
										</option>
									))}
								</select>
							</div>

							<div className="filter-group sort">
								<label>Order By Time</label>
								<button
									type="button"
									className="biometric-sort-btn"
									onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
								>
									{sortOrder === 'desc' ? 'Newest First ↓' : 'Oldest First ↑'}
								</button>
							</div>
						</div>
					</div>

					{/* Log List */}
					<div className="biometric-log-panel">
						<div className="biometric-log-header">
							<h2>Biometric Access Log</h2>
							<span>Showing {sortedLogs.length} of {logs.length} entries</span>
						</div>

						{sortedLogs.length > 0 ? (
							<div className="biometric-log-list">
								{sortedLogs.map((entry, index) => (
									<div key={`${entry.device_name}-${entry.date}-${entry.time}-${index}`} className="biometric-log-item">
										<div className="biometric-log-device">
											<div className="biometric-device-badge">
												{entry.device_name || 'Unknown Device'}
											</div>
										</div>
										<div className="biometric-log-datetime">
											<div className="biometric-date">{entry.date}</div>
											<div className="biometric-time">
												{entry.time}
											</div>
										</div>
										<div className="biometric-log-timeofday">
											<span className="time-of-day-pill">
												{getTimeOfDayIcon(entry.time)}
											</span>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="biometric-empty-state">
								<p>No biometric records match your filter criteria.</p>
								{(searchTerm || selectedDate) && (
									<button 
										className="biometric-reset-btn"
										onClick={() => {
											setSearchTerm('')
											setSelectedDate('')
										}}
									>
										Clear Filters
									</button>
								)}
							</div>
						)}
					</div>
				</div>
			</section>
		</main>
	)
}

export default Biometric
