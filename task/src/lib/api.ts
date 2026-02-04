const BACKEND_URL = 'http://localhost:8080';

export interface TaskItem {
  task: string;
  status: 'todo' | 'pending' | 'complete';
}

export interface TaskRequest {
  employee_name: string;
  employee_code?: string;
  tasks: TaskItem[];
}

export interface DayTasks {
  date: string;
  todo: string[];
  pending: string[];
  complete: string[];
}

export interface EmployeeHistory {
  employee_name: string;
  history: DayTasks[];
}

export interface EmployeeMetadata {
  id: string;
  employee_id: string;
  employee_name: string;
  project_name: string;
}

export interface DailyLog {
  employee_name: string;
  task_date: string;
  created_at: string;
  updated_at: string;
}

export const api = {
  // Sheets
  async getAllTasks(): Promise<EmployeeHistory[]> {
    const response = await fetch(`${BACKEND_URL}/employees/tasks`);
    if (!response.ok) throw new Error('Failed to fetch tasks');
    return response.json();
  },

  async getEmployeeTasks(name: string): Promise<EmployeeHistory> {
    const response = await fetch(`${BACKEND_URL}/employee/${encodeURIComponent(name)}/tasks`);
    if (!response.ok) throw new Error('Failed to fetch employee tasks');
    return response.json();
  },

  async updateTasks(data: TaskRequest): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await response.text());
  },

  // Metadata (Static)
  async getMetadata(): Promise<EmployeeMetadata[]> {
    const response = await fetch(`${BACKEND_URL}/metadata`);
    if (!response.ok) throw new Error('Failed to fetch metadata');
    return response.json();
  },

  async upsertMetadata(data: { employee_id: string; employee_name: string; project_name: string }): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to upsert metadata');
  },

  // Daily Logs (Timestamps per day)
  async getDailyLogs(): Promise<DailyLog[]> {
    const response = await fetch(`${BACKEND_URL}/logs`);
    if (!response.ok) throw new Error('Failed to fetch logs');
    return response.json();
  },

  async upsertDailyLog(name: string, date: string): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: name, task_date: date }),
    });
    if (!response.ok) throw new Error('Failed to update daily log');
  }
};