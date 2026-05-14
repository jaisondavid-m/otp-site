import { useState, useRef, useEffect } from 'react'
import { submitOTP } from '../api/auth.js'

function OTP() {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const inputRefs = useRef([])
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const otpString = otp.join('')

  useEffect(() => {
    if (showScanner) startCamera()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [showScanner])

  const startCamera = async () => {
    try {
      setScannerError('')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          startScanning()
        }
      }
    } catch {
      setScannerError('Camera access denied. Check permissions.')
    }
  }

  const startScanning = () => {
    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0)
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const result = decodeQRCode(imageData)
        if (result) {
          const digits = result.match(/\d/g)
          if (digits && digits.length >= 6) {
            const val = digits.slice(0, 6)
            setOtp(val)
            clearInterval(interval)
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
            setShowScanner(false)
          }
        }
      } catch { /* continue */ }
    }, 500)
  }

  const decodeQRCode = (imageData) => {
    const { data, width, height } = imageData
    const count = (sx, sy, size) => {
      let black = 0
      for (let y = sy; y < sy + size && y < height; y++) {
        for (let x = sx; x < sx + size && x < width; x++) {
          const i = (y * width + x) * 4
          if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 128) black++
        }
      }
      return black
    }
    const s = 50
    const corners = [count(0, 0, s), count(width - s, 0, s), count(0, height - s, s)]
    return corners.every((c) => c > s * s * 0.3) ? 'QR_DETECTED' : null
  }

  const handleChange = (index, e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 1)
    const next = [...otp]
    next[index] = val
    setOtp(next)
    if (val && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length) {
      const next = pasted.split('').concat(Array(6).fill('')).slice(0, 6)
      setOtp(next)
      const focus = Math.min(pasted.length, 5)
      inputRefs.current[focus]?.focus()
      e.preventDefault()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (otpString.length < 6) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await submitOTP(otpString)
      setMessage(response.message || 'OTP verified successfully.')
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err.message || 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const closeScan = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    setShowScanner(false)
  }

  return (
    <main className="otp-shell">
      <section className="otp-card">
        <div className="otp-content">
          <div className="otp-panel">

            {!showScanner ? (
              <>
                <div className="otp-panel-header">
                  <div>
                    <div className="otp-panel-eyebrow">Authenticator</div>
                    <h2>Verification code</h2>
                  </div>
                  <div className="otp-char-count">{otpString.length}/6</div>
                </div>

                <form className="otp-form" onSubmit={handleSubmit}>
                  <div className="otp-inputs-container" onPaste={handlePaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        value={digit}
                        onChange={(e) => handleChange(index, e)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onFocus={(e) => e.target.select()}
                        placeholder="·"
                        maxLength="1"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        className="otp-digit-input"
                      />
                    ))}
                  </div>

                  <div className="otp-actions">
                    <button
                      type="submit"
                      className="otp-submit-btn"
                      disabled={loading || otpString.length < 6}
                    >
                      {loading && <span className="btn-spinner">⏳</span>}
                      {loading ? 'Verifying…' : 'Verify code'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setShowScanner(true)}
                    >
                      Scan QR code instead
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="otp-panel-header">
                  <div>
                    <div className="otp-panel-eyebrow">QR Scanner</div>
                    <h2>Scan your code</h2>
                  </div>
                </div>
                <div className="scanner-modal">
                  <div className="scanner-container">
                    <video ref={videoRef} className="scanner-video" playsInline muted />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <div className="scanner-overlay" />
                    <div className="scanner-caption">Align QR code within the frame</div>
                    {scannerError && <p className="scanner-error">{scannerError}</p>}
                    <button type="button" className="scanner-close" onClick={closeScan} aria-label="Close scanner">
                      ✕
                    </button>
                  </div>
                </div>
              </>
            )}

            {message && (
              <div className="otp-message success">
                <span className="msg-icon">✓</span>
                <span>{message}</span>
              </div>
            )}
            {error && (
              <div className="otp-message error">
                <span className="msg-icon">✕</span>
                <span>{error}</span>
              </div>
            )}

          </div>
        </div>
      </section>
    </main>
  )
}

export default OTP