// services/sheets.go
package services

import (
	"fmt"
	"go-backend/config"
	"go-backend/models"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"google.golang.org/api/sheets/v4"
)

// Target specific sheets (Exact names as provided)
var targetSheets = []string{"DEV", "Managers"}

// Helper: Exact Name Match
func namesMatch(sheetName, searchName string) bool {
	return strings.EqualFold(strings.TrimSpace(sheetName), strings.TrimSpace(searchName))
}

// Helper: Find sheet by title (case-insensitive)
func findSheetByTitle(meta *sheets.Spreadsheet, title string) *sheets.Sheet {
	for _, sheet := range meta.Sheets {
		if strings.EqualFold(sheet.Properties.Title, title) {
			return sheet
		}
	}
	return nil
}

// Helper: Determine status from color
func getStatusFromColor(color *sheets.Color) string {
	if color == nil {
		return "todo"
	}

	targetGreenR := 52.0 / 255.0
	targetGreenG := 168.0 / 255.0
	targetGreenB := 83.0 / 255.0

	targetPendingR := 231.0 / 255.0
	targetPendingG := 149.0 / 255.0
	targetPendingB := 63.0 / 255.0

	const tol = 0.25

	if math.Abs(color.Red-targetGreenR) < tol &&
		math.Abs(color.Green-targetGreenG) < tol &&
		math.Abs(color.Blue-targetGreenB) < tol {
		return "complete"
	}

	if math.Abs(color.Red-targetPendingR) < tol &&
		math.Abs(color.Green-targetPendingG) < tol &&
		math.Abs(color.Blue-targetPendingB) < tol {
		return "pending"
	}

	// Legacy checks
	if color.Green > 0.8 && color.Red < 0.3 && color.Blue < 0.3 {
		return "complete"
	}
	if color.Red > 0.8 && color.Green < 0.3 && color.Blue < 0.3 {
		return "pending"
	}

	return "todo"
}

// Helper: Determine color from status
func getColorFromStatus(status string) *sheets.Color {
	switch strings.ToLower(status) {
	case "complete":
		return &sheets.Color{Red: 52.0 / 255.0, Green: 168.0 / 255.0, Blue: 83.0 / 255.0}
	case "pending":
		return &sheets.Color{Red: 231.0 / 255.0, Green: 149.0 / 255.0, Blue: 63.0 / 255.0}
	default:
		return &sheets.Color{Red: 0.0, Green: 0.0, Blue: 0.0}
	}
}

// Helper: Parse cell data into categorized tasks
func parseCellToDayTasks(date string, cellData *sheets.CellData) models.DayTasks {
	dt := models.DayTasks{
		Date:     date,
		Todo:     []string{},
		Pending:  []string{},
		Complete: []string{},
	}

	if cellData == nil || cellData.UserEnteredValue == nil || cellData.UserEnteredValue.StringValue == nil {
		return dt
	}

	text := *cellData.UserEnteredValue.StringValue
	if text == "" {
		return dt
	}

	lines := strings.Split(text, "\n")
	runs := cellData.TextFormatRuns

	var globalColor *sheets.Color
	if cellData.UserEnteredFormat != nil && cellData.UserEnteredFormat.TextFormat != nil {
		globalColor = cellData.UserEnteredFormat.TextFormat.ForegroundColor
	}

	currentIdx := 0
	for _, line := range lines {
		lineLen := len(line)
		status := "todo"

		if len(runs) > 0 {
			var activeColor *sheets.Color
			for _, run := range runs {
				if run.StartIndex <= int64(currentIdx) {
					if run.Format != nil {
						activeColor = run.Format.ForegroundColor
					} else {
						activeColor = nil
					}
				} else {
					break
				}
			}
			status = getStatusFromColor(activeColor)
		} else if globalColor != nil {
			status = getStatusFromColor(globalColor)
		}

		cleanLine := strings.TrimSpace(line)
		if cleanLine != "" {
			switch status {
			case "complete":
				dt.Complete = append(dt.Complete, cleanLine)
			case "pending":
				dt.Pending = append(dt.Pending, cleanLine)
			default:
				dt.Todo = append(dt.Todo, cleanLine)
			}
		}
		currentIdx += lineLen + 1
	}

	return dt
}

