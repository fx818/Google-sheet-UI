export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          employee_id: string
          employee_name: string
          project_name: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          employee_name: string
          project_name: string
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          employee_name?: string
          project_name?: string
          created_at?: string
          updated_at?: string | null
        }
      }
    }
  }
}