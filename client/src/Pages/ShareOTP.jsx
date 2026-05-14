import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getShareTokenInfo, submitShareOTP } from '../api/auth.js'

function ShareOTP() {
	const { token } = useParams()

	const [info, setInfo] = useState(null)        // { valid, device_id, expires_at }
	const [checking, setChecking] = useState(true)
	const [invalidReason, setInvalidReason] = useState('')

	const [digits, setDigits] = useState(['', '', '', '', '', ''])
	const inputRefs = useRef([])

	const [submitting, setSubmitting] = useState(false)
	const [message, setMessage] = useState(null)   // { type: 'success'|'error', text }

	// Validate the token on mount
	useEffect(() => {
		if (!token) {
			setInvalidReason('No share token in URL.')
			setChecking(false)
			return
		}
		getShareTokenInfo(token)
			.then((res) => {
				if (res.valid) setInfo(res)
				else setInvalidReason(res.error || 'This link is invalid or has expired.')
			})
			.catch(() => setInvalidReason('Failed to validate share link.'))
			.finally(() => setChecking(false))
	}, [token])

	// Digit input handlers (same pattern as your OTP page)
	const handleDigitChange = (index, value) => {
		const cleaned = value.replace(/\D/g, '').slice(-1)
		const next = [...digits]
		next[index] = cleaned
		setDigits(next)
		if (cleaned && index < 5) {
			inputRefs.current[index + 1]?.focus()
		}
	}

	const handleDigitKeyDown = (index, e) => {
		if (e.key === 'Backspace' && !digits[index] && index > 0) {
			inputRefs.current[index - 1]?.focus()
		}
	}

	const handlePaste = (e) => {
		e.preventDefault()
		const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
		const next = [...digits]
		for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? ''
		setDigits(next)
		const lastFilled = Math.min(pasted.length, 5)
		inputRefs.current[lastFilled]?.focus()
	}

	const handleSubmit = async () => {
		const otp = digits.join('')
		if (otp.length < 6) {
			setMessage({ type: 'error', text: 'Please enter all 6 digits.' })
			return
		}
		setSubmitting(true)
		setMessage(null)
		try {
			const res = await submitShareOTP(token, otp)
			// Pass through whatever the upstream says
			setMessage({ type: 'success', text: res?.message ?? 'OTP submitted successfully!' })
			setDigits(['', '', '', '', '', ''])
			inputRefs.current[0]?.focus()
		} catch (err) {
			setMessage({ type: 'error', text: err.message || 'Failed to submit OTP.' })
		} finally {
			setSubmitting(false)
		}
	}

	const otp = digits.join('')
	const isComplete = otp.length === 6

	// ── Loading ──
	if (checking) {
		return (
			<main className="otp-shell">
				<div className="otp-card">
					<div className="otp-panel">
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
							<div className="spinner" />
							<p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
								Validating share link…
							</p>
						</div>
					</div>
				</div>
			</main>
		)
	}

	// ── Invalid / Expired ──
	if (!info) {
		return (
			<main className="otp-shell">
				<div className="otp-card">
					<div className="otp-panel">
						<div className="otp-panel-header">
							<div>
								<div className="otp-panel-eyebrow">Share Link</div>
								<h2>Link unavailable</h2>
							</div>
						</div>
						<div className="otp-message error">
							<span className="msg-icon">✕</span>
							{invalidReason}
						</div>
						<p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
							Ask the person who sent you this link to generate a new one.
						</p>
					</div>
				</div>
			</main>
		)
	}

	// ── Valid — show OTP form ──
	const expiresAt = new Date(info.expires_at)
	const minsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 60000))

	return (
		<main className="otp-shell">
			<div className="otp-card">
				<div className="otp-content">
					<div className="otp-panel">

						<div className="otp-panel-header">
							<div>
								<div className="otp-panel-eyebrow">Shared OTP Entry</div>
								<h2>Submit OTP</h2>
							</div>
							<span className="otp-char-count">⏱ {minsLeft}m left</span>
						</div>

						<p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
							You're submitting an OTP on behalf of{' '}
							<span style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>
								{info.device_id}
							</span>
							. Enter the 6-digit code shown on their screen.
						</p>

						<div className="otp-form">
							<div className="otp-inputs-container" onPaste={handlePaste}>
								{digits.map((d, i) => (
									<input
										key={i}
										ref={(el) => (inputRefs.current[i] = el)}
										type="text"
										inputMode="numeric"
										maxLength={1}
										placeholder="·"
										value={d}
										className="otp-digit-input"
										onChange={(e) => handleDigitChange(i, e.target.value)}
										onKeyDown={(e) => handleDigitKeyDown(i, e)}
									/>
								))}
							</div>

							<div className="otp-actions">
								<button
									type="button"
									className="otp-submit-btn"
									onClick={handleSubmit}
									disabled={!isComplete || submitting}
								>
									{submitting
										? <><span className="btn-spinner">⟳</span> Submitting…</>
										: 'Submit OTP'
									}
								</button>

								{message && (
									<div className={`otp-message ${message.type}`}>
										<span className="msg-icon">{message.type === 'success' ? '✓' : '✕'}</span>
										{message.text}
									</div>
								)}
							</div>
						</div>

					</div>
				</div>
			</div>
		</main>
	)
}

export default ShareOTP