// Helper: Fetch data from a single sheet
func fetchSheetData(srv *sheets.Service, sheetTitle string, employeeName string) ([]models.DayTasks, string, error) {
	// 1. Fetch Header Row
	respHeader, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!1:1", sheetTitle)).Do()
	if err != nil {
		return nil, "", err
	}
	if len(respHeader.Values) == 0 {
		return nil, "", nil
	}
	headerRow := respHeader.Values[0]

	// 2. Fetch All Values (Lightweight) to find row
	respValues, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", sheetTitle)).Do()
	if err != nil {
		return nil, "", err
	}

	rowIndex := -1
	var fullEmployeeName string

	for i, row := range respValues.Values {
		if len(row) > 0 {
			name := fmt.Sprintf("%v", row[0])
			if namesMatch(name, employeeName) {
				rowIndex = i
				fullEmployeeName = name
				break
			}
		}
	}

	if rowIndex == -1 {
		return nil, "", nil
	}

	// 3. Fetch Specific Row with Formatting
	req := srv.Spreadsheets.Get(config.SpreadsheetID).
		Ranges(fmt.Sprintf("'%s'!A%d:ZZ%d", sheetTitle, rowIndex+1, rowIndex+1)).
		IncludeGridData(true).
		Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns,userEnteredFormat(textFormat(foregroundColor))))))")

	resp, err := req.Do()
	if err != nil {
		return nil, "", err
	}

	var sheetHistory []models.DayTasks

	if len(resp.Sheets) > 0 && len(resp.Sheets[0].Data) > 0 && len(resp.Sheets[0].Data[0].RowData) > 0 {
		rowCells := resp.Sheets[0].Data[0].RowData[0].Values

		for i := len(rowCells) - 1; i >= 1; i-- {
			cell := rowCells[i]
			if cell.UserEnteredValue == nil || cell.UserEnteredValue.StringValue == nil || *cell.UserEnteredValue.StringValue == "" {
				continue
			}

			dateStr := "Unknown"
			if i < len(headerRow) {
				dateStr = fmt.Sprintf("%v", headerRow[i])
			}

			dayTask := parseCellToDayTasks(dateStr, cell)
			sheetHistory = append(sheetHistory, dayTask)
		}
	}
	return sheetHistory, fullEmployeeName, nil
}

// GetLatestTasks fetches tasks from specific sheets (DEV, Managers)
func GetLatestTasks(employeeName string) (models.EmployeeTasksResponse, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
	}

	meta, err := srv.Spreadsheets.Get(config.SpreadsheetID).Do()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
	}

	var allHistory []models.DayTasks
	var foundName string
	var foundSheet string
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, targetTitle := range targetSheets {
		// Use actual title from meta if exists (handles casing)
		sheet := findSheetByTitle(meta, targetTitle)
		if sheet == nil {
			continue 
		}
		
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			hist, name, err := fetchSheetData(srv, title, employeeName)
			if err == nil && len(hist) > 0 {
				mu.Lock()
				allHistory = append(allHistory, hist...)
				if foundName == "" && name != "" {
					foundName = name
					foundSheet = title
				}
				mu.Unlock()
			}
		}(sheet.Properties.Title)
	}
	wg.Wait()

	if len(allHistory) == 0 {
		return models.EmployeeTasksResponse{}, fmt.Errorf("employee '%s' not found in DEV or Managers sheets", employeeName)
	}

	return models.EmployeeTasksResponse{
		EmployeeName: foundName,
		SheetName:    foundSheet,
		History:      allHistory,
	}, nil
}

// GetAllEmployeesLatestTasks fetches from "DEV" and "Managers" sheets
func GetAllEmployeesLatestTasks() ([]models.EmployeeTasksResponse, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return nil, err
	}

	meta, err := srv.Spreadsheets.Get(config.SpreadsheetID).Do()
	if err != nil {
		return nil, err
	}

	var allEmployees []models.EmployeeTasksResponse
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, targetTitle := range targetSheets {
		sheet := findSheetByTitle(meta, targetTitle)
		if sheet == nil {
			continue
		}
		
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			
			req := srv.Spreadsheets.Get(config.SpreadsheetID).
				Ranges(fmt.Sprintf("'%s'!A:ZZ", title)).
				IncludeGridData(true).
				Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns,userEnteredFormat(textFormat(foregroundColor))))))")
			
			resp, err := req.Do()
			if err != nil { return }

			// Headers
			respHeader, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!1:1", title)).Do()
			if err != nil || len(respHeader.Values) == 0 { return }
			headerRow := respHeader.Values[0]

			var sheetEmployees []models.EmployeeTasksResponse

			if len(resp.Sheets) > 0 && len(resp.Sheets[0].Data) > 0 {
				rows := resp.Sheets[0].Data[0].RowData
				
				for rIdx, row := range rows {
					if rIdx == 0 { continue }
					
					if len(row.Values) == 0 || row.Values[0].UserEnteredValue == nil || row.Values[0].UserEnteredValue.StringValue == nil {
						continue
					}
					empName := *row.Values[0].UserEnteredValue.StringValue
					if empName == "" { continue }

					var localHist []models.DayTasks
					count := 0 
					
					for cIdx := len(row.Values) - 1; cIdx >= 1; cIdx-- {
						if count >= 7 { break }
						
						cell := row.Values[cIdx]
						if cell.UserEnteredValue == nil || cell.UserEnteredValue.StringValue == nil || *cell.UserEnteredValue.StringValue == "" {
							continue
						}

						dateStr := "Unknown"
						if cIdx < len(headerRow) {
							dateStr = fmt.Sprintf("%v", headerRow[cIdx])
						}

						dayTask := parseCellToDayTasks(dateStr, cell)
						localHist = append(localHist, dayTask)
						count++
					}

					sheetEmployees = append(sheetEmployees, models.EmployeeTasksResponse{
						EmployeeName: empName,
						SheetName:    title,
						History:      localHist,
					})
				}
			}

			mu.Lock()
			allEmployees = append(allEmployees, sheetEmployees...)
			mu.Unlock()

		}(sheet.Properties.Title)
	}
	wg.Wait()
	
	sort.Slice(allEmployees, func(i, j int) bool {
		return allEmployees[i].EmployeeName < allEmployees[j].EmployeeName
	})

	return allEmployees, nil
}

