package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"server/config"
	"server/handlers"
	"server/middleware"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	db, err := config.Init()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := config.Migrate(db); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	r := gin.Default()
	r.Use(func(c *gin.Context) {
		corsEnv := os.Getenv("CORS_ORIGIN")
		if corsEnv == "" {
			corsEnv = "http://localhost:5173"
		}

		// Build allowed origins set from comma-separated env var
		allowed := map[string]struct{}{}
		for _, part := range strings.Split(corsEnv, ",") {
			p := strings.TrimSpace(part)
			if p != "" {
				allowed[p] = struct{}{}
			}
		}

		// Determine which origin to echo back. If wildcard present, allow all.
		reqOrigin := c.Request.Header.Get("Origin")
		if _, ok := allowed["*"]; ok {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "false")
		} else if reqOrigin != "" {
			if _, ok := allowed[reqOrigin]; ok {
				c.Writer.Header().Set("Access-Control-Allow-Origin", reqOrigin)
				c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Set-Cookie")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, Set-Cookie")

		// Handle preflight requests
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})
	h := handlers.New(db)

	// Auth routes — no session required
	auth := r.Group("/auth")
	{
		auth.POST("/login", h.Login)   // get persistent session token
		auth.POST("/logout", h.Logout) // invalidate token
		auth.GET("/me", middleware.RequireSession(db), h.CurrentUser)
	}

	// Protected routes — require valid session token
	api := r.Group("/api")
	api.Use(middleware.RequireSession(db))
	{
		api.POST("/otp", h.ProxyOTP)
		api.GET("/attendance", h.ProxyAttendance)
		api.GET("/pending-action", h.ProxyPendingAction)
		api.GET("/activity", h.ProxyActivity)
		api.GET("/activity/details", h.ProxyActivityDetails)
		api.GET("/activity/survey/questions", h.ProxyGetSurveyQuestions)
		api.POST("/activity/survey/submit", h.ProxySubmitSurvey)
		api.GET("/profile", h.ProxyProfile)
		api.GET("/points/leaderboard", h.ProxyRewardsLeaderboard)
		api.GET("/points/opportunities/history", h.ProxyRewardsOpportunitiesHistory)
		api.GET("/user/images", h.ProxyUserImage)
		api.GET("/user-image", h.ProxyUserImage)
		api.GET("/notifications", h.ProxyNotifications)
		api.GET("/ps_app_v3/notification", h.ProxyNotifications)
		api.GET("/share", h.GetShareToken)
		api.POST("/share/create", h.CreateShareToken)
		api.DELETE("/share/revoke", h.RevokeShareToken)

		// Friends
		api.POST("/friends/request", h.SendFriendRequest)
		api.GET("/friends/requests", h.GetFriendRequests)
		api.POST("/friends/requests/:id/approve", h.ApproveFriendRequest)
		api.POST("/friends/requests/:id/reject", h.RejectFriendRequest)
		api.GET("/friends", h.ListFriends)
		api.DELETE("/friends/:device_id", h.RemoveFriend)
		api.POST("/friends/nickname", h.SetFriendNickname)
		api.POST("/friends/submit-otp", h.SubmitFriendsOTP)
	}

	admin := api.Group("/admin")
	admin.Use(middleware.RequireAdmin())
	{
		admin.GET("/users", h.ListUsers)
		admin.POST("/users", h.CreateUser)
		admin.POST("/users/:device_id/password", h.UpdateUserPassword)
		admin.PATCH("/users/:device_id/password", h.UpdateUserPassword)
		admin.POST("/users/:device_id/name", h.UpdateUserName)
		admin.PATCH("/users/:device_id/name", h.UpdateUserName)
		admin.DELETE("/users/:device_id", h.DeleteUser)
	}

	share := r.Group("/share")
	{
		share.GET("/:token/info", h.ShareTokenInfo) // frontend checks validity
		share.POST("/:token/otp", h.ShareProxyOTP)  // anyone submits OTP
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.GET("/health", func(c *gin.Context) {
		// Check DB connection
		if err := db.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":   "down",
				"database": "disconnected",
				"error":    err.Error(),
				"time":     time.Now().Format(time.RFC3339),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"database": "connected",
			"time":     time.Now().Format(time.RFC3339),
		})
	})

	log.Printf("Server running on :%s", port)
	r.Run(":" + port)
}