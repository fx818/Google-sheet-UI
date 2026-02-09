import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Loader2, Search, User, FileText, Users, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';

type TaskStatus = 'todo' | 'pending' | 'complete';
type Role = 'Dev' | 'Managers';

interface Task {
  id: string;
  description: string;
  status: TaskStatus;
}

const statusColors = {
  todo: 'bg-gray-800 text-white ring-gray-800',
  complete: 'bg-green-600 text-white ring-green-600',
  pending: 'bg-orange-600 text-white ring-orange-600',
};

export default function EmployeeForm() {
  const [employeeName, setEmployeeName] = useState('');
  const [role, setRole] = useState<Role>('Dev'); 
  const [tasks, setTasks] = useState<Task[]>(
    Array.from({ length: 5 }, () => ({ id: crypto.randomUUID(), description: '', status: 'todo' }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // State for existing employees list
  const [existingEmployees, setExistingEmployees] = useState<{name: string, role: string}[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<{name: string, role: string}[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Fetch existing employees on mount
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const data = await api.getAllTasks();
        // Extract unique names and their roles
        const empList = data.map(e => ({
          name: e.employee_name,
          role: e.sheet_name
        }));
        setExistingEmployees(empList);
        setFilteredEmployees(empList);
      } catch (err) {
        console.warn("Could not load employee list for dropdown", err);
      }
    };
    loadEmployees();

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTask = () => {
    setTasks([...tasks, { id: crypto.randomUUID(), description: '', status: 'todo' }]);
  };

  const removeTask = (id: string) => {
    if (tasks.length > 1) {
      setTasks(tasks.filter((task) => task.id !== id));
    }
  };

  const updateTask = (id: string, field: 'description' | 'status', value: string) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, [field]: value } : task
      )
    );
  };

  // 2. Handle Name Change & Auto-Select Role
  const handleNameChange = (val: string) => {
    setEmployeeName(val);
    setShowDropdown(true);
    
    // Filter list
    const filtered = existingEmployees.filter(e => 
      e.name.toLowerCase().includes(val.toLowerCase())
    );
    setFilteredEmployees(filtered);

    // Auto-select role if exact match
    const match = existingEmployees.find(e => e.name.toLowerCase() === val.toLowerCase());
    if (match) {
      if (match.role === 'DEV' || match.role === 'Dev') setRole('Dev');
      else if (match.role === 'Managers') setRole('Managers');
    }
  };

  const selectEmployee = (emp: {name: string, role: string}) => {
    setEmployeeName(emp.name);
    if (emp.role === 'DEV' || emp.role === 'Dev') setRole('Dev');
    else if (emp.role === 'Managers') setRole('Managers');
    setShowDropdown(false);
  };

  const fetchTodayTasks = async () => {
    if (!employeeName.trim()) {
      setMessage({ type: 'error', text: 'Please enter Employee Name first' });
      return;
    }
    setIsLoadingTasks(true);
    setMessage(null);

    try {
      const data = await api.getEmployeeTasks(employeeName);
      
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const weekday = now.toLocaleString('en-US', { weekday: 'short' });
      const todayStr = `${weekday} ${day}-${month}`;

      const todayEntry = data.history.find(h => h.date === todayStr);

      if (data.sheet_name === 'DEV' || data.sheet_name === 'Dev' || data.sheet_name === 'Managers') {
        setRole((data.sheet_name === 'DEV' || data.sheet_name === 'Dev') ? 'Dev' : 'Managers');
      }

      if (todayEntry) {
        const loadedTasks: Task[] = [];
        const pushTask = (list: string[], status: TaskStatus) => {
          list.forEach(t => loadedTasks.push({ id: crypto.randomUUID(), description: t, status: status }));
        };
        pushTask(todayEntry.todo, 'todo');
        pushTask(todayEntry.pending, 'pending');
        pushTask(todayEntry.complete, 'complete');

        if (loadedTasks.length > 0) {
          setTasks(loadedTasks);
          setMessage({ type: 'success', text: `Loaded tasks for today (${todayStr})` });
        } else {
          setMessage({ type: 'error', text: `No tasks found for today (${todayStr})` });
        }
      } else {
        setMessage({ type: 'error', text: `No entry found for today (${todayStr})` });
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Could not fetch tasks. Check connection.' });
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const nonEmptyTasks = tasks.filter(t => t.description.trim() !== '');
      if (nonEmptyTasks.length === 0) throw new Error('Please add at least one task description');

      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const weekday = now.toLocaleString('en-US', { weekday: 'short' });
      const todayStr = `${weekday} ${day}-${month}`;

      const targetRole = role === 'Dev' ? 'DEV' : 'Managers';
      
      await api.updateTasks({
        employee_name: employeeName,
        role: targetRole as any,
        date: todayStr, 
        tasks: nonEmptyTasks.map(t => ({ task: t.description, status: t.status }))
      });

      await api.upsertMetadata({
          employee_name: employeeName,
      });

      await api.upsertDailyLog(employeeName, todayStr);

      setMessage({ type: 'success', text: 'Tasks & Logs synced successfully!' });
      
    } catch (error: unknown) {
      let errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-red-600 rounded-lg shadow-md shadow-red-100">
            <Save className="text-white h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Daily Task Update</h2>
            <p className="text-gray-500 text-xs mt-0.5">Log your progress and sync with the team</p>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Name & Search with Custom Dropdown */}
            <div className="space-y-1.5 relative" ref={dropdownRef}>
              <label className="text-xs font-semibold text-gray-600 ml-1">Employee Name</label>
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-red-500 transition-colors" />
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-red-500/30 focus:border-red-500 transition-all outline-none"
                    required
                    placeholder="Search or enter name..."
                    autoComplete="off"
                  />
                  {showDropdown && filteredEmployees.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredEmployees.map((emp, i) => (
                        <div
                          key={i}
                          onClick={() => selectEmployee(emp)}
                          className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 flex justify-between items-center"
                        >
                          <span>{emp.name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{emp.role === 'DEV' ? 'Dev' : 'Mgr'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={fetchTodayTasks}
                  disabled={isLoadingTasks || !employeeName}
                  className="px-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 hover:text-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 shadow-sm"
                  title="Load existing tasks for today"
                >
                  {isLoadingTasks ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 ml-1">Role / Sheet</label>
              <div className="relative group">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-red-500/30 focus:border-red-500 transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="Dev">Developer (DEV Sheet)</option>
                  <option value="Managers">Manager (Managers Sheet)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown className="h-3 w-3" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 my-6" />

          {/* Tasks Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-800">Tasks</h3>
                <p className="text-xs text-gray-500">What are you working on today?</p>
              </div>
              <button
                type="button"
                onClick={addTask}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors font-semibold text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </button>
            </div>

            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div 
                  key={task.id} 
                  className="flex flex-col sm:flex-row gap-2 items-start p-1.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="hidden sm:block pt-2.5 text-gray-300 text-[10px] font-mono font-medium w-5 text-center">
                    {(index + 1).toString().padStart(2, '0')}
                  </div>
                  
                  <div className="flex-1 w-full relative">
                    <FileText className="absolute left-3 top-2.5 text-gray-400 h-3.5 w-3.5" />
                    <input
                      type="text"
                      value={task.description}
                      onChange={(e) => updateTask(task.id, 'description', e.target.value)}
                      placeholder="Task description..."
                      className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-red-500/30 focus:border-red-500 transition-all outline-none text-gray-700"
                    />
                  </div>

                  <div className="w-full sm:w-32 relative">
                    <select
                      value={task.status}
                      onChange={(e) => updateTask(task.id, 'status', e.target.value as TaskStatus)}
                      className={`w-full appearance-none pl-3 pr-6 py-2 rounded-lg font-medium text-xs outline-none border border-transparent ring-1 ring-inset transition-all cursor-pointer ${statusColors[task.status]}`}
                    >
                      <option value="todo" className="text-gray-900 bg-white">To Do</option>
                      <option value="pending" className="text-gray-900 bg-white">WIP</option>
                      <option value="complete" className="text-gray-900 bg-white">Complete</option>
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/80">
                      <ChevronDown className="h-3 w-3" />
                    </div>
                  </div>

                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all self-end sm:self-auto"
                      title="Remove task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-red-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-red-700 active:scale-[0.99] transition-all shadow-md shadow-red-100 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  Syncing Changes...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save & Sync Updates
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}