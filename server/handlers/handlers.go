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
	"regexp"
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
	return getEnv("BASE_URL", "")
}

func psQROTPEndpoint() string {
	return getEnv("QR_OTP_ENDPOINT", "")
}

func psAttendanceEndpoint() string {
	return getEnv("ATTENDANCE_ENDPOINT", "")
}

func psPendingEndpoint() string {
	return getEnv("PENDING_ACTION_ENDPOINT", "")
}

func psActivityEndpoint() string {
	return getEnv("ACTIVITY_ENDPOINT", "")
}

func psProfileEndpoint() string {
	return getEnv("PROFILE_ENDPOINT", "")
}

func psActivityDetailsEndpoint() string {
	return getEnv("ACTIVITY_DETAILS_ENDPOINT", "")
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func psShareOTPEndpoint() string {
	return getEnv("QR_OTP_ENDPOINT", "") // reuses same upstream endpoint
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateShareRequest struct {
	TTLMinutes int    `json:"ttl_minutes"`
	CustomCode string `json:"custom_code"`
}

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

func normalizeShareCode(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

var shareCodePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`)

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

// ─── Current User ────────────────────────────────────────────────────────────
// GET /auth/me
// Returns the session identity so the frontend can decide whether to show admin UI.

func (h *Handler) CurrentUser(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"device_id": c.GetString("device_id"),
		"is_admin":  c.GetBool("is_admin"),
	})
}

// ─── Admin Users ─────────────────────────────────────────────────────────────
// GET /api/admin/users
// Admin only. Lists registered users without exposing passwords.

func (h *Handler) ListUsers(c *gin.Context) {
	rows, err := h.DB.Query(`
		SELECT device_id, created_at, updated_at
		FROM users
		ORDER BY created_at DESC, device_id ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load users"})
		return
	}
	defer rows.Close()

	type userItem struct {
		DeviceID  string    `json:"device_id"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
		IsAdmin   bool      `json:"is_admin"`
	}

	users := make([]userItem, 0)
	adminDeviceID := strings.TrimSpace(os.Getenv("ADMIN_DEVICE_ID"))

	for rows.Next() {
		var item userItem
		if err := rows.Scan(&item.DeviceID, &item.CreatedAt, &item.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read users"})
			return
		}
		item.IsAdmin = adminDeviceID != "" && item.DeviceID == adminDeviceID
		users = append(users, item)
	}

	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read users"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}

// POST /api/admin/users
// Admin only. Creates a new user account.

func (h *Handler) CreateUser(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and ps_cookie are required"})
		return
	}

	req.DeviceID = strings.TrimSpace(req.DeviceID)
	req.PSCookie = strings.TrimSpace(req.PSCookie)
	if req.DeviceID == "" || req.PSCookie == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and ps_cookie are required"})
		return
	}

	res, err := h.DB.Exec(`
		INSERT INTO users (device_id, ps_cookie)
		VALUES (?, ?)
	`, req.DeviceID, req.PSCookie)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	rows, _ := res.RowsAffected()
	c.JSON(http.StatusCreated, gin.H{
		"message":    "user created successfully",
		"rows_affected": rows,
	})
}

// DELETE /api/admin/users/:device_id
// Admin only. Deletes the user and any cascaded sessions.

func (h *Handler) DeleteUser(c *gin.Context) {
	targetDeviceID := strings.TrimSpace(c.Param("device_id"))
	if targetDeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	if targetDeviceID == c.GetString("device_id") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you cannot delete the currently logged-in admin account"})
		return
	}

	res, err := h.DB.Exec(`DELETE FROM users WHERE device_id = ?`, targetDeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted successfully"})
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

// ─── Activity Details Proxy ───────────────────────────────────────────────────
// GET /api/activity/details?id=<id>
// Requires valid session token. Fetches activity details from bitsathy API.

func (h *Handler) ProxyActivityDetails(c *gin.Context) {
	id := c.Query("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id query parameter is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := fmt.Sprintf(
		"%s?id=%s",
		buildPSURL(psActivityDetailsEndpoint()),
		id,
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

// ─── Profile Proxy ────────────────────────────────────────────────────────────
// GET /api/profile
// Requires valid session token. Fetches user profile from bitsathy API.

func (h *Handler) ProxyProfile(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := buildPSURL(psProfileEndpoint())
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

// ─── Create Share Token ───────────────────────────────────────────────────────
// POST /api/share/create
// Requires valid session. Returns a one-time share token + link.

func (h *Handler) CreateShareToken(c *gin.Context) {
	deviceID := c.GetString("device_id")

	var req CreateShareRequest
	_ = c.ShouldBindJSON(&req)
	customCode := normalizeShareCode(req.CustomCode)
	if customCode != "" && !shareCodePattern.MatchString(customCode) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "custom code must be 3-32 characters using lowercase letters, numbers, or hyphens"})
		return
	}

	var expiresAt time.Time
	if req.TTLMinutes <= 0 {
		// "never" — 100 years from now
		expiresAt = time.Now().AddDate(100, 0, 0)
	} else {
		expiresAt = time.Now().Add(time.Duration(req.TTLMinutes) * time.Minute)
	}

	token := customCode
	if token == "" {
		var err error
		token, err = generateToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate share token"})
			return
		}
	}

	if customCode != "" {
		var existingDeviceID string
		err := h.DB.QueryRow(`SELECT device_id FROM share_tokens WHERE token = ?`, token).Scan(&existingDeviceID)
		if err == nil && existingDeviceID != deviceID {
			c.JSON(http.StatusConflict, gin.H{"error": "that custom code is already in use"})
			return
		}
		if err != nil && err != sql.ErrNoRows {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
	}

	if _, err := h.DB.Exec(`DELETE FROM share_tokens WHERE device_id = ?`, deviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear previous share token"})
		return
	}

	_, err := h.DB.Exec(`
		INSERT INTO share_tokens (token, device_id, expires_at)
		VALUES (?, ?, ?)
	`, token, deviceID, expiresAt)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			if customCode != "" {
				c.JSON(http.StatusConflict, gin.H{"error": "that custom code is already in use"})
				return
			}

			c.JSON(http.StatusConflict, gin.H{"error": "failed to generate a unique share token, please try again"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save share token"})
		return
	}

	frontendBase := getEnv("FRONTEND_BASE_URL", "https://pcdp.bitsathy.in")

	c.JSON(http.StatusOK, gin.H{
		"share_token": token,
		"expires_at":  expiresAt.Format(time.RFC3339),
		"link":        fmt.Sprintf("%s/share/%s", frontendBase, token),
		"permanent":   req.TTLMinutes <= 0,
	})
}

// ─── Revoke Share Token ───────────────────────────────────────────────────────
// DELETE /api/share/revoke
// Requires valid session. Deletes all share tokens for this device.

func (h *Handler) RevokeShareToken(c *gin.Context) {
	deviceID := c.GetString("device_id")

	res, err := h.DB.Exec(`DELETE FROM share_tokens WHERE device_id = ?`, deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke share tokens"})
		return
	}

	rows, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"revoked": rows})
}

// ─── Share OTP (public, no session needed) ────────────────────────────────────
// POST /share/:token/otp
// No auth required. Validates share token, proxies OTP upstream using owner's cookies.

func (h *Handler) ShareProxyOTP(c *gin.Context) {
	shareToken := c.Param("token")
	if shareToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "share token is required"})
		return
	}

	// Validate share token and load owner's credentials
	var deviceID, psCookie string
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT st.device_id, u.ps_cookie, st.expires_at
		FROM share_tokens st
		JOIN users u ON u.device_id = st.device_id
		WHERE st.token = ?
	`, shareToken).Scan(&deviceID, &psCookie, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or expired share link"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if time.Now().After(expiresAt) {
		// Clean up expired token
		h.DB.Exec(`DELETE FROM share_tokens WHERE token = ?`, shareToken)
		c.JSON(http.StatusGone, gin.H{"error": "share link has expired"})
		return
	}

	var req OTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp is required"})
		return
	}

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

// ─── Share Token Info (public) ────────────────────────────────────────────────
// GET /share/:token/info
// No auth required. Returns validity + expiry so the frontend can show a proper UI.

func (h *Handler) ShareTokenInfo(c *gin.Context) {
	shareToken := c.Param("token")

	var deviceID string
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT device_id, expires_at FROM share_tokens WHERE token = ?
	`, shareToken).Scan(&deviceID, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"valid": false, "error": "share link not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"valid": false, "error": "database error"})
		return
	}
	if time.Now().After(expiresAt) {
		h.DB.Exec(`DELETE FROM share_tokens WHERE token = ?`, shareToken)
		c.JSON(http.StatusGone, gin.H{"valid": false, "error": "share link has expired"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":      true,
		"device_id":  deviceID,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
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
