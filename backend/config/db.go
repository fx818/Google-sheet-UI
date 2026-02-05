package config

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

// Connection string for NeonDB
const connectionString = "postgres://neondb_owner:npg_h7cagUZXCp1q@ep-royal-firefly-ah9zoqad-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

func InitDB() {
	var err error
	DB, err = sql.Open("postgres", connectionString)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	// --- AUTO MIGRATION ---
	
	// 1. Employees Table
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

	// 2. Daily Logs Table
	createLogsTable := `
	CREATE TABLE IF NOT EXISTS daily_logs (
		id SERIAL PRIMARY KEY,
		employee_name TEXT NOT NULL,
		task_date TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);`
	if _, err = DB.Exec(createLogsTable); err != nil {
		log.Fatal("Failed to create daily_logs table:", err)
	}

	// 3. CLEANUP DUPLICATES (Case-Insensitive Fix)
	// This deletes rows where the name is the same (ignoring case) and date is same,
	// keeping only the one with the smallest ID (the original one).
	cleanupQuery := `
	DELETE FROM daily_logs a 
	USING daily_logs b 
	WHERE a.id > b.id 
	AND LOWER(a.employee_name) = LOWER(b.employee_name) 
	AND a.task_date = b.task_date;
	`
	if _, err = DB.Exec(cleanupQuery); err != nil {
		log.Println("Warning: Failed to cleanup duplicate logs:", err)
	}

	// 4. CREATE CASE-INSENSITIVE INDEX
	// First, drop the old strict index if it exists
	_, _ = DB.Exec("DROP INDEX IF EXISTS idx_daily_logs_unique")

	// Create a new unique index that normalizes names to lowercase
	createIndexQuery := `
	CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_unique_ci 
	ON daily_logs (LOWER(employee_name), task_date);
	`
	if _, err = DB.Exec(createIndexQuery); err != nil {
		log.Fatal("Failed to create unique index for daily_logs:", err)
	}

	fmt.Println("Connected to NeonDB, cleaned duplicates, and ensured CASE-INSENSITIVE constraints!")
}

func GetDB() *sql.DB {
	return DB
}