package handlers

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	DB *sql.DB
}

func New(db *sql.DB) *Handler {
	return &Handler{DB: db}
}

func buildPSURL(path string) string {
	return psBaseURL() + path
}

func psBaseURL() string {
	return getEnv("PS_BASE_URL", "")
}

func psQROTPEndpoint() string {
	return getEnv("PS_QR_OTP_ENDPOINT", "")
}

func psAttendanceEndpoint() string {
	return getEnv("PS_ATTENDANCE_ENDPOINT", "")
}

func psPendingEndpoint() string {
	return getEnv("PS_PENDING_ACTION_ENDPOINT", "")
}

func psActivityEndpoint() string {
	return getEnv("PS_ACTIVITY_ENDPOINT", "")
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RegisterRequest struct {
	DeviceID string `json:"device_id" binding:"required"`
	PSCookie string `json:"ps_cookie" binding:"required"`
}

type LoginRequest struct {
	DeviceID string `json:"device_id" binding:"required"`
	PSCookie string `json:"ps_cookie" binding:"required"`
}

type OTPRequest struct {
	OTP string `json:"otp" binding:"required"`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ─── Register ─────────────────────────────────────────────────────────────────
// POST /auth/register
// Stores device_id + ps_cookie. Call once; re-calling updates the ps_cookie.

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and ps_cookie are required"})
		return
	}

	req.DeviceID = strings.TrimSpace(req.DeviceID)
	req.PSCookie = strings.TrimSpace(req.PSCookie)

	query := `
		INSERT INTO users (device_id, ps_cookie)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE ps_cookie = VALUES(ps_cookie), updated_at = NOW()
	`
	if _, err := h.DB.Exec(query, req.DeviceID, req.PSCookie); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device registered successfully"})
}

// ─── Login ────────────────────────────────────────────────────────────────────
// POST /auth/login
// Validates credentials, issues a persistent session token.
// Returns token in response body AND sets it as a cookie.
// Call once — reuse the token for all future requests.

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and ps_cookie are required"})
		return
	}

	// Validate against DB
	var storedPS string
	err := h.DB.QueryRow(`SELECT ps_cookie FROM users WHERE device_id = ?`, req.DeviceID).Scan(&storedPS)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "device not registered"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if storedPS != req.PSCookie {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Check if a session already exists for this device — reuse it
	var existingToken string
	err = h.DB.QueryRow(`SELECT token FROM sessions WHERE device_id = ?`, req.DeviceID).Scan(&existingToken)
	if err == nil {
		// Already logged in — return existing token
		setSessionCookie(c, existingToken)
		c.JSON(http.StatusOK, gin.H{
			"message": "already logged in",
			"token":   existingToken,
		})
		return
	}

	// Generate new session token
	token, err := generateToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate session token"})
		return
	}

	if _, err := h.DB.Exec(
		`INSERT INTO sessions (device_id, token) VALUES (?, ?)`, req.DeviceID, token,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	setSessionCookie(c, token)
	c.JSON(http.StatusOK, gin.H{
		"message": "login successful",
		"token":   token,
	})
}

// ─── Logout ───────────────────────────────────────────────────────────────────
// POST /auth/logout
// Requires: Authorization: Bearer <token>  OR  Cookie: session_token=<token>
// Deletes the session — token is invalidated immediately.

func (h *Handler) Logout(c *gin.Context) {
	token := extractToken(c)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no session token provided"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to logout"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or already expired token"})
		return
	}

	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

// ─── OTP Proxy ────────────────────────────────────────────────────────────────
// POST /api/qr/otp
// Requires valid session token. Forwards OTP to bitsathy with stored cookies.

