import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getShareTokenInfo, submitShareOTP } from '../api/auth.js'

function ShareOTP() {
	const { token } = useParams()

	const [info, setInfo] = useState(null)        // { valid, device_id, expires_at, targets, target_names }
	const [checking, setChecking] = useState(true)
	const [invalidReason, setInvalidReason] = useState('')

	const [digits, setDigits] = useState(['', '', '', '', '', ''])
	const inputRefs = useRef([])

	const [submitting, setSubmitting] = useState(false)
	const [message, setMessage] = useState(null)   // { type: 'success'|'error', text }
	const [batchResults, setBatchResults] = useState(null)

	const formattedTargetNames = useMemo(() => {
		if (!info) return ''
		const names = (info.target_names || []).filter(Boolean)
		if (names.length === 0 && info.targets) {
			names.push(...info.targets.map((t) => t.name || t.device_id).filter(Boolean))
		}
		if (names.length === 0) {
			if (info.name || info.device_id) names.push(info.name || info.device_id)
		}
		if (names.length === 0) return ''
		if (names.length === 1) return names[0]
		if (names.length === 2) return `${names[0]} and ${names[1]}`
		return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
	}, [info])

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
		const cleaned = value.replace(/\D/g, '')

		// Full OTP pasted/typed
		if (cleaned.length > 1) {
			const next = cleaned.slice(0, 6).split('')

			while (next.length < 6) {
				next.push('')
			}

			setDigits(next)

			const focusIndex = Math.min(cleaned.length, 5)
			inputRefs.current[focusIndex]?.focus()
			return
		}

		// Single digit
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
		setBatchResults(null)
		try {
			const res = await submitShareOTP(token, otp)
			if (res && Array.isArray(res.results)) {
				setBatchResults(res.results)
				const successCount = res.results.filter((r) => r.success).length
				setMessage({
					type: successCount > 0 ? 'success' : 'error',
					text: `Broadcast OTP processed: ${successCount}/${res.results.length} target(s) succeeded.`,
				})
			} else {
				const item = {
					device_id: info?.device_id || '',
					name: info?.name || '',
					success: true,
					status: 200,
					data: res,
				}
				setBatchResults([item])
				const textMsg = res?.message || res?.data?.message || (typeof res === 'string' ? res : 'OTP submitted successfully!')
				setMessage({ type: 'success', text: textMsg })
			}
			setDigits(['', '', '', '', '', ''])
			inputRefs.current[0]?.focus()
		} catch (err) {
			const item = {
				device_id: info?.device_id || '',
				name: info?.name || '',
				success: false,
				status: err.status || 500,
				error: err.message || 'Failed to submit OTP.',
			}
			setBatchResults([item])
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
							Enter the 6-digit code shown on screen to submit for {formattedTargetNames ? <strong style={{ color: 'var(--accent)' }}>{formattedTargetNames}</strong> : 'the target accounts'}.
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
								<div style={{ display: 'flex', gap: 10 }}>
									<button
										type="button"
										className="btn btn-ghost"
										onClick={() => {
											setDigits(['', '', '', '', '', ''])
											setMessage(null)
											inputRefs.current[0]?.focus()
										}}
										disabled={submitting}
										style={{ flex: 1 }}
									>
										Clear OTP
									</button>

									<button
										type="button"
										className="otp-submit-btn"
										onClick={handleSubmit}
										disabled={!isComplete || submitting}
										style={{ flex: 2 }}
									>
										{submitting
											? <><span className="btn-spinner">⟳</span> Submitting…</>
											: 'Submit OTP'}
									</button>
								</div>

								{message && (
									<div className={`otp-message ${message.type}`}>
										<span className="msg-icon">{message.type === 'success' ? '✓' : '✕'}</span>
										{message.text}
									</div>
								)}

								{batchResults && (
									<div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
										<div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
											Target Response Breakdown ({batchResults.length} Account{batchResults.length === 1 ? '' : 's'}):
										</div>
										{batchResults.map((item, i) => {
											let respMsg = ''
											if (item.error) {
												respMsg = item.error
											} else if (item.data) {
												if (typeof item.data === 'string') respMsg = item.data
												else if (item.data.message) respMsg = item.data.message
												else if (item.data.error) respMsg = item.data.error
												else respMsg = JSON.stringify(item.data)
											} else {
												respMsg = item.success ? 'Success' : 'Failed'
											}

											const displayName = item.name || item.device_id

											return (
												<div
													key={i}
													style={{
														background: item.success ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
														border: `1.5px solid ${item.success ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
														borderRadius: 'var(--radius-md)',
														padding: '12px 14px',
														display: 'flex',
														flexDirection: 'column',
														gap: 6
													}}
												>
													<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
														<div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
															<span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
																👤 {displayName}
															</span>
															{item.name && item.device_id && (
																<span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
																	ID: {item.device_id}
																</span>
															)}
														</div>
														<span style={{
															fontSize: 12,
															fontWeight: 800,
															padding: '2px 8px',
															borderRadius: 4,
															background: item.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
															color: item.success ? '#22c55e' : '#ef4444',
															flexShrink: 0
														}}>
															{item.success ? '✓ Success' : `✕ Failed (${item.status || 'Err'})`}
														</span>
													</div>

													<div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
														<strong>Response:</strong> {respMsg}
													</div>
												</div>
											)
										})}
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