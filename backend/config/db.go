package config

import (
	"database/sql"
	"fmt"
	"log"
	// "os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

// Connection string for NeonDB
// var connectionString, _ = os.LookupEnv("NEON_DB_CONNECTION_STRING")

const connectionString="postgresql://neondb_owner:npg_h7cagUZXCp1q@ep-royal-firefly-ah9zoqad-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

// InitDB initializes the database connection and performs auto-migration.
func InitDB() {
	var err error
	DB, err = sql.Open("postgres", connectionString)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	if connectionString == "" {
		log.Fatal("NEON_DB_CONNECTION_STRING environment variable is not set")
	}
	if err = DB.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err, connectionString)
	}

	// --- AUTO MIGRATION ---

	// 1. Employees Table (Static Info)
	createEmployeesTable := `
	CREATE TABLE IF NOT EXISTS employees (
		id SERIAL PRIMARY KEY,
		employee_id TEXT NOT NULL,
		employee_name TEXT NOT NULL UNIQUE,
		project_name TEXT,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);`
	if _, err = DB.Exec(createEmployeesTable); err != nil {
		log.Fatal("Failed to create employees table:", err)
	}

	// 2. Daily Logs Table (Per Day Timestamps)
	// Tracks when tasks for a specific date (column) were first created and last modified
	createLogsTable := `
	CREATE TABLE IF NOT EXISTS daily_logs (
		id SERIAL PRIMARY KEY,
		employee_name TEXT NOT NULL,
		task_date TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW(),
		UNIQUE(employee_name, task_date)
	);`
	if _, err = DB.Exec(createLogsTable); err != nil {
		log.Fatal("Failed to create daily_logs table:", err)
	}

	fmt.Println("Connected to NeonDB and ensured tables exist!")
}

func GetDB() *sql.DB {
	return DB
}
