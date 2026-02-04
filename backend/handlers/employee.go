// handlers/employee.go
package handlers

import (
	"encoding/json"
	"go-backend/services"
	"net/http"

	"github.com/gorilla/mux"
)

func GetLatestTasksByEmployee(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	if name == "" {
		http.Error(w, "Employee name is required", http.StatusBadRequest)
		return
	}

	result, err := services.GetLatestTasks(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func GetAllEmployeesLatestTasks(w http.ResponseWriter, r *http.Request) {
	result, err := services.GetAllEmployeesLatestTasks()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}