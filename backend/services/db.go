package services

import (
	"fmt"
	"go-backend/config"
	"strings"
	"sync"
	"time"

	"google.golang.org/api/sheets/v4"
)

type EmployeeMetadata struct {
	ID           string  `json:"id"` // Just row index for frontend compatibility
	EmployeeID   string  `json:"employee_id"`
	EmployeeName string  `json:"employee_name"`
	ProjectName  string  `json:"project_name"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    *string `json:"updated_at"`
}

type DailyLog struct {
	EmployeeName string `json:"employee_name"`
	TaskDate     string `json:"task_date"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// Mutex to handle concurrency for our "Sheet DB"
var dbMutex sync.Mutex

// GetAllEmployeesMetadata reads from "database" sheet
func GetAllEmployeesMetadata() ([]EmployeeMetadata, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return nil, err
	}

	// Read all data skipping header
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A2:E", config.SheetDBEmployees)).Do()
	if err != nil {
		return nil, err
	}

	employees := []EmployeeMetadata{}
	for i, row := range resp.Values {
		// Expecting: Name, ID, Project, Created, Updated
		if len(row) < 3 {
			continue
		}
		
		emp := EmployeeMetadata{
			ID:           fmt.Sprintf("%d", i+2), // Row number
			EmployeeName: fmt.Sprintf("%v", row[0]),
			EmployeeID:   fmt.Sprintf("%v", row[1]),
			ProjectName:  fmt.Sprintf("%v", row[2]),
		}
		if len(row) > 3 {
			emp.CreatedAt = fmt.Sprintf("%v", row[3])
		}
		if len(row) > 4 {
			upd := fmt.Sprintf("%v", row[4])
			emp.UpdatedAt = &upd
		}
		employees = append(employees, emp)
	}
	return employees, nil
}

// GetAllDailyLogs reads from "database_logs" sheet
func GetAllDailyLogs() ([]DailyLog, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return nil, err
	}

	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A2:D", config.SheetDBLogs)).Do()
	if err != nil {
		return nil, err
	}

	logs := []DailyLog{}
	for _, row := range resp.Values {
		// Expecting: Name, Date, Created, Updated
		if len(row) < 4 {
			continue
		}
		logs = append(logs, DailyLog{
			EmployeeName: fmt.Sprintf("%v", row[0]),
			TaskDate:     fmt.Sprintf("%v", row[1]),
			CreatedAt:    fmt.Sprintf("%v", row[2]),
			UpdatedAt:    fmt.Sprintf("%v", row[3]),
		})
	}
	return logs, nil
}

// UpsertEmployeeMetadata updates or inserts employee info in "database" sheet
func UpsertEmployeeMetadata(empID, name, project string) error {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	srv, err := config.GetSheetsService()
	if err != nil {
		return err
	}

	// 1. Read existing data to check for duplicates
	readRange := fmt.Sprintf("'%s'!A:A", config.SheetDBEmployees)
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, readRange).Do()
	if err != nil {
		return err
	}

	cleanName := strings.TrimSpace(name)
	rowIndex := -1

	// Find row by Name (Column A)
	for i, row := range resp.Values {
		if len(row) > 0 && strings.EqualFold(fmt.Sprintf("%v", row[0]), cleanName) {
			rowIndex = i
			break
		}
	}

	now := time.Now().Format(time.RFC3339)

	if rowIndex != -1 {
		// UPDATE existing row
		// Columns: Name(A), ID(B), Project(C), Created(D), Updated(E)
		// We update ID, Project, Updated. We preserve Name and Created.
		
		// Row index in API is 1-based, slice is 0-based.
		// A1 notation: Row 1 is header. rowIndex 0 in slice is Row 1.
		// So slice index i = Row i+1.
		
		updateRange := fmt.Sprintf("'%s'!B%d:C%d", config.SheetDBEmployees, rowIndex+1, rowIndex+1)
		vr := &sheets.ValueRange{
			Values: [][]interface{}{{empID, project}},
		}
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, updateRange, vr).ValueInputOption("RAW").Do()
		if err != nil { return err }

		// Update Timestamp separately (Col E)
		tsRange := fmt.Sprintf("'%s'!E%d", config.SheetDBEmployees, rowIndex+1)
		vrTs := &sheets.ValueRange{Values: [][]interface{}{{now}}}
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, tsRange, vrTs).ValueInputOption("RAW").Do()
		return err

	} else {
		// INSERT new row
		// Name, ID, Project, Created, Updated
		vr := &sheets.ValueRange{
			Values: [][]interface{}{{cleanName, empID, project, now, now}},
		}
		_, err = srv.Spreadsheets.Values.Append(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", config.SheetDBEmployees), vr).ValueInputOption("RAW").Do()
		return err
	}
}

// UpsertDailyLog updates or inserts log in "database_logs" sheet
func UpsertDailyLog(name, date string) error {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	srv, err := config.GetSheetsService()
	if err != nil {
		return err
	}

	// 1. Read Name(A) and Date(B) columns
	readRange := fmt.Sprintf("'%s'!A:B", config.SheetDBLogs)
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, readRange).Do()
	if err != nil {
		return err
	}

	cleanName := strings.TrimSpace(name)
	cleanDate := strings.TrimSpace(date)
	rowIndex := -1

	// Find match on Name AND Date
	for i, row := range resp.Values {
		if len(row) >= 2 {
			rowName := fmt.Sprintf("%v", row[0])
			rowDate := fmt.Sprintf("%v", row[1])
			
			if strings.EqualFold(rowName, cleanName) && strings.EqualFold(rowDate, cleanDate) {
				rowIndex = i
				break
			}
		}
	}

	now := time.Now().Format(time.RFC3339)

	if rowIndex != -1 {
		// UPDATE existing row
		// Cols: Name(A), Date(B), Created(C), Updated(D)
		// Only update Updated(D). created_at MUST persist.
		
		updateRange := fmt.Sprintf("'%s'!D%d", config.SheetDBLogs, rowIndex+1)
		vr := &sheets.ValueRange{
			Values: [][]interface{}{{now}},
		}
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, updateRange, vr).ValueInputOption("RAW").Do()
		return err

	} else {
		// INSERT new row
		// Name, Date, Created, Updated
		vr := &sheets.ValueRange{
			Values: [][]interface{}{{cleanName, cleanDate, now, now}},
		}
		_, err = srv.Spreadsheets.Values.Append(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", config.SheetDBLogs), vr).ValueInputOption("RAW").Do()
		return err
	}
}

// UpdateTimestamp updates only the updated_at field for an employee in "database"
func UpdateTimestamp(name string) error {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	srv, err := config.GetSheetsService()
	if err != nil {
		return err
	}

	// Read Names
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", config.SheetDBEmployees)).Do()
	if err != nil { return err }

	cleanName := strings.TrimSpace(name)
	rowIndex := -1

	for i, row := range resp.Values {
		if len(row) > 0 && strings.EqualFold(fmt.Sprintf("%v", row[0]), cleanName) {
			rowIndex = i
			break
		}
	}

	if rowIndex != -1 {
		now := time.Now().Format(time.RFC3339)
		tsRange := fmt.Sprintf("'%s'!E%d", config.SheetDBEmployees, rowIndex+1)
		vr := &sheets.ValueRange{Values: [][]interface{}{{now}}}
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, tsRange, vr).ValueInputOption("RAW").Do()
		return err
	}
	
	// If not found, we generally ignore or error. Ignoring allows lazy creation on next UpsertMetadata.
	return nil
}