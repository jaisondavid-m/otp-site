import { useEffect, useMemo, useState } from 'react'
import { getAttendance } from '../api/auth.js'

function toDateInputValue(date = new Date()) {
	const offset = date.getTimezoneOffset() * 60 * 1000
	return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatSessionLabel(session) {
	if (!session) return 'Unknown session'
	return session
}

function Attendance() {
	const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
	const [attendance, setAttendance] = useState(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		let active = true

		const loadAttendance = async () => {
			setLoading(true)
			setError('')

			try {
				const response = await getAttendance(selectedDate)
				if (active) {
					setAttendance(response.data ?? null)
				}
			} catch (err) {
				if (active) {
					setAttendance(null)
					setError(err.message || 'Failed to load attendance')
				}
			} finally {
				if (active) {
					setLoading(false)
				}
			}
		}

		loadAttendance()

		return () => {
			active = false
		}
	}, [selectedDate])

	const logEntries = attendance?.attendance_log ?? []
	const summaryCards = useMemo(
		() => [
			{
				label: 'Attendance %',
				value: attendance?.percentage != null ? `${attendance.percentage}%` : '--',
				description: 'Overall attendance rate',
			},
			{
				label: 'Present',
				value: attendance?.present ?? '--',
				description: 'Days marked present',
			},
			{
				label: 'Absent',
				value: attendance?.absent ?? '--',
				description: 'Days marked absent',
			},
			{
				label: 'Total Days',
				value: attendance?.total_days ?? '--',
				description: 'Academic days tracked',
			},
		],
		[attendance]
	)

	return (
		<main className="attendance-shell">
			<div className="attendance-backdrop-left" />
			<div className="attendance-backdrop-right" />

			<section className="attendance-card">
				<div className="attendance-content">
					<div className="attendance-header">
						<div className="attendance-badge">Attendance</div>
					</div>

					<div className="attendance-controls">
						<label className="attendance-date-field">
							<span>Select date</span>
							<input
								type="date"
								value={selectedDate}
								onChange={(event) => setSelectedDate(event.target.value)}
							/>
						</label>
						<button type="button" className="attendance-refresh-btn" onClick={() => setSelectedDate(toDateInputValue(new Date()))}>
							Today
						</button>
					</div>

					{error && <div className="attendance-message error">{error}</div>}

					<div className="attendance-summary-grid">
						{summaryCards.map((card) => (
							<div key={card.label} className="attendance-summary-card">
								<div className="attendance-summary-label">{card.label}</div>
								<div className="attendance-summary-value">{card.value}</div>
								<div className="attendance-summary-description">{card.description}</div>
							</div>
						))}
					</div>

					<div className="attendance-log-panel">
						<div className="attendance-log-header">
							<h2>Attendance log</h2>
							<span>{loading ? 'Loading...' : `${logEntries.length} entries`}</span>
						</div>

						{loading ? (
							<div className="attendance-empty-state">Loading attendance for {selectedDate}...</div>
						) : logEntries.length > 0 ? (
							<div className="attendance-log-list">
								{logEntries.map((entry, index) => (
									<div key={`${entry.timing}-${index}`} className="attendance-log-item">
										<div className="attendance-log-main">
											<div className="attendance-log-title">{entry.timing}</div>
											<div className="attendance-log-meta">
												<span>{formatSessionLabel(entry.session)}</span>
												{entry.attendance_by ? <span>Marked by {entry.attendance_by}</span> : <span>System entry</span>}
											</div>
										</div>
										<div
											className="attendance-status-pill"
											style={{
												backgroundColor: entry.statusColor || 'rgba(79, 199, 144, 0.15)',
												color: entry.status?.toLowerCase().includes('absent') ? 'rgba(240, 96, 96, 1)' : 'rgba(79, 199, 144, 1)'
											}}
										>
											{entry.status || 'Unknown'}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="attendance-empty-state">No attendance data available for {selectedDate}.</div>
						)}
					</div>
				</div>
			</section>
		</main>
	)
}

export default Attendance