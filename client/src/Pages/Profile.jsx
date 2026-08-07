import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getProfile, formatImageUrl } from '../api/auth.js'

function QRCode({ value }) {
	const containerRef = useRef(null)
	const qrInstanceRef = useRef(null)

	useEffect(() => {
		if (!value || !containerRef.current) return

		// Clear previous QR code
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
			// Fallback: show value as text if library isn't loaded
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

function Profile() {
	const [profile, setProfile] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
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
			setError(err.message || 'Failed to load profile')
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

	if (loading) {
		return (
			<main className="profile-shell">
				<section className="profile-page-card">
					<div className="profile-page-content">
						<div className="profile-page-header">
							<div className="profile-badge">Profile</div>
						</div>
						<div className="profile-loading-state">
							<div className="spinner" />
							<p>Loading profile...</p>
						</div>
					</div>
				</section>
			</main>
		)
	}

	if (error) {
		return (
			<main className="profile-shell">
				<section className="profile-page-card">
					<div className="profile-page-content">
						<div className="profile-page-header">
							<div className="profile-badge">Profile</div>
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

	if (!profile) {
		return (
			<main className="profile-shell">
				<section className="profile-page-card">
					<div className="profile-page-content">
						<div className="profile-page-header">
							<div className="profile-badge">Profile</div>
						</div>
						<div className="profile-empty-state">
							<p>No profile data available</p>
							<button className="profile-retry-btn" onClick={handleRefresh}>
								Refresh
							</button>
						</div>
					</div>
				</section>
			</main>
		)
	}

	return (
		<main className="profile-shell">
			<section className="profile-page-card">
				<div className="profile-page-content">
					<div className="profile-page-header">
						<div className="profile-badge">Profile</div>
						<button className="profile-refresh-btn" onClick={handleRefresh} title="Refresh profile">
							↻
						</button>
					</div>

					{/* Profile Header Card */}
					{profile.profile_img && (
						<div className="profile-header-card">
							<img
								src={formatImageUrl(profile.profile_img, profile.user_id)}
								alt={profile.user_name}
								className="profile-avatar"
								onError={(e) => {
									e.target.style.display = 'none'
								}}
							/>
							<div className="profile-header-info">
								<h2 className="profile-name">{profile.user_name}</h2>
								<p className="profile-id">ID: {profile.user_id}</p>
								<p className="profile-designation">{profile.designation}</p>
							</div>
						</div>
					)}

					{/* Main Info Grid */}
					<div className="profile-grid">
						{/* Department & Batch */}
						<div className="profile-card">
							<h3 className="card-label">DEPARTMENT</h3>
							<p className="card-value">{profile.dept_name}</p>
						</div>

						<div className="profile-card">
							<h3 className="card-label">BATCH</h3>
							<p className="card-value">{profile.batch}</p>
						</div>

						{/* Email */}
						<div className="profile-card full-width">
							<h3 className="card-label">EMAIL</h3>
							<p className="card-value email">{profile.email_id}</p>
						</div>

						{/* Phone */}
						<div className="profile-card full-width">
							<h3 className="card-label">PHONE</h3>
							<p className="card-value">{profile.phone_no}</p>
						</div>

						{/* Role */}
						<div className="profile-card full-width">
							<h3 className="card-label">ROLE</h3>
							<p className="card-value">{profile.role}</p>
						</div>

						{/* Biometric logs quick summary */}
						<div className="profile-card full-width biometric-summary-card">
							<div className="biometric-summary-header">
								<h3 className="card-label">BIOMETRIC LOGS</h3>
								<Link to="/biometric" className="biometric-link-anchor">
									View All Logs &rarr;
								</Link>
							</div>
							<div className="biometric-summary-body">
								{profile.biometric && profile.biometric.length > 0 ? (
									<div className="biometric-quick-list">
										{profile.biometric.slice(0, 3).map((log, index) => (
											<div key={index} className="biometric-quick-item">
												<span className="biometric-quick-device">{log.device_name}</span>
												<span className="biometric-quick-datetime">{log.date} at {log.time}</span>
											</div>
										))}
									</div>
								) : (
									<p className="card-value">No biometric records found</p>
								)}
							</div>
						</div>

						{/* QR Code — replaces plain QR value text */}
						{profile.qr_value && (
							<div className="profile-card full-width qr-card">
								<h3 className="card-label">QR CODE</h3>
								<QRCode value={profile.qr_value} />
							</div>
						)}
					</div>
				</div>
			</section>
		</main>
	)
}

export default Profile