// services/sheets.go
package services

import (
	"fmt"
	"go-backend/config"
	"go-backend/models"
	"math"
	"strings"
	"time"

	"google.golang.org/api/sheets/v4"
)

// Helper: Exact Name Match
func namesMatch(sheetName, searchName string) bool {
	return strings.EqualFold(strings.TrimSpace(sheetName), strings.TrimSpace(searchName))
}

// Helper: Determine status from color
func getStatusFromColor(color *sheets.Color) string {
	if color == nil {
		return "todo"
	}

	// ---------------------------------------------------------
	// Color Definitions (Normalized 0.0 - 1.0)
	// ---------------------------------------------------------

	// Green: #34A853 -> R:52, G:168, B:83
	targetGreenR := 52.0 / 255.0
	targetGreenG := 168.0 / 255.0
	targetGreenB := 83.0 / 255.0

	// Pending (Orange/Red): #E7953F -> R:231, G:149, B:63
	targetPendingR := 231.0 / 255.0
	targetPendingG := 149.0 / 255.0
	targetPendingB := 63.0 / 255.0

	const tol = 0.15 // Increased tolerance to handle API float precision and slight manual variations

	// 1. Check for Specific Green (Complete)
	if math.Abs(color.Red-targetGreenR) < tol &&
		math.Abs(color.Green-targetGreenG) < tol &&
		math.Abs(color.Blue-targetGreenB) < tol {
		return "complete"
	}

	// 2. Check for Specific Pending (Orange/Red)
	if math.Abs(color.Red-targetPendingR) < tol &&
		math.Abs(color.Green-targetPendingG) < tol &&
		math.Abs(color.Blue-targetPendingB) < tol {
		return "pending"
	}

	// 3. Legacy/Manual Check: Pure Green (e.g. #00FF00)
	// Standard green often has high G and low R/B
	if color.Green > 0.8 && color.Red < 0.3 && color.Blue < 0.3 {
		return "complete"
	}

	// 4. Legacy/Manual Check: Pure Red (e.g. #FF0000)
	// Standard red often has high R and low G/B
	if color.Red > 0.8 && color.Green < 0.3 && color.Blue < 0.3 {
		return "pending"
	}

	// Default
	return "todo"
}

// Helper: Determine color from status
func getColorFromStatus(status string) *sheets.Color {
	switch strings.ToLower(status) {
	case "complete":
		// #34A853 (Green)
		return &sheets.Color{Red: 52.0 / 255.0, Green: 168.0 / 255.0, Blue: 83.0 / 255.0}
	case "pending":
		// #E7953F (Orange/Red)
		return &sheets.Color{Red: 231.0 / 255.0, Green: 149.0 / 255.0, Blue: 63.0 / 255.0}
	case "todo":
		// #000000 (Black)
		return &sheets.Color{Red: 0.0, Green: 0.0, Blue: 0.0}
	default:
		// Default Black
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

	currentIdx := 0
	for _, line := range lines {
		lineLen := len(line)
		status := "todo" // Default

		// Logic: iterate runs to find the one active at currentIdx
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

		// Advance index (line length + newline char)
		currentIdx += lineLen + 1
	}

	return dt
}

// GetLatestTasks fetches and parses tasks with colors
func GetLatestTasks(employeeName string) (models.EmployeeTasksResponse, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
	}

	// 1. Fetch Header Row to map dates
	respHeader, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("%s!1:1", config.SheetName)).Do()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
	}
	if len(respHeader.Values) == 0 {
		return models.EmployeeTasksResponse{}, fmt.Errorf("sheet is empty")
	}
	headerRow := respHeader.Values[0]

	// 2. Fetch Values to find Employee Row Index (Lightweight)
	respValues, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("%s!A:A", config.SheetName)).Do()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
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
		return models.EmployeeTasksResponse{}, fmt.Errorf("employee '%s' not found", employeeName)
	}

	// 3. Fetch Specific Row with Formatting (Heavier)
	req := srv.Spreadsheets.Get(config.SpreadsheetID).
		Ranges(fmt.Sprintf("%s!A%d:ZZ%d", config.SheetName, rowIndex+1, rowIndex+1)).
		IncludeGridData(true).
		Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns))))")

	resp, err := req.Do()
	if err != nil {
		return models.EmployeeTasksResponse{}, err
	}

	var history []models.DayTasks

	if len(resp.Sheets) > 0 && len(resp.Sheets[0].Data) > 0 && len(resp.Sheets[0].Data[0].RowData) > 0 {
		rowCells := resp.Sheets[0].Data[0].RowData[0].Values

		// Iterate backwards to find latest 7
		count := 0
		for i := len(rowCells) - 1; i >= 1; i-- {
			if count >= 7 {
				break
			}

			cell := rowCells[i]
			// Check if cell has content
			if cell.UserEnteredValue == nil || cell.UserEnteredValue.StringValue == nil || *cell.UserEnteredValue.StringValue == "" {
				continue
			}

			// Determine Date
			dateStr := "Unknown"
			if i < len(headerRow) {
				dateStr = fmt.Sprintf("%v", headerRow[i])
			}

			dayTask := parseCellToDayTasks(dateStr, cell)
			history = append(history, dayTask)
			count++
		}
	}

	return models.EmployeeTasksResponse{
		EmployeeName: fullEmployeeName,
		History:      history,
	}, nil
}

