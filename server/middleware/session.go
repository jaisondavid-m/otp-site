package middleware

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RequireSession validates the session token from Authorization header or cookie,
// then loads ps_cookie + device_id into the context for handlers to use.
func RequireSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing session token — please login first",
			})
			return
		}

		var deviceID, psCookie string
		err := db.QueryRow(`
			SELECT s.device_id, u.ps_cookie
			FROM sessions s
			JOIN users u ON u.device_id = s.device_id
			WHERE s.token = ?
		`, token).Scan(&deviceID, &psCookie)

		if err == sql.ErrNoRows {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired session — please login again",
			})
			return
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": "session validation failed",
			})
			return
		}

		c.Set("device_id", deviceID)
		c.Set("ps_cookie", psCookie)
		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	token, _ := c.Cookie("session_token")
	return token
}