func (h *Handler) ProxyOTP(c *gin.Context) {
	var req OTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp is required"})
		return
	}

	// These are set by the session middleware
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	body, _ := json.Marshal(map[string]string{"otp": req.OTP})

	upstreamURL := buildPSURL(psQROTPEndpoint())
	upstreamReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamReq.Header.Set("Content-Type", "application/json")
	upstreamReq.Header.Set("Accept", "application/json, text/plain, */*")
	upstreamReq.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	upstreamReq.Header.Set("User-Agent", "ps_student/1 CFNetwork/3860.200.71 Darwin/25.1.0")
	upstreamReq.Header.Set("Priority", "u=3, i")
	upstreamReq.Header.Set("Accept-Encoding", "identity")

	upstreamReq.AddCookie(&http.Cookie{Name: "PS", Value: psCookie})
	upstreamReq.AddCookie(&http.Cookie{Name: "Device-Identifier", Value: deviceID})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("upstream request failed: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upstream response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// ─── Attendance Proxy ─────────────────────────────────────────────────────────
// GET /api/attendance?date=YYYY-MM-DD
// Requires valid session token. Fetches attendance from bitsathy API.

func (h *Handler) ProxyAttendance(c *gin.Context) {
	date := c.Query("date")
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query parameter is required"})
		return
	}

	// These are set by the session middleware
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := fmt.Sprintf(
		"%s?date=%s",
		buildPSURL(psAttendanceEndpoint()),
		date,
	)
	upstreamReq, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamReq.Header.Set("Accept", "application/json, text/plain, */*")
	upstreamReq.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	upstreamReq.Header.Set("User-Agent", "ps_student/1 CFNetwork/3860.200.71 Darwin/25.1.0")
	upstreamReq.Header.Set("Priority", "u=3, i")
	upstreamReq.Header.Set("Accept-Encoding", "identity")
	upstreamReq.AddCookie(&http.Cookie{Name: "PS", Value: psCookie})
	upstreamReq.AddCookie(&http.Cookie{Name: "Device-Identifier", Value: deviceID})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("upstream request failed: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upstream response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// ─── Pending Action Proxy ─────────────────────────────────────────────────────
// GET /api/pending-action?today=yes
// Requires valid session token. Fetches pending actions from bitsathy API.

func (h *Handler) ProxyPendingAction(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	queryString := c.Request.URL.RawQuery
	upstreamURL := buildPSURL(psPendingEndpoint())
	if queryString != "" {
		upstreamURL += "?" + queryString
	} else {
		upstreamURL += "?today=yes"
	}

	upstreamReq, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamReq.Header.Set("Accept", "application/json, text/plain, */*")
	upstreamReq.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	upstreamReq.Header.Set("User-Agent", "ps_student/1 CFNetwork/3860.200.71 Darwin/25.1.0")
	upstreamReq.Header.Set("Priority", "u=3, i")
	upstreamReq.Header.Set("Accept-Encoding", "identity")
	upstreamReq.AddCookie(&http.Cookie{Name: "PS", Value: psCookie})
	upstreamReq.AddCookie(&http.Cookie{Name: "Device-Identifier", Value: deviceID})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("upstream request failed: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upstream response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// ─── Activity Proxy ───────────────────────────────────────────────────────────
// GET /api/activity?date=YYYY-MM-DD
// Requires valid session token. Fetches activity from bitsathy API.

func (h *Handler) ProxyActivity(c *gin.Context) {
	date := c.Query("date")
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query parameter is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := fmt.Sprintf(
		"%s?date=%s",
		buildPSURL(psActivityEndpoint()),
		date,
	)
	upstreamReq, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamReq.Header.Set("Accept", "application/json, text/plain, */*")
	upstreamReq.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	upstreamReq.Header.Set("User-Agent", "ps_student/1 CFNetwork/3860.200.71 Darwin/25.1.0")
	upstreamReq.Header.Set("Priority", "u=3, i")
	upstreamReq.Header.Set("Accept-Encoding", "identity")
	upstreamReq.AddCookie(&http.Cookie{Name: "PS", Value: psCookie})
	upstreamReq.AddCookie(&http.Cookie{Name: "Device-Identifier", Value: deviceID})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("upstream request failed: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upstream response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// ─── Utilities ────────────────────────────────────────────────────────────────

func setSessionCookie(c *gin.Context, token string) {
	// 30-day persistent cookie
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})
}

func clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})
}

// extractToken reads token from Authorization header or cookie
func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	token, _ := c.Cookie("session_token")
	return token
}
