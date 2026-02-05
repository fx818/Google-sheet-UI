import { useState } from 'react';
import { Plus, Trash2, Save, Loader2, Search, User, Briefcase, FileText, Users } from 'lucide-react';
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
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [role, setRole] = useState<Role>('Dev'); // Default to Dev
  const [tasks, setTasks] = useState<Task[]>([
    { id: crypto.randomUUID(), description: '', status: 'todo' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      // Auto-select role if found
      if (data.sheet_name === 'Dev' || data.sheet_name === 'Managers') {
        setRole(data.sheet_name as Role);
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
      const hasEmptyTask = tasks.some((task) => !task.description.trim());
      if (hasEmptyTask) throw new Error('All tasks must have a description');

      await api.updateTasks({
        employee_name: employeeName,
        employee_code: employeeId,
        role: role,
        tasks: tasks.map(t => ({ task: t.description, status: t.status }))
      });

      await api.upsertMetadata({
          employee_id: employeeId,
          employee_name: employeeName,
          project_name: projectName
      });

      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const weekday = now.toLocaleString('en-US', { weekday: 'short' });
      const todayStr = `${weekday} ${day}-${month}`;
      
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50/50 p-8 border-b border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
            <Save className="text-white h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Daily Task Update</h2>
            <p className="text-gray-500 text-sm mt-1">Log your progress and sync with the team</p>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mx-8 mt-8 p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Employee Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* ID */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 ml-1">Employee ID</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  required
                  placeholder="e.g. EMP-001"
                />
              </div>
            </div>

            {/* Name & Search */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 ml-1">Employee Name</label>
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    required
                    placeholder="John Doe"
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchTodayTasks}
                  disabled={isLoadingTasks || !employeeName}
                  className="px-4 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 hover:text-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 shadow-sm"
                  title="Load existing tasks for today"
                >
                  {isLoadingTasks ? <Loader2 className="animate-spin h-5 w-5" /> : <Search className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 ml-1">Role / Sheet</label>
              <div className="relative group">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="Dev">Developer (Dev Sheet)</option>
                  <option value="Managers">Manager (Managers Sheet)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 ml-1">Project Name</label>
              <div className="relative group">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  required
                  placeholder="Backend Infrastructure"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 my-8" />

          {/* Tasks Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Tasks</h3>
                <p className="text-sm text-gray-500">What are you working on today?</p>
              </div>
              <button
                type="button"
                onClick={addTask}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 hover:text-blue-700 transition-colors font-semibold text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((task, index) => (
                <div 
                  key={task.id} 
                  className="flex flex-col sm:flex-row gap-3 items-start p-2 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className="hidden sm:block pt-3.5 text-gray-300 text-xs font-mono font-medium w-6 text-center">
                    {(index + 1).toString().padStart(2, '0')}
                  </div>
                  
                  <div className="flex-1 w-full relative">
                    <FileText className="absolute left-3 top-3.5 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      value={task.description}
                      onChange={(e) => updateTask(task.id, 'description', e.target.value)}
                      placeholder="Task description..."
                      className="w-full pl-9 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-700"
                      required
                    />
                  </div>

                  <div className="w-full sm:w-40 relative">
                    <select
                      value={task.status}
                      onChange={(e) => updateTask(task.id, 'status', e.target.value as TaskStatus)}
                      className={`w-full appearance-none pl-4 pr-8 py-3 rounded-xl font-medium text-sm outline-none border border-transparent ring-1 ring-inset transition-all cursor-pointer ${statusColors[task.status]}`}
                    >
                      <option value="todo" className="text-gray-900 bg-white">To Do</option>
                      <option value="pending" className="text-gray-900 bg-white">Pending</option>
                      <option value="complete" className="text-gray-900 bg-white">Complete</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/80">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-end sm:self-auto"
                      title="Remove task"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-3"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  Syncing Changes...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
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