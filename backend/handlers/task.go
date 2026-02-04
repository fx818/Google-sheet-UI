// handlers/task.go
package handlers

import (
	"encoding/json"
	"go-backend/models"
	"go-backend/services"
	"net/http"
)

func PostTaskUpdate(w http.ResponseWriter, r *http.Request) {
	var req models.TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.EmployeeName == "" || len(req.Tasks) == 0 {
		http.Error(w, "Employee name and at least one task are required", http.StatusBadRequest)
		return
	}

	err := services.AddTask(req)
	if err != nil {
		http.Error(w, "Failed to update task: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Tasks updated successfully"))
}