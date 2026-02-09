package main

import (
	"go-backend/config"
	"go-backend/handlers"
	// "go-backend/services"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// services.InitSheetsService()
	config.InitDB()

	r := mux.NewRouter()
	r.Use(enableCORS)

	// Sheets
	r.HandleFunc("/employee/{name}/tasks", handlers.GetLatestTasksByEmployee).Methods("GET", "OPTIONS")
	r.HandleFunc("/employees/tasks", handlers.GetAllEmployeesLatestTasks).Methods("GET", "OPTIONS")
	r.HandleFunc("/task", handlers.PostTaskUpdate).Methods("POST", "OPTIONS")

	// DB
	r.HandleFunc("/metadata", handlers.GetMetadata).Methods("GET", "OPTIONS")
	r.HandleFunc("/metadata", handlers.UpsertMetadata).Methods("POST", "OPTIONS")
	
	// New Daily Logs Endpoints
	r.HandleFunc("/logs", handlers.GetDailyLogs).Methods("GET", "OPTIONS")
	r.HandleFunc("/logs", handlers.UpsertDailyLog).Methods("POST", "OPTIONS")

	log.Println("Server starting on port 8080...")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}






// package main

// import (
// 	"go-backend/config"
// 	"go-backend/handlers"
// 	"log"
// 	"net/http"
// 	"os"

// 	"github.com/gorilla/mux"
// )

// func enableCORS(next http.Handler) http.Handler {
// 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		w.Header().Set("Access-Control-Allow-Origin", "*")
// 		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
// 		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

// 		if r.Method == http.MethodOptions {
// 			w.WriteHeader(http.StatusOK)
// 			return
// 		}

// 		next.ServeHTTP(w, r)
// 	})
// }

// func main() {
// 	// Init DB
// 	config.InitDB()

// 	r := mux.NewRouter()
// 	r.Use(enableCORS)

// 	// Sheets
// 	r.HandleFunc("/employee/{name}/tasks", handlers.GetLatestTasksByEmployee).Methods("GET", "OPTIONS")
// 	r.HandleFunc("/employees/tasks", handlers.GetAllEmployeesLatestTasks).Methods("GET", "OPTIONS")
// 	r.HandleFunc("/task", handlers.PostTaskUpdate).Methods("POST", "OPTIONS")

// 	// Metadata
// 	r.HandleFunc("/metadata", handlers.GetMetadata).Methods("GET", "OPTIONS")
// 	r.HandleFunc("/metadata", handlers.UpsertMetadata).Methods("POST", "OPTIONS")

// 	// Daily Logs
// 	r.HandleFunc("/logs", handlers.GetDailyLogs).Methods("GET", "OPTIONS")
// 	r.HandleFunc("/logs", handlers.UpsertDailyLog).Methods("POST", "OPTIONS")

// 	// Config
// 	port := os.Getenv("PORT")
// 	if port == "" {
// 		port = "7456"
// 	}

// 	certFile := "server.crt"
// 	keyFile := "server.key"

// 	log.Println("HTTPS server starting on port", port)

// 	err := http.ListenAndServeTLS(
// 		":"+port,
// 		certFile,
// 		keyFile,
// 		r,
// 	)

// 	if err != nil {
// 		log.Fatal(err)
// 	}
// }


// openssl req -x509 -nodes -days 365 \
// -newkey rsa:2048 \
// -keyout server.key \
// -out server.crt