// AddTask updates or creates tasks
func AddTask(req models.TaskRequest) error {
	srv, err := config.GetSheetsService()
	if err != nil { return err }

	meta, err := srv.Spreadsheets.Get(config.SpreadsheetID).Do()
	if err != nil { return err }

	todayHeader := time.Now().Format("Mon 02-Jan")
	
	var targetSheetID int64 = -1
	var targetSheetTitle string = ""
	var rowIndex int = -1
	
	// 1. Determine Target Sheet
	if req.Role != "" {
		sheet := findSheetByTitle(meta, req.Role)
		if sheet != nil {
			targetSheetID = sheet.Properties.SheetId
			targetSheetTitle = sheet.Properties.Title
		} else {
			return fmt.Errorf("sheet '%s' not found", req.Role)
		}
	} else {
		// Fallback: Default to "DEV"
		sheet := findSheetByTitle(meta, "DEV")
		if sheet != nil {
			targetSheetID = sheet.Properties.SheetId
			targetSheetTitle = sheet.Properties.Title
		} else {
			return fmt.Errorf("default sheet 'DEV' not found")
		}
	}

	// 2. Find or Create Employee Row
	resp, _ := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", targetSheetTitle)).Do()
	if resp != nil {
		for r, row := range resp.Values {
			if len(row) > 0 && namesMatch(fmt.Sprintf("%v", row[0]), req.EmployeeName) {
				rowIndex = r
				break
			}
		}
	}

	if rowIndex == -1 {
		// Append New Employee
		appendRange := fmt.Sprintf("'%s'!A:A", targetSheetTitle)
		vr := &sheets.ValueRange{
			Values: [][]interface{}{{req.EmployeeName}},
		}
		_, err := srv.Spreadsheets.Values.Append(config.SpreadsheetID, appendRange, vr).ValueInputOption("RAW").Do()
		if err != nil {
			return fmt.Errorf("failed to add new employee: %v", err)
		}
		
		// Re-fetch to find index
		respRetry, _ := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!A:A", targetSheetTitle)).Do()
		for r, row := range respRetry.Values {
			if len(row) > 0 && namesMatch(fmt.Sprintf("%v", row[0]), req.EmployeeName) {
				rowIndex = r
				break
			}
		}
		if rowIndex == -1 {
			return fmt.Errorf("failed to locate employee after creation")
		}
	}

	// 3. Find or Create Date Column
	targetColIndex := -1
	resp, err = srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("'%s'!1:1", targetSheetTitle)).Do()
	var headerRow []interface{}
	
	if err == nil && len(resp.Values) > 0 {
		headerRow = resp.Values[0]
		for i, h := range headerRow {
			if strings.EqualFold(fmt.Sprintf("%v", h), todayHeader) {
				targetColIndex = i
				break
			}
		}
	}

	if targetColIndex == -1 {
		if headerRow == nil {
			targetColIndex = 1 
		} else {
			targetColIndex = len(headerRow)
		}

		var maxCol int64
		for _, s := range meta.Sheets {
			if s.Properties.SheetId == targetSheetID {
				maxCol = s.Properties.GridProperties.ColumnCount
				break
			}
		}

		if int64(targetColIndex) >= maxCol {
			appendReq := &sheets.BatchUpdateSpreadsheetRequest{
				Requests: []*sheets.Request{{
					AppendDimension: &sheets.AppendDimensionRequest{
						SheetId: targetSheetID, Dimension: "COLUMNS", Length: 1,
					},
				}},
			}
			srv.Spreadsheets.BatchUpdate(config.SpreadsheetID, appendReq).Do()
		}

		writeRange := fmt.Sprintf("'%s'!%s1", targetSheetTitle, getColumnName(targetColIndex+1))
		vr := &sheets.ValueRange{Values: [][]interface{}{{todayHeader}}}
		srv.Spreadsheets.Values.Update(config.SpreadsheetID, writeRange, vr).ValueInputOption("RAW").Do()
	}

	// 4. Update Cell (Rich Text)
	cellRangeA1 := fmt.Sprintf("'%s'!%s%d", targetSheetTitle, getColumnName(targetColIndex+1), rowIndex+1)
	cellResp, err := srv.Spreadsheets.Get(config.SpreadsheetID).
		Ranges(cellRangeA1).
		Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns,userEnteredFormat(textFormat(foregroundColor))))))").
		Do()

	type taskData struct {
		Task  string
		Color *sheets.Color
	}
	var existingTasks []taskData

	if err == nil && len(cellResp.Sheets) > 0 && len(cellResp.Sheets[0].Data) > 0 &&
		len(cellResp.Sheets[0].Data[0].RowData) > 0 && len(cellResp.Sheets[0].Data[0].RowData[0].Values) > 0 {

		cell := cellResp.Sheets[0].Data[0].RowData[0].Values[0]
		if cell.UserEnteredValue != nil && cell.UserEnteredValue.StringValue != nil {
			text := *cell.UserEnteredValue.StringValue
			lines := strings.Split(text, "\n")
			runs := cell.TextFormatRuns
			var globalColor *sheets.Color
			if cell.UserEnteredFormat != nil && cell.UserEnteredFormat.TextFormat != nil {
				globalColor = cell.UserEnteredFormat.TextFormat.ForegroundColor
			}

			currIdx := 0
			for _, line := range lines {
				var activeColor *sheets.Color
				if len(runs) > 0 {
					for _, run := range runs {
						if run.StartIndex <= int64(currIdx) {
							if run.Format != nil { activeColor = run.Format.ForegroundColor }
						} else { break }
					}
				} else if globalColor != nil {
					activeColor = globalColor
				}

				if strings.TrimSpace(line) != "" {
					existingTasks = append(existingTasks, taskData{
						Task:  strings.TrimSpace(line),
						Color: activeColor,
					})
				}
				currIdx += len(line) + 1
			}
		}
	}

	for _, newTask := range req.Tasks {
		found := false
		for i, existing := range existingTasks {
			if strings.EqualFold(existing.Task, newTask.Task) {
				existingTasks[i].Color = getColorFromStatus(newTask.Status)
				found = true
				break
			}
		}
		if !found {
			existingTasks = append(existingTasks, taskData{
				Task:  newTask.Task,
				Color: getColorFromStatus(newTask.Status),
			})
		}
	}

	var newTextBuilder string
	var newRuns []*sheets.TextFormatRun

	for i, item := range existingTasks {
		startIdx := int64(len([]rune(newTextBuilder)))
		newTextBuilder += item.Task
		newRuns = append(newRuns, &sheets.TextFormatRun{
			StartIndex: startIdx,
			Format: &sheets.TextFormat{ ForegroundColor: item.Color },
		})
		if i < len(existingTasks)-1 { newTextBuilder += "\n" }
	}

	reqBatch := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				UpdateCells: &sheets.UpdateCellsRequest{
					Range: &sheets.GridRange{
						SheetId:          targetSheetID,
						StartRowIndex:    int64(rowIndex),
						EndRowIndex:      int64(rowIndex + 1),
						StartColumnIndex: int64(targetColIndex),
						EndColumnIndex:   int64(targetColIndex + 1),
					},
					Rows: []*sheets.RowData{
						{
							Values: []*sheets.CellData{
								{
									UserEnteredValue: &sheets.ExtendedValue{StringValue: &newTextBuilder},
									TextFormatRuns:   newRuns,
								},
							},
						},
					},
					Fields: "userEnteredValue,textFormatRuns",
				},
			},
		},
	}

	_, err = srv.Spreadsheets.BatchUpdate(config.SpreadsheetID, reqBatch).Do()
	return err
}

func getColumnName(n int) string {
	name := ""
	for n > 0 {
		n--
		name = string(rune('A'+(n%26))) + name
		n /= 26
	}
	return name
}