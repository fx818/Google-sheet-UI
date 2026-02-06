package config

import (
	"fmt"
	"log"

	"google.golang.org/api/sheets/v4"
)

// Sheet Names for "Database" functionality
const (
	SheetDBEmployees = "database"      // Metadata: Name, Created, Updated
	SheetDBLogs      = "database_logs" // Logs: Name, Date, Created, Updated
)

// InitDB ensures the "database" and "database_logs" sheets exist with headers
func InitDB() {
	srv, err := GetSheetsService()
	if err != nil {
		log.Fatal("Unable to retrieve Sheets client for DB init: ", err)
	}

	// 1. Check/Create "database" (Employees) - Removed ID/Project
	if err := ensureSheet(srv, SheetDBEmployees, []interface{}{"Employee Name", "Created At", "Updated At"}); err != nil {
		log.Fatalf("Failed to init %s: %v", SheetDBEmployees, err)
	}

	// 2. Check/Create "database_logs" (Daily Logs)
	if err := ensureSheet(srv, SheetDBLogs, []interface{}{"Employee Name", "Task Date", "Created At", "Updated At"}); err != nil {
		log.Fatalf("Failed to init %s: %v", SheetDBLogs, err)
	}

	fmt.Println("Google Sheets 'Database' initialized successfully!")
}

// ensureSheet checks if a sheet exists, creates it if not, and adds headers if empty
func ensureSheet(srv *sheets.Service, title string, headers []interface{}) error {
	// Get Spreadsheet Metadata
	meta, err := srv.Spreadsheets.Get(SpreadsheetID).Do()
	if err != nil {
		return err
	}

	sheetExists := false
	var sheetID int64
	println(sheetID)

	for _, s := range meta.Sheets {
		if s.Properties.Title == title {
			sheetExists = true
			sheetID = s.Properties.SheetId
			break
		}
	}

	// Create Sheet if not exists
	if !sheetExists {
		req := &sheets.BatchUpdateSpreadsheetRequest{
			Requests: []*sheets.Request{
				{
					AddSheet: &sheets.AddSheetRequest{
						Properties: &sheets.SheetProperties{
							Title: title,
						},
					},
				},
			},
		}
		resp, err := srv.Spreadsheets.BatchUpdate(SpreadsheetID, req).Do()
		if err != nil {
			return fmt.Errorf("failed to create sheet %s: %v", title, err)
		}
		sheetID = resp.Replies[0].AddSheet.Properties.SheetId
		fmt.Printf("Created sheet: %s\n", title)
	}

	// Check headers
	readRange := fmt.Sprintf("'%s'!1:1", title)
	resp, err := srv.Spreadsheets.Values.Get(SpreadsheetID, readRange).Do()
	if err != nil {
		return err
	}

	if len(resp.Values) == 0 {
		// Write Headers
		vr := &sheets.ValueRange{
			Values: [][]interface{}{headers},
		}
		_, err := srv.Spreadsheets.Values.Update(SpreadsheetID, fmt.Sprintf("'%s'!A1", title), vr).ValueInputOption("RAW").Do()
		if err != nil {
			return fmt.Errorf("failed to write headers to %s: %v", title, err)
		}
		fmt.Printf("Added headers to: %s\n", title)
	}

	return nil
}