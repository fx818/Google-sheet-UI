// models/models.go
package models

// TaskItem represents a single task with its status
type TaskItem struct {
	Task   string `json:"task"`
	Status string `json:"status"` // "todo", "pending", "complete"
}

// TaskRequest represents the payload for adding new tasks
type TaskRequest struct {
	EmployeeName string     `json:"employee_name"`
	Role         string     `json:"role"` // "Dev" or "Managers"
	Date         string     `json:"date"` // Optional: "Mon 02-Jan"
	Tasks        []TaskItem `json:"tasks"`
}

// DayTasks represents tasks for a specific date, categorized by status
type DayTasks struct {
	Date     string   `json:"date"`
	Todo     []string `json:"todo"`
	Pending  []string `json:"pending"`
	Complete []string `json:"complete"`
}

// EmployeeTasksResponse is the structure for returning an employee's history
type EmployeeTasksResponse struct {
	EmployeeName string     `json:"employee_name"`
	SheetName    string     `json:"sheet_name"` // Added to track source sheet
	History      []DayTasks `json:"history"`
}