// GetAllEmployeesLatestTasks fetches logic for all
func GetAllEmployeesLatestTasks() ([]models.EmployeeTasksResponse, error) {
	srv, err := config.GetSheetsService()
	if err != nil {
		return nil, err
	}

	req := srv.Spreadsheets.Get(config.SpreadsheetID).
		Ranges(fmt.Sprintf("%s!A:ZZ", config.SheetName)).
		IncludeGridData(true).
		Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns))))")

	resp, err := req.Do()
	if err != nil {
		return nil, err
	}

	respHeader, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("%s!1:1", config.SheetName)).Do()
	if err != nil {
		return nil, err
	}
	headerRow := respHeader.Values[0]

	// Initialize as empty slice to avoid returning null in JSON
	allEmployees := []models.EmployeeTasksResponse{}

	if len(resp.Sheets) > 0 && len(resp.Sheets[0].Data) > 0 {
		rows := resp.Sheets[0].Data[0].RowData

		// Skip header (index 0)
		for rIdx, row := range rows {
			if rIdx == 0 {
				continue
			}

			if len(row.Values) == 0 || row.Values[0].UserEnteredValue == nil || row.Values[0].UserEnteredValue.StringValue == nil {
				continue
			}
			empName := *row.Values[0].UserEnteredValue.StringValue
			if empName == "" {
				continue
			}

			var history []models.DayTasks
			count := 0

			for cIdx := len(row.Values) - 1; cIdx >= 1; cIdx-- {
				if count >= 7 {
					break
				}

				cell := row.Values[cIdx]
				if cell.UserEnteredValue == nil || cell.UserEnteredValue.StringValue == nil || *cell.UserEnteredValue.StringValue == "" {
					continue
				}

				dateStr := "Unknown"
				if cIdx < len(headerRow) {
					dateStr = fmt.Sprintf("%v", headerRow[cIdx])
				}

				dayTask := parseCellToDayTasks(dateStr, cell)
				history = append(history, dayTask)
				count++
			}

			allEmployees = append(allEmployees, models.EmployeeTasksResponse{
				EmployeeName: empName,
				History:      history,
			})
		}
	}

	return allEmployees, nil
}

