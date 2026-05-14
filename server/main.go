package main

import (
	"log"
	"net/http"
	"os"

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
		origin := os.Getenv("CORS_ORIGIN")
		if origin == "" {
			origin = "http://localhost:5173"
		}

		// Set CORS headers for all responses
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
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
		auth.POST("/register", h.Register) // one-time: store device_id + ps_cookie
		auth.POST("/login", h.Login)       // get persistent session token
		auth.POST("/logout", h.Logout)     // invalidate token
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
		api.GET("/profile", h.ProxyProfile)
		api.POST("/share/create", h.CreateShareToken)
		api.DELETE("/share/revoke", h.RevokeShareToken)
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

	log.Printf("Server running on :%s", port)
	r.Run(":" + port)
}
