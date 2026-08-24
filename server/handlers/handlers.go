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
	"net/url"
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

const (
	psBaseURLValue                = "https://ps.bitsathy.ac.in/api/ps_app_v3"
	psQROTPEndpointValue         = "/qr/otp"
	psAttendanceEndpointValue    = "/my-attendance"
	psPendingEndpointValue       = "/activity/pending-action"
	psActivityEndpointValue      = "/activity"
	psProfileEndpointValue       = "/profile/virtual-id"
	psActivityDetailsEndpointVal = "/activity/details"
	psUserImageEndpointValue     = "/user/images"
)

func buildPSURL(path string) string {
	return psBaseURL() + path
}

func psBaseURL() string {
	return psBaseURLValue
}

func psQROTPEndpoint() string {
	return psQROTPEndpointValue
}

func psAttendanceEndpoint() string {
	return psAttendanceEndpointValue
}

func psPendingEndpoint() string {
	return psPendingEndpointValue
}

func psActivityEndpoint() string {
	return psActivityEndpointValue
}

func psProfileEndpoint() string {
	return psProfileEndpointValue
}

func psUserImageEndpoint() string {
	return psUserImageEndpointValue
}

func psActivityDetailsEndpoint() string {
	return psActivityDetailsEndpointVal
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func psShareOTPEndpoint() string {
	return psQROTPEndpointValue
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateShareRequest struct {
	TTLMinutes    int      `json:"ttl_minutes"`
	CustomCode    string   `json:"custom_code"`
	TargetDevices []string `json:"target_device_ids"`
	IncludeSelf   bool     `json:"include_self"`
}

type SubmitFriendsOTPRequest struct {
	OTP           string   `json:"otp" binding:"required"`
	TargetDevices []string `json:"target_device_ids"`
	IncludeSelf   bool     `json:"include_self"`
}

type RegisterRequest struct {
	DeviceID string `json:"device_id" binding:"required"`
	PSCookie string `json:"ps_cookie" binding:"required"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type UpdateNameRequest struct {
	Name string `json:"name"`
}

type UpdateQuickLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UpdatePasswordRequest struct {
	PSCookie string `json:"ps_cookie" binding:"required"`
}

type LoginRequest struct {
	DeviceID string `json:"device_id" binding:"required"`
	PSCookie string `json:"ps_cookie" binding:"required"`
}

type OTPRequest struct {
	OTP string `json:"otp" binding:"required"`
}

type StartActivityRequest struct {
	ActivityID int `json:"activity_id" binding:"required"`
}

type AddParticipantsRequest struct {
	ActivityID int `json:"activity_id" binding:"required"`
}

type EndActivityRequest struct {
	ActivityID int `json:"activity_id" binding:"required"`
}


type TransferActivityRequest struct {
	ActivityID int    `json:"activity_id" binding:"required"`
	ToUser     string `json:"to_user" binding:"required"`
	Remarks    string `json:"remarks"`
}

type FriendRequestPayload struct {
	TargetDeviceID string `json:"target_device_id" binding:"required"`
}

type FriendNicknamePayload struct {
	FriendDeviceID string `json:"friend_device_id" binding:"required"`
	Nickname       string `json:"nickname"`
}

type FriendRequestItem struct {
	ID        int       `json:"id"`
	From      string    `json:"from_device"`
	To        string    `json:"to_device"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
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
	req.Name = strings.TrimSpace(req.Name)

	query := `
		INSERT INTO users (device_id, ps_cookie, name)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE ps_cookie = VALUES(ps_cookie), name = VALUES(name), updated_at = NOW()
	`
	if _, err := h.DB.Exec(query, req.DeviceID, req.PSCookie, req.Name); err != nil {
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
	var deviceID, storedPS string
	err := h.DB.QueryRow(`
		SELECT device_id, ps_cookie 
		FROM users 
		WHERE username = ? AND password = ?
	`, req.DeviceID, req.PSCookie).Scan(&deviceID, &storedPS)

	if err == sql.ErrNoRows {
		// Fallback to checking device_id and ps_cookie directly
		err = h.DB.QueryRow(`SELECT ps_cookie FROM users WHERE device_id = ?`, req.DeviceID).Scan(&storedPS)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
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
		deviceID = req.DeviceID
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// Check if a session already exists for this device — reuse it
	var existingToken string
	err = h.DB.QueryRow(`SELECT token FROM sessions WHERE device_id = ?`, deviceID).Scan(&existingToken)
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
		`INSERT INTO sessions (device_id, token) VALUES (?, ?)`, deviceID, token,
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
	deviceID := c.GetString("device_id")
	var name string
	_ = h.DB.QueryRow(`SELECT COALESCE(name, '') FROM users WHERE device_id = ?`, deviceID).Scan(&name)

	c.JSON(http.StatusOK, gin.H{
		"device_id": deviceID,
		"name":      name,
		"is_admin":  c.GetBool("is_admin"),
	})
}

// ─── Admin Users ─────────────────────────────────────────────────────────────
// GET /api/admin/users
// Admin only. Lists registered users without exposing passwords.

func (h *Handler) ListUsers(c *gin.Context) {
	rows, err := h.DB.Query(`
		SELECT device_id, COALESCE(name, ''), COALESCE(username, ''), COALESCE(password, ''), created_at, updated_at
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
		Name      string    `json:"name"`
		Username  string    `json:"username"`
		Password  string    `json:"password"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
		IsAdmin   bool      `json:"is_admin"`
	}

	users := make([]userItem, 0)
	adminDeviceID := strings.TrimSpace(os.Getenv("ADMIN_DEVICE_ID"))

	for rows.Next() {
		var item userItem
		if err := rows.Scan(&item.DeviceID, &item.Name, &item.Username, &item.Password, &item.CreatedAt, &item.UpdatedAt); err != nil {
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
	req.Name = strings.TrimSpace(req.Name)
	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)

	if req.DeviceID == "" || req.PSCookie == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and ps_cookie are required"})
		return
	}

	var usernameVal *string
	if req.Username != "" {
		usernameVal = &req.Username
	}

	res, err := h.DB.Exec(`
		INSERT INTO users (device_id, ps_cookie, name, username, password)
		VALUES (?, ?, ?, ?, ?)
	`, req.DeviceID, req.PSCookie, req.Name, usernameVal, req.Password)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			c.JSON(http.StatusConflict, gin.H{"error": "user or username already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	rows, _ := res.RowsAffected()
	c.JSON(http.StatusCreated, gin.H{
		"message":       "user created successfully",
		"rows_affected": rows,
	})
}

// PATCH /api/admin/users/:device_id/password
// Admin only. Updates the user's password / ps_cookie.

func (h *Handler) UpdateUserPassword(c *gin.Context) {
	targetDeviceID := strings.TrimSpace(c.Param("device_id"))
	if targetDeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	var req UpdatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ps_cookie is required"})
		return
	}

	req.PSCookie = strings.TrimSpace(req.PSCookie)
	if req.PSCookie == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ps_cookie is required"})
		return
	}

	res, err := h.DB.Exec(`
		UPDATE users
		SET ps_cookie = ?, updated_at = NOW()
		WHERE device_id = ?
	`, req.PSCookie, targetDeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated successfully"})
}

// PATCH /api/admin/users/:device_id/quick-login
// Admin only. Updates the user's quick login credentials.

func (h *Handler) UpdateUserQuickLogin(c *gin.Context) {
	targetDeviceID := strings.TrimSpace(c.Param("device_id"))
	if targetDeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	var req UpdateQuickLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)

	var usernameVal *string
	if req.Username != "" {
		usernameVal = &req.Username
	}

	res, err := h.DB.Exec(`
		UPDATE users
		SET username = ?, password = ?, updated_at = NOW()
		WHERE device_id = ?
	`, usernameVal, req.Password, targetDeviceID)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update quick login credentials"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "quick login credentials updated successfully"})
}

// PATCH /api/admin/users/:device_id/name
// Admin only. Updates the user's display name.

func (h *Handler) UpdateUserName(c *gin.Context) {
	targetDeviceID := strings.TrimSpace(c.Param("device_id"))
	if targetDeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	var req UpdateNameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)

	res, err := h.DB.Exec(`
		UPDATE users
		SET name = ?, updated_at = NOW()
		WHERE device_id = ?
	`, req.Name, targetDeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update name"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "name updated successfully"})
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

// ─── Start Activity Proxy ──────────────────────────────────────────────────────
// POST /api/activity/start-activity
// Requires valid session token. Forwards request to bitsathy to start the activity.

func (h *Handler) ProxyStartActivity(c *gin.Context) {
	var req StartActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "activity_id is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	body, _ := json.Marshal(map[string]int{"activity_id": req.ActivityID})

	upstreamURL := buildPSURL("/activity/start-activity")
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

// ─── Add Participants Proxy ───────────────────────────────────────────────────
// POST /api/activity/add-participants
// Requires valid session token. Forwards request to bitsathy to generate OTP/QR for adding participants.

func (h *Handler) ProxyAddParticipants(c *gin.Context) {
	var req AddParticipantsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "activity_id is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	body, _ := json.Marshal(map[string]int{"activity_id": req.ActivityID})

	upstreamURL := buildPSURL("/activity/add-participates")
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

// ─── End Activity Proxy ───────────────────────────────────────────────────────
// POST /api/activity/end-activity
// Requires valid session token. Forwards request to bitsathy to end the activity.

func (h *Handler) ProxyEndActivity(c *gin.Context) {
	var req EndActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "activity_id is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	body, _ := json.Marshal(map[string]int{"activity_id": req.ActivityID})

	upstreamURL := buildPSURL("/activity/end-activity/v2")
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


// ─── Transfer Activity Proxy ──────────────────────────────────────────────────
// POST /api/activity/transfer
// Requires valid session token. Forwards request to bitsathy to transfer activity.

func (h *Handler) ProxyTransferActivity(c *gin.Context) {
	var req TransferActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "activity_id and to_user are required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	body, _ := json.Marshal(map[string]interface{}{
		"activity_id": req.ActivityID,
		"to_user":     req.ToUser,
		"remarks":     req.Remarks,
	})

	upstreamURL := buildPSURL("/activity/transfer")
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

// ─── Pending Action V2 Proxy ──────────────────────────────────────────────────
// GET /api/pending-action/v2?date=YYYY-MM-DD
// Requires valid session token. Fetches pending actions v2 from bitsathy API.

func (h *Handler) ProxyPendingActionV2(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	date := c.Query("date")
	path := "/activity/pending-action/v2"
	if date != "" {
		path += "?date=" + date
	}

	upstreamURL := buildPSURL(path)
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

// ─── Submit Pending Action Proxy ──────────────────────────────────────────────
// POST /api/pending-action
// Requires valid session token. Forwards accept/transfer action to bitsathy API.

func (h *Handler) ProxySubmitPendingAction(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	upstreamURL := buildPSURL("/activity/pending-action")
	upstreamReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(bodyBytes))
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

// ─── Create Activity Proxy ────────────────────────────────────────────────────
// POST /api/activity
// Requires valid session token. Forwards request body to bitsathy /activity or /activity/v2 endpoint.

func (h *Handler) ProxyCreateActivity(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	enableV2 := c.Query("enable_activity_v2") == "true" || c.Query("v2") == "true"

	path := "/activity"
	if enableV2 {
		path = "/activity/v2"
	}

	upstreamURL := buildPSURL(path)
	upstreamReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(bodyBytes))
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

// GET /api/points/leaderboard
// Requires valid session token. Fetches rewards leaderboard from bitsathy API.
func (h *Handler) ProxyRewardsLeaderboard(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	filter := strings.TrimSpace(c.Query("filter"))
	id := strings.TrimSpace(c.Query("id"))
	if id == "" {
		id = "6"
	}

	upstreamURL := fmt.Sprintf("%s/profile/rewards/leaderboard?id=%s", psBaseURL(), id)
	if filter != "" && filter != "overall" {
		upstreamURL += "&filter=" + url.QueryEscape(filter)
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

// GET /api/points/opportunities/history
// Requires valid session token. Fetches opportunity points history from bitsathy API.
func (h *Handler) ProxyRewardsOpportunitiesHistory(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	id := strings.TrimSpace(c.Query("id"))
	if id == "" {
		id = "6"
	}

	upstreamURL := fmt.Sprintf("%s/profile/rewards/opportunities?id=%s", psBaseURL(), id)
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

// ─── User Image Proxy ─────────────────────────────────────────────────────────
// GET /api/user/images?userId=<userId>
// Requires valid session token. Fetches user profile/avatar image from bitsathy API.

func (h *Handler) ProxyUserImage(c *gin.Context) {
	userID := c.Query("userId")
	if userID == "" {
		userID = c.Query("user_id")
	}
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userId query parameter is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := fmt.Sprintf("%s?userId=%s", buildPSURL(psUserImageEndpoint()), url.QueryEscape(userID))
	upstreamReq, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamReq.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
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

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}

	c.Data(resp.StatusCode, contentType, respBody)
}

// ─── Notifications Proxy ──────────────────────────────────────────────────────
// GET /api/notifications
// GET /api/ps_app_v3/notification
// Forwards request to https://ps.bitsathy.ac.in/api/ps_app_v3/notification using session cookies.

func (h *Handler) ProxyNotifications(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := buildPSURL("/notification")
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

// ─── Survey Proxy ─────────────────────────────────────────────────────────────
// GET /api/activity/survey/questions?id=382&limit=true
func (h *Handler) ProxyGetSurveyQuestions(c *gin.Context) {
	surveyID := c.Query("id")
	limit := c.DefaultQuery("limit", "true")
	if surveyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id parameter is required"})
		return
	}

	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	upstreamURL := fmt.Sprintf("%s?id=%s&limit=%s", buildPSURL("/activity/survey/questions"), url.QueryEscape(surveyID), url.QueryEscape(limit))
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

// POST /api/activity/survey/submit
func (h *Handler) ProxySubmitSurvey(c *gin.Context) {
	psCookie := c.GetString("ps_cookie")
	deviceID := c.GetString("device_id")

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	upstreamURL := buildPSURL("/activity/survey/submit")
	upstreamReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(bodyBytes))
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

// ─── Get Share Token ─────────────────────────────────────────────────────────
// GET /api/share
// Requires valid session. Returns active share token for this device if present.

// ─── Get Share Token ─────────────────────────────────────────────────────────
// GET /api/share
// Requires valid session. Returns active share token for this device if present.

func (h *Handler) GetShareToken(c *gin.Context) {
	deviceID := c.GetString("device_id")

	var token string
	var targetsJSON sql.NullString
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT token, targets_json, expires_at
		FROM share_tokens
		WHERE device_id = ?
		LIMIT 1
	`, deviceID).Scan(&token, &targetsJSON, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{
			"active": false,
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if time.Now().After(expiresAt) {
		// Clean up expired token for this device
		_, _ = h.DB.Exec(`DELETE FROM share_tokens WHERE device_id = ?`, deviceID)
		c.JSON(http.StatusOK, gin.H{
			"active": false,
		})
		return
	}

	var targets []string
	if targetsJSON.Valid && targetsJSON.String != "" {
		_ = json.Unmarshal([]byte(targetsJSON.String), &targets)
	}
	if len(targets) == 0 {
		targets = []string{deviceID}
	}

	frontendBase := getEnv("FRONTEND_BASE_URL", "https://pcdp.bitsathy.in")
	permanent := expiresAt.After(time.Now().AddDate(50, 0, 0))

	c.JSON(http.StatusOK, gin.H{
		"active":         true,
		"share_token":    token,
		"expires_at":     expiresAt.Format(time.RFC3339),
		"link":           fmt.Sprintf("%s/share/%s", frontendBase, token),
		"permanent":      permanent,
		"target_devices": targets,
	})
}

// ─── Create Share Token ───────────────────────────────────────────────────────
// POST /api/share/create
// Requires valid session. Returns share token + link. Replaces any previous share link for this user.

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

	// Check if custom code is already taken by another user
	if customCode != "" {
		var existingDeviceID string
		var existingExpiresAt time.Time
		err := h.DB.QueryRow(`SELECT device_id, expires_at FROM share_tokens WHERE token = ?`, customCode).Scan(&existingDeviceID, &existingExpiresAt)
		if err == nil {
			if time.Now().Before(existingExpiresAt) {
				if existingDeviceID != deviceID {
					c.JSON(http.StatusConflict, gin.H{"error": "that custom code is already taken. Please choose a different code."})
					return
				}
			} else {
				// Expired token — remove so it can be reused
				_, _ = h.DB.Exec(`DELETE FROM share_tokens WHERE token = ?`, customCode)
			}
		} else if err != sql.ErrNoRows {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
	}

	// Build valid target list for group share link
	validTargetsMap := make(map[string]bool)
	if req.IncludeSelf || len(req.TargetDevices) == 0 {
		validTargetsMap[deviceID] = true
	}
	for _, t := range req.TargetDevices {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if t == deviceID {
			validTargetsMap[deviceID] = true
			continue
		}
		a, b := deviceID, t
		if a > b {
			a, b = b, a
		}
		var count int
		_ = h.DB.QueryRow(`SELECT COUNT(*) FROM friends WHERE device_a = ? AND device_b = ?`, a, b).Scan(&count)
		if count > 0 {
			validTargetsMap[t] = true
		}
	}

	validTargets := make([]string, 0, len(validTargetsMap))
	for t := range validTargetsMap {
		validTargets = append(validTargets, t)
	}
	targetsJSONBytes, _ := json.Marshal(validTargets)
	targetsJSONStr := string(targetsJSONBytes)

	// Enforce 1 share token per user: clear previous tokens for this device
	if _, err := h.DB.Exec(`DELETE FROM share_tokens WHERE device_id = ?`, deviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear previous share token"})
		return
	}

	_, err := h.DB.Exec(`
		INSERT INTO share_tokens (token, device_id, targets_json, expires_at)
		VALUES (?, ?, ?, ?)
	`, token, deviceID, targetsJSONStr, expiresAt)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") || strings.Contains(err.Error(), "1062") {
			c.JSON(http.StatusConflict, gin.H{"error": "that custom code is already taken. Please choose a different code."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save share token"})
		return
	}

	frontendBase := getEnv("FRONTEND_BASE_URL", "https://pcdp.bitsathy.in")

	c.JSON(http.StatusOK, gin.H{
		"active":         true,
		"share_token":    token,
		"expires_at":     expiresAt.Format(time.RFC3339),
		"link":           fmt.Sprintf("%s/share/%s", frontendBase, token),
		"permanent":      req.TTLMinutes <= 0,
		"target_devices": validTargets,
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

	var deviceID string
	var targetsJSON sql.NullString
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT device_id, targets_json, expires_at
		FROM share_tokens
		WHERE token = ?
	`, shareToken).Scan(&deviceID, &targetsJSON, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or expired share link"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if time.Now().After(expiresAt) {
		h.DB.Exec(`DELETE FROM share_tokens WHERE token = ?`, shareToken)
		c.JSON(http.StatusGone, gin.H{"error": "share link has expired"})
		return
	}

	var req OTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp is required"})
		return
	}

	var targets []string
	if targetsJSON.Valid && targetsJSON.String != "" {
		_ = json.Unmarshal([]byte(targetsJSON.String), &targets)
	}
	if len(targets) == 0 {
		targets = []string{deviceID}
	}

	type TargetResult struct {
		DeviceID string      `json:"device_id"`
		Name     string      `json:"name"`
		Success  bool        `json:"success"`
		Status   int         `json:"status"`
		Data     interface{} `json:"data,omitempty"`
		Error    string      `json:"error,omitempty"`
	}

	results := []TargetResult{}
	for _, targetDev := range targets {
		var psCookie, name string
		err := h.DB.QueryRow(`SELECT ps_cookie, COALESCE(name, '') FROM users WHERE device_id = ?`, targetDev).Scan(&psCookie, &name)
		if err != nil {
			results = append(results, TargetResult{
				DeviceID: targetDev,
				Name:     name,
				Success:  false,
				Status:   http.StatusNotFound,
				Error:    "user credentials not found",
			})
			continue
		}

		status, respBody, err := h.executeOTPUpstream(psCookie, targetDev, req.OTP)
		if err != nil {
			results = append(results, TargetResult{
				DeviceID: targetDev,
				Name:     name,
				Success:  false,
				Status:   status,
				Error:    err.Error(),
			})
			continue
		}

		var parsedData interface{}
		_ = json.Unmarshal(respBody, &parsedData)

		results = append(results, TargetResult{
			DeviceID: targetDev,
			Name:     name,
			Success:  status == http.StatusOK,
			Status:   status,
			Data:     parsedData,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("OTP processed for %d target(s)", len(results)),
		"results": results,
	})
}

func (h *Handler) executeOTPUpstream(psCookie, deviceID, otp string) (int, []byte, error) {
	body, _ := json.Marshal(map[string]string{"otp": otp})
	upstreamURL := buildPSURL(psQROTPEndpoint())
	upstreamReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		return http.StatusInternalServerError, nil, err
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
		return http.StatusBadGateway, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return http.StatusInternalServerError, nil, err
	}
	return resp.StatusCode, respBody, nil
}

// ─── Share Token Info (public) ────────────────────────────────────────────────
// GET /share/:token/info
// No auth required. Returns validity + expiry so the frontend can show a proper UI.

func (h *Handler) ShareTokenInfo(c *gin.Context) {
	shareToken := c.Param("token")

	var deviceID string
	var targetsJSON sql.NullString
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT device_id, targets_json, expires_at FROM share_tokens WHERE token = ?
	`, shareToken).Scan(&deviceID, &targetsJSON, &expiresAt)

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

	var ownerName string
	_ = h.DB.QueryRow(`SELECT COALESCE(name, '') FROM users WHERE device_id = ?`, deviceID).Scan(&ownerName)

	var targets []string
	if targetsJSON.Valid && targetsJSON.String != "" {
		_ = json.Unmarshal([]byte(targetsJSON.String), &targets)
	}
	if len(targets) == 0 {
		targets = []string{deviceID}
	}

	type TargetInfo struct {
		DeviceID string `json:"device_id"`
		Name     string `json:"name"`
	}

	targetInfos := make([]TargetInfo, 0, len(targets))
	targetNames := make([]string, 0, len(targets))

	for _, tDev := range targets {
		var tName string
		_ = h.DB.QueryRow(`SELECT COALESCE(name, '') FROM users WHERE device_id = ?`, tDev).Scan(&tName)
		displayName := tName
		if displayName == "" {
			displayName = tDev
		}
		targetInfos = append(targetInfos, TargetInfo{
			DeviceID: tDev,
			Name:     tName,
		})
		targetNames = append(targetNames, displayName)
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":        true,
		"device_id":    deviceID,
		"name":         ownerName,
		"targets":      targetInfos,
		"target_names": targetNames,
		"expires_at":   expiresAt.Format(time.RFC3339),
	})
}

// ─── Friends: send request, list, approve/reject, list friends, remove

// POST /api/friends/request
func (h *Handler) SendFriendRequest(c *gin.Context) {
	var req FriendRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_device_id is required"})
		return
	}
	from := c.GetString("device_id")
	to := strings.TrimSpace(req.TargetDeviceID)
	if to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_device_id is required"})
		return
	}
	if from == to {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot add yourself as friend"})
		return
	}

	// Ensure target exists
	var dummy string
	if err := h.DB.QueryRow(`SELECT device_id FROM users WHERE device_id = ?`, to).Scan(&dummy); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "target device not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// If a reciprocal pending request exists, accept it and create friendship
	var reciprocalID int
	err := h.DB.QueryRow(`SELECT id FROM friend_requests WHERE from_device = ? AND to_device = ? AND status = 'pending'`, to, from).Scan(&reciprocalID)
	if err == nil {
		// Accept reciprocal
		tx, txErr := h.DB.Begin()
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
		_, _ = tx.Exec(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`, reciprocalID)
		// insert friendship (ordered)
		a, b := from, to
		if a > b {
			a, b = b, a
		}
		_, insErr := tx.Exec(`INSERT IGNORE INTO friends (device_a, device_b) VALUES (?, ?)`, a, b)
		if insErr != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create friendship"})
			return
		}
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "friend request accepted; you are now friends"})
		return
	} else if err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// Check if already friends
	a, b := from, to
	if a > b {
		a, b = b, a
	}
	var fid int
	err = h.DB.QueryRow(`SELECT id FROM friends WHERE device_a = ? AND device_b = ?`, a, b).Scan(&fid)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already friends"})
		return
	}
	if err != sql.ErrNoRows && err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// Insert new friend request
	_, err = h.DB.Exec(`INSERT INTO friend_requests (from_device, to_device) VALUES (?, ?)`, from, to)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			c.JSON(http.StatusConflict, gin.H{"error": "request already sent"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send friend request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request sent"})
}

// GET /api/friends/requests
func (h *Handler) GetFriendRequests(c *gin.Context) {
	device := c.GetString("device_id")

	incoming := []FriendRequestItem{}
	outgoing := []FriendRequestItem{}

	rows, err := h.DB.Query(`SELECT id, from_device, to_device, status, created_at FROM friend_requests WHERE to_device = ? ORDER BY created_at DESC`, device)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it FriendRequestItem
			if err := rows.Scan(&it.ID, &it.From, &it.To, &it.Status, &it.CreatedAt); err == nil {
				incoming = append(incoming, it)
			}
		}
	}

	rows2, err2 := h.DB.Query(`SELECT id, from_device, to_device, status, created_at FROM friend_requests WHERE from_device = ? ORDER BY created_at DESC`, device)
	if err2 == nil {
		defer rows2.Close()
		for rows2.Next() {
			var it FriendRequestItem
			if err := rows2.Scan(&it.ID, &it.From, &it.To, &it.Status, &it.CreatedAt); err == nil {
				outgoing = append(outgoing, it)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"incoming": incoming, "outgoing": outgoing})
}

// POST /api/friends/requests/:id/approve
func (h *Handler) ApproveFriendRequest(c *gin.Context) {
	idParam := strings.TrimSpace(c.Param("id"))
	if idParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request id is required"})
		return
	}
	var reqFrom, reqTo, status string
	err := h.DB.QueryRow(`SELECT from_device, to_device, status FROM friend_requests WHERE id = ?`, idParam).Scan(&reqFrom, &reqTo, &status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "friend request not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	me := c.GetString("device_id")
	if reqTo != me {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to approve this request"})
		return
	}
	if status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request is not pending"})
		return
	}

	tx, txErr := h.DB.Begin()
	if txErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if _, err := tx.Exec(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`, idParam); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update request"})
		return
	}

	a, b := reqFrom, reqTo
	if a > b {
		a, b = b, a
	}
	if _, err := tx.Exec(`INSERT IGNORE INTO friends (device_a, device_b) VALUES (?, ?)`, a, b); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create friendship"})
		return
	}

	// mark any reciprocal pending request as accepted
	_, _ = tx.Exec(`UPDATE friend_requests SET status = 'accepted' WHERE from_device = ? AND to_device = ? AND status = 'pending'`, reqTo, reqFrom)

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request approved"})
}

// POST /api/friends/requests/:id/reject
func (h *Handler) RejectFriendRequest(c *gin.Context) {
	idParam := strings.TrimSpace(c.Param("id"))
	if idParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request id is required"})
		return
	}
	var reqTo, status string
	err := h.DB.QueryRow(`SELECT to_device, status FROM friend_requests WHERE id = ?`, idParam).Scan(&reqTo, &status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "friend request not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	me := c.GetString("device_id")
	if reqTo != me {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to reject this request"})
		return
	}
	if status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "request is not pending"})
		return
	}

	if _, err := h.DB.Exec(`UPDATE friend_requests SET status = 'rejected' WHERE id = ?`, idParam); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request rejected"})
}

// GET /api/friends
func (h *Handler) ListFriends(c *gin.Context) {
	me := c.GetString("device_id")
	query := `
		SELECT f.device_a, f.device_b, f.created_at, fn.nickname, COALESCE(u.name, '')
		FROM friends f
		JOIN users u ON u.device_id = (
			CASE WHEN f.device_a = ? THEN f.device_b ELSE f.device_a END
		)
		LEFT JOIN friend_nicknames fn ON fn.owner_device = ? AND fn.friend_device = u.device_id
		WHERE f.device_a = ? OR f.device_b = ?
		ORDER BY f.created_at DESC
	`
	rows, err := h.DB.Query(query, me, me, me, me)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list friends"})
		return
	}
	defer rows.Close()

	friends := []map[string]interface{}{}
	for rows.Next() {
		var a, b string
		var created time.Time
		var nickname sql.NullString
		var name string
		if err := rows.Scan(&a, &b, &created, &nickname, &name); err != nil {
			continue
		}
		other := a
		if other == me {
			other = b
		}
		nick := ""
		if nickname.Valid {
			nick = nickname.String
		}
		friends = append(friends, map[string]interface{}{
			"device_id":  other,
			"name":       name,
			"nickname":   nick,
			"created_at": created,
		})
	}

	c.JSON(http.StatusOK, gin.H{"friends": friends})
}

// POST /api/friends/nickname
func (h *Handler) SetFriendNickname(c *gin.Context) {
	me := c.GetString("device_id")
	var req FriendNicknamePayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "friend_device_id is required"})
		return
	}
	target := strings.TrimSpace(req.FriendDeviceID)
	nickname := strings.TrimSpace(req.Nickname)
	if target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "friend_device_id is required"})
		return
	}

	if nickname == "" {
		_, _ = h.DB.Exec(`DELETE FROM friend_nicknames WHERE owner_device = ? AND friend_device = ?`, me, target)
		c.JSON(http.StatusOK, gin.H{"message": "nickname removed", "nickname": ""})
		return
	}

	_, err := h.DB.Exec(`
		INSERT INTO friend_nicknames (owner_device, friend_device, nickname)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)
	`, me, target, nickname)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save nickname"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "nickname updated", "nickname": nickname})
}

// DELETE /api/friends/:device_id
func (h *Handler) RemoveFriend(c *gin.Context) {
	me := c.GetString("device_id")
	target := strings.TrimSpace(c.Param("device_id"))
	if target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}
	a, b := me, target
	if a > b {
		a, b = b, a
	}
	res, err := h.DB.Exec(`DELETE FROM friends WHERE device_a = ? AND device_b = ?`, a, b)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove friend"})
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "friend relationship not found"})
		return
	}
	// Also clean up private nickname
	_, _ = h.DB.Exec(`DELETE FROM friend_nicknames WHERE (owner_device = ? AND friend_device = ?) OR (owner_device = ? AND friend_device = ?)`, me, target, target, me)

	c.JSON(http.StatusOK, gin.H{"message": "friend removed"})
}

// ─── Submit Friends OTP ───────────────────────────────────────────────────────
// POST /api/friends/submit-otp
// Requires valid session. Submits OTP for logged in user + selected friends.

func (h *Handler) SubmitFriendsOTP(c *gin.Context) {
	me := c.GetString("device_id")

	var req SubmitFriendsOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.OTP) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "otp is required"})
		return
	}

	targetsMap := make(map[string]bool)
	if req.IncludeSelf {
		targetsMap[me] = true
	}

	for _, t := range req.TargetDevices {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if t == me {
			targetsMap[me] = true
			continue
		}
		// Verify friendship
		a, b := me, t
		if a > b {
			a, b = b, a
		}
		var count int
		_ = h.DB.QueryRow(`SELECT COUNT(*) FROM friends WHERE device_a = ? AND device_b = ?`, a, b).Scan(&count)
		if count > 0 {
			targetsMap[t] = true
		}
	}

	if len(targetsMap) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid target devices selected"})
		return
	}

	type TargetResult struct {
		DeviceID string      `json:"device_id"`
		Name     string      `json:"name"`
		Success  bool        `json:"success"`
		Status   int         `json:"status"`
		Data     interface{} `json:"data,omitempty"`
		Error    string      `json:"error,omitempty"`
	}

	results := []TargetResult{}
	for targetDev := range targetsMap {
		var psCookie, name string
		err := h.DB.QueryRow(`SELECT ps_cookie, COALESCE(name, '') FROM users WHERE device_id = ?`, targetDev).Scan(&psCookie, &name)
		if err != nil {
			results = append(results, TargetResult{
				DeviceID: targetDev,
				Name:     name,
				Success:  false,
				Status:   http.StatusNotFound,
				Error:    "user credentials not found",
			})
			continue
		}

		status, respBody, err := h.executeOTPUpstream(psCookie, targetDev, req.OTP)
		if err != nil {
			results = append(results, TargetResult{
				DeviceID: targetDev,
				Name:     name,
				Success:  false,
				Status:   status,
				Error:    err.Error(),
			})
			continue
		}

		var parsedData interface{}
		_ = json.Unmarshal(respBody, &parsedData)

		results = append(results, TargetResult{
			DeviceID: targetDev,
			Name:     name,
			Success:  status == http.StatusOK,
			Status:   status,
			Data:     parsedData,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("OTP processed for %d target(s)", len(results)),
		"results": results,
	})
}

// ─── Utilities ────────────────────────────────────────────────────────────────

func setSessionCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
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
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
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