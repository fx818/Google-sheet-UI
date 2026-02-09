// config/config.go
package config

import (
	"context"
	"fmt"
	"io/ioutil"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

const (
	// Replace this with your actual Spreadsheet ID
	// SpreadsheetID = "1dZJsrUJDrly6k4Cg1CDLMfU86cje3k1c_GxiXb7AytU"
	SpreadsheetID = "1KCnvCP_jSmL-9zpqbmyU1OWOT-dZEUJdlOKf4ZZ2Brk"
	SheetName     = "DEV" 
	Credentials   = "credentials.json"
)

// GetSheetsService initializes and returns a Google Sheets service client
func GetSheetsService() (*sheets.Service, error) {
	ctx := context.Background()
	b, err := ioutil.ReadFile(Credentials)
	if err != nil {
		return nil, fmt.Errorf("unable to read client secret file: %v", err)
	}

	// If modifying these scopes, delete your previously saved token.json.
	config, err := google.JWTConfigFromJSON(b, sheets.SpreadsheetsScope)
	if err != nil {
		return nil, fmt.Errorf("unable to parse client secret file to config: %v", err)
	}

	client := config.Client(ctx)

	srv, err := sheets.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve Sheets client: %v", err)
	}

	return srv, nil
}