// AddTask updates existing tasks or appends new ones
func AddTask(req models.TaskRequest) error {
	srv, err := config.GetSheetsService()
	if err != nil {
		return err
	}

	// 0. Fetch Metadata first to get SheetID and Grid Limits
	sheetMeta, err := srv.Spreadsheets.Get(config.SpreadsheetID).Do()
	if err != nil {
		return err
	}
	var sheetID int64
	var maxCol int64
	for _, sheet := range sheetMeta.Sheets {
		// Use case-insensitive comparison for safety, though API returns exact title
		if strings.EqualFold(sheet.Properties.Title, config.SheetName) {
			sheetID = sheet.Properties.SheetId
			maxCol = sheet.Properties.GridProperties.ColumnCount
			break
		}
	}

	// 1. Column Management
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, fmt.Sprintf("%s!A:ZZ", config.SheetName)).Do()
	if err != nil {
		return err
	}
	// If sheet is empty (or has no data in A:ZZ), construct header logic carefully
	var headerRow []interface{}
	if len(resp.Values) > 0 {
		headerRow = resp.Values[0]
	}

	todayHeader := time.Now().Format("Mon 02-Jan")
	colIndex := -1

	for i, h := range headerRow {
		if strings.EqualFold(fmt.Sprintf("%v", h), todayHeader) {
			colIndex = i
			break
		}
	}

	// NEW: Enforce that we are only editing the rightmost column (Today's column)
	if colIndex != -1 && colIndex < len(headerRow)-1 {
		return fmt.Errorf("restriction: can only edit the rightmost column (today's column). '%s' is not the last column", todayHeader)
	}

	if colIndex == -1 {
		colIndex = len(headerRow) // The new index will be after the last existing column

		// CHECK GRID LIMITS & EXPAND IF NEEDED
		if int64(colIndex) >= maxCol {
			// Calculate how many columns needed (usually just 1, but let's be safe)
			columnsToAdd := int64(colIndex) - maxCol + 1
			if columnsToAdd < 1 {
				columnsToAdd = 1
			}

			appendReq := &sheets.BatchUpdateSpreadsheetRequest{
				Requests: []*sheets.Request{
					{
						AppendDimension: &sheets.AppendDimensionRequest{
							SheetId:   sheetID,
							Dimension: "COLUMNS",
							Length:    columnsToAdd,
						},
					},
				},
			}
			_, err = srv.Spreadsheets.BatchUpdate(config.SpreadsheetID, appendReq).Do()
			if err != nil {
				return fmt.Errorf("failed to expand sheet grid: %v", err)
			}
		}

		// Now write the new header
		writeRange := fmt.Sprintf("%s!%s1", config.SheetName, getColumnName(colIndex+1))
		vr := &sheets.ValueRange{Values: [][]interface{}{{todayHeader}}}
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, writeRange, vr).ValueInputOption("RAW").Do()
		if err != nil {
			return fmt.Errorf("failed to create column header: %v", err)
		}
	}

	// 2. Find Employee Row (Exact Match)
	// Re-check values in case logic changed, though row count usually stable.
	// We use existing `resp.Values` because expanding columns doesn't shift row indices.
	rowIndex := -1
	for i, row := range resp.Values {
		if len(row) > 0 {
			name := fmt.Sprintf("%v", row[0])
			if namesMatch(name, req.EmployeeName) {
				rowIndex = i
				break
			}
		}
	}
	if rowIndex == -1 {
		return fmt.Errorf("employee '%s' not found", req.EmployeeName)
	}

	// 3. Fetch Existing Rich Text to Preserve Order/Colors
	cellRangeA1 := fmt.Sprintf("%s!%s%d", config.SheetName, getColumnName(colIndex+1), rowIndex+1)
	cellResp, err := srv.Spreadsheets.Get(config.SpreadsheetID).
		Ranges(cellRangeA1).
		Fields("sheets(data(rowData(values(userEnteredValue,textFormatRuns))))").
		Do()

	// struct to hold task and its exact color
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

			currIdx := 0
			for _, line := range lines {
				var activeColor *sheets.Color
				if len(runs) > 0 {
					for _, run := range runs {
						if run.StartIndex <= int64(currIdx) {
							if run.Format != nil {
								activeColor = run.Format.ForegroundColor
							}
						} else {
							break
						}
					}
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

	// 4. Merge New Tasks (Update if exists, Append if not)
	for _, newTask := range req.Tasks {
		found := false
		for i, existing := range existingTasks {
			if strings.EqualFold(existing.Task, newTask.Task) {
				// FORCE update the color based on the new status from payload
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

	// 5. Rebuild Cell Value and Runs
	var newTextBuilder string
	var newRuns []*sheets.TextFormatRun

	for i, item := range existingTasks {
		startIdx := int64(len([]rune(newTextBuilder)))

		newTextBuilder += item.Task

		newRuns = append(newRuns, &sheets.TextFormatRun{
			StartIndex: startIdx,
			Format: &sheets.TextFormat{
				ForegroundColor: item.Color,
			},
		})

		if i < len(existingTasks)-1 {
			newTextBuilder += "\n"
		}
	}

	// 6. Update via BatchUpdate
	reqBatch := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				UpdateCells: &sheets.UpdateCellsRequest{
					Range: &sheets.GridRange{
						SheetId:          sheetID,
						StartRowIndex:    int64(rowIndex),
						EndRowIndex:      int64(rowIndex + 1),
						StartColumnIndex: int64(colIndex),
						EndColumnIndex:   int64(colIndex + 1),
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