package config

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	mysql "github.com/go-sql-driver/mysql"
)

func Init() (*sql.DB, error) {
	primary, err := openDB(
		getEnv("DB_USER", "root"),
		getEnv("DB_PASS", "password"),
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "3306"),
		getEnv("DB_NAME", "ps_app"),
		getEnv("DB_TLS_CA_FILE", filepath.Join("certs", "tidb-ca.pem")),
	)
	if err == nil {
		return primary, nil
	}

	if getEnv("DB_HOST", "localhost") == "localhost" && getEnv("DB_PORT", "3306") == "3306" {
		return nil, err
	}

	fallback, fallbackErr := openDB(
		getEnv("DB_USER", "root"),
		getEnv("DB_PASS", "password"),
		"localhost",
		"3306",
		getEnv("DB_NAME", "ps_app"),
		"",
	)
	if fallbackErr == nil {
		return fallback, nil
	}

	return nil, fmt.Errorf("primary db connection failed: %w; fallback db connection failed: %v", err, fallbackErr)
}

func openDB(user, pass, host, port, name, caPath string) (*sql.DB, error) {
	tlsName := ""
	if caPath != "" {
		registered, err := registerTiDBTLSConfig(caPath)
		if err != nil {
			return nil, err
		}
		tlsName = registered
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true", user, pass, host, port, name)
	if tlsName != "" {
		dsn += "&tls=" + tlsName
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func registerTiDBTLSConfig(caPath string) (string, error) {
	caPEM, err := os.ReadFile(caPath)
	if err != nil {
		return "", fmt.Errorf("read TiDB CA file %q: %w", caPath, err)
	}

	rootCAs := x509.NewCertPool()
	if ok := rootCAs.AppendCertsFromPEM(caPEM); !ok {
		return "", fmt.Errorf("parse TiDB CA certificate from %q", caPath)
	}

	tlsConfig := &tls.Config{RootCAs: rootCAs, MinVersion: tls.VersionTLS12}
	if err := mysql.RegisterTLSConfig("tidb", tlsConfig); err != nil {
		return "", err
	}

	return "tidb", nil
}

func Migrate(db *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id           INT AUTO_INCREMENT PRIMARY KEY,
			device_id    VARCHAR(255) NOT NULL UNIQUE,
			name         VARCHAR(255) DEFAULT '',
			ps_cookie    VARCHAR(512) NOT NULL,
			username     VARCHAR(255) UNIQUE DEFAULT NULL,
			password     VARCHAR(255) DEFAULT '',
			created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id           INT AUTO_INCREMENT PRIMARY KEY,
			device_id    VARCHAR(255) NOT NULL UNIQUE,
			token        VARCHAR(512) NOT NULL UNIQUE,
			created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (device_id) REFERENCES users(device_id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS share_tokens (
			token        VARCHAR(64)  PRIMARY KEY,
			device_id    VARCHAR(255) NOT NULL,
			targets_json TEXT         NULL,
			expires_at   DATETIME     NOT NULL,
			created_at   DATETIME     DEFAULT NOW(),
			FOREIGN KEY (device_id) REFERENCES users(device_id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS friend_requests (
			id INT AUTO_INCREMENT PRIMARY KEY,
			from_device VARCHAR(255) NOT NULL,
			to_device VARCHAR(255) NOT NULL,
			status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
			created_at DATETIME DEFAULT NOW(),
			updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
			FOREIGN KEY (from_device) REFERENCES users(device_id) ON DELETE CASCADE,
			FOREIGN KEY (to_device) REFERENCES users(device_id) ON DELETE CASCADE,
			UNIQUE KEY unique_request (from_device, to_device)
		)`,
		`CREATE TABLE IF NOT EXISTS friends (
			id INT AUTO_INCREMENT PRIMARY KEY,
			device_a VARCHAR(255) NOT NULL,
			device_b VARCHAR(255) NOT NULL,
			created_at DATETIME DEFAULT NOW(),
			FOREIGN KEY (device_a) REFERENCES users(device_id) ON DELETE CASCADE,
			FOREIGN KEY (device_b) REFERENCES users(device_id) ON DELETE CASCADE,
			UNIQUE KEY unique_pair (device_a, device_b)
		)`,
		`CREATE TABLE IF NOT EXISTS friend_nicknames (
			owner_device VARCHAR(255) NOT NULL,
			friend_device VARCHAR(255) NOT NULL,
			nickname VARCHAR(100) NOT NULL,
			created_at DATETIME DEFAULT NOW(),
			updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
			PRIMARY KEY (owner_device, friend_device),
			FOREIGN KEY (owner_device) REFERENCES users(device_id) ON DELETE CASCADE,
			FOREIGN KEY (friend_device) REFERENCES users(device_id) ON DELETE CASCADE
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}
	// Best-effort column addition for existing databases
	_, _ = db.Exec(`ALTER TABLE share_tokens ADD COLUMN targets_json TEXT NULL`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN name VARCHAR(255) DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN username VARCHAR(255) DEFAULT NULL`)
	_, _ = db.Exec(`ALTER TABLE users ADD UNIQUE INDEX idx_username (username)`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN password VARCHAR(255) DEFAULT ''`)
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
