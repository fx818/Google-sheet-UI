import { useState } from 'react';
import { Plus, Trash2, Save, Loader2, Search } from 'lucide-react';
import { api } from '../lib/api';

type TaskStatus = 'todo' | 'pending' | 'complete';

interface Task {
  id: string;
  description: string;
  status: TaskStatus;
}

const statusColors = {
  todo: 'bg-gray-800 text-white',
  complete: 'bg-green-600 text-white',
  pending: 'bg-orange-600 text-white', // Consistent with dashboard
};

export default function EmployeeForm() {
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([
    { id: crypto.randomUUID(), description: '', status: 'todo' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const addTask = () => setTasks([...tasks, { id: crypto.randomUUID(), description: '', status: 'todo' }]);
  const removeTask = (id: string) => { if (tasks.length > 1) setTasks(tasks.filter((task) => task.id !== id)); };
  const updateTask = (id: string, field: 'description' | 'status', value: string) => {
    setTasks(tasks.map((task) => task.id === id ? { ...task, [field]: value } : task));
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

      // 1. Send Tasks to Go Backend (Sheets)
      await api.updateTasks({
        employee_name: employeeName,
        employee_code: employeeId,
        tasks: tasks.map(t => ({ task: t.description, status: t.status }))
      });

      // 2. Upsert Metadata (Static)
      await api.upsertMetadata({
          employee_id: employeeId,
          employee_name: employeeName,
          project_name: projectName
      });

      // 3. Upsert Daily Log (Timestamps for TODAY)
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
    <div className="max-w-3xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-100">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Save size={24} /></div>
          <h2 className="text-2xl font-bold text-gray-800">Daily Task Update</h2>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Employee ID</label>
              <input type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" required placeholder="e.g. EMP-001" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Name</label>
              <div className="flex gap-2">
                <input type="text" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" required placeholder="John Doe" />
                <button type="button" onClick={fetchTodayTasks} disabled={isLoadingTasks || !employeeName} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                  {isLoadingTasks ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Project Name</label>
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" required placeholder="Backend Infrastructure" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-semibold text-gray-700">Tasks for Today</label>
              <button type="button" onClick={addTask} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"><Plus size={16} /> Add Item</button>
            </div>
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <div key={task.id} className="flex gap-3 items-start">
                  <div className="pt-3 text-gray-400 text-xs font-mono w-6">{(index + 1).toString().padStart(2, '0')}</div>
                  <div className="flex-1">
                    <input type="text" value={task.description} onChange={(e) => updateTask(task.id, 'description', e.target.value)} placeholder="What needs to be done?" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg outline-none" required />
                  </div>
                  <select value={task.status} onChange={(e) => updateTask(task.id, 'status', e.target.value as TaskStatus)} className={`px-4 py-2.5 rounded-lg font-medium text-sm outline-none ${statusColors[task.status]}`}>
                    <option value="todo" className="text-black bg-white">To Do</option>
                    <option value="pending" className="text-black bg-white">Pending</option>
                    <option value="complete" className="text-black bg-white">Complete</option>
                  </select>
                  {tasks.length > 1 && <button type="button" onClick={() => removeTask(task.id)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={20} /></button>}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-70 flex items-center justify-center gap-2">
              {isSubmitting ? <><Loader2 className="animate-spin" size={20} /> Saving...</> : 'Save / Update Tasks'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}