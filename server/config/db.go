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
	tlsName, err := registerTiDBTLSConfig()
	if err != nil {
		return nil, err
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&tls=%s",
		getEnv("DB_USER", "root"),
		getEnv("DB_PASS", "password"),
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "3306"),
		getEnv("DB_NAME", "ps_app"),
		tlsName,
	)
	return sql.Open("mysql", dsn)
}

func registerTiDBTLSConfig() (string, error) {
	caPath := getEnv("DB_TLS_CA_FILE", filepath.Join("certs", "tidb-ca.pem"))
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
			ps_cookie    VARCHAR(512) NOT NULL,
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
			token      VARCHAR(64)  PRIMARY KEY,
			device_id  VARCHAR(255) NOT NULL,
			expires_at DATETIME     NOT NULL,
			created_at DATETIME     DEFAULT NOW(),
			FOREIGN KEY (device_id) REFERENCES users(device_id) ON DELETE CASCADE
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
