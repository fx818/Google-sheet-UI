package services

import (
	// "database/sql"
	"go-backend/config"
	"strings"
	"time"
)

type EmployeeMetadata struct {
	ID           string  `json:"id"`
	EmployeeID   string  `json:"employee_id"`
	EmployeeName string  `json:"employee_name"`
	ProjectName  string  `json:"project_name"`
}

type DailyLog struct {
	EmployeeName string `json:"employee_name"`
	TaskDate     string `json:"task_date"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// GetAllEmployeesMetadata fetches static info
func GetAllEmployeesMetadata() ([]EmployeeMetadata, error) {
	db := config.GetDB()
	rows, err := db.Query("SELECT id, employee_id, employee_name, project_name FROM employees")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	employees := []EmployeeMetadata{}
	for rows.Next() {
		var emp EmployeeMetadata
		if err := rows.Scan(&emp.ID, &emp.EmployeeID, &emp.EmployeeName, &emp.ProjectName); err != nil {
			return nil, err
		}
		employees = append(employees, emp)
	}
	return employees, nil
}

// GetAllDailyLogs fetches timestamps for all days
func GetAllDailyLogs() ([]DailyLog, error) {
	db := config.GetDB()
	rows, err := db.Query("SELECT employee_name, task_date, created_at, updated_at FROM daily_logs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := []DailyLog{}
	for rows.Next() {
		var l DailyLog
		var c, u time.Time
		if err := rows.Scan(&l.EmployeeName, &l.TaskDate, &c, &u); err != nil {
			return nil, err
		}
		l.CreatedAt = c.Format(time.RFC3339)
		l.UpdatedAt = u.Format(time.RFC3339)
		logs = append(logs, l)
	}
	return logs, nil
}

// UpsertEmployeeMetadata inserts or updates employee static info
func UpsertEmployeeMetadata(empID, name, project string) error {
	db := config.GetDB()
	// Standardize name to lower case for uniqueness if desired, or keep as is.
	// Current schema uses employee_name as unique key.
	query := `
		INSERT INTO employees (employee_id, employee_name, project_name)
		VALUES ($1, $2, $3)
		ON CONFLICT (employee_name) 
		DO UPDATE SET employee_id = EXCLUDED.employee_id, project_name = EXCLUDED.project_name;
	`
	_, err := db.Exec(query, empID, name, project)
	return err
}

// UpsertDailyLog updates the timestamp for a specific day
// Logic: If row exists (same name+date), ONLY update updated_at.
// If row doesn't exist, insert with created_at = NOW().
func UpsertDailyLog(name, date string) error {
	db := config.GetDB()
	
	// We trim space to avoid " John" vs "John" issues
	cleanName := strings.TrimSpace(name)
	cleanDate := strings.TrimSpace(date)

	// Note: We are relying on the DB unique constraint (employee_name, task_date).
	// If casing differs ("John" vs "john"), postgres treats them as different values unless column is citext or we lower().
	// For now, we assume the frontend sends consistent names (e.g. from the sheet).
	
	query := `
		INSERT INTO daily_logs (employee_name, task_date, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (employee_name, task_date) 
		DO UPDATE SET updated_at = NOW(); 
	`
	// The DO UPDATE clause specifically does NOT touch created_at, preventing overwrite.
	
	_, err := db.Exec(query, cleanName, cleanDate)
	return err
}