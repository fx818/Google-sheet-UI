package handlers

import (
	"encoding/json"
	"go-backend/services"
	"net/http"
)

func GetMetadata(w http.ResponseWriter, r *http.Request) {
	data, err := services.GetAllEmployeesMetadata()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func GetDailyLogs(w http.ResponseWriter, r *http.Request) {
	data, err := services.GetAllDailyLogs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func UpsertMetadata(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmployeeName string `json:"employee_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	if err := services.UpsertEmployeeMetadata(req.EmployeeName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func UpsertDailyLog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmployeeName string `json:"employee_name"`
		TaskDate     string `json:"task_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	if err := services.UpsertDailyLog(req.EmployeeName, req.TaskDate); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}