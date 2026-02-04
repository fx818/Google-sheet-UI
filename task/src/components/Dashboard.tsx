import { useEffect, useState } from 'react';
import { Users, RefreshCw, Edit2, X, Calendar, CheckCircle2, Circle, Clock, Lock, Info } from 'lucide-react';
import { api, EmployeeHistory, EmployeeMetadata, DailyLog } from '../lib/api';

interface MergedEmployee extends EmployeeHistory {
  metadata?: EmployeeMetadata;
  logs?: DailyLog[];
}

interface EditingTask {
  employeeName: string;
  taskText: string;
  currentStatus: 'todo' | 'pending' | 'complete';
}

const statusStyles = {
  todo: 'border-gray-800 text-gray-800 bg-gray-50',
  complete: 'border-green-600 text-green-700 bg-green-50',
  pending: 'border-orange-600 text-orange-700 bg-orange-50',
};

export default function Dashboard() {
  const [employees, setEmployees] = useState<MergedEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('en-US', { month: 'short' });
    const weekday = now.toLocaleString('en-US', { weekday: 'short' });
    setTodayStr(`${weekday} ${day}-${month}`);
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [backendData, dbMetadata, dbLogs] = await Promise.all([
        api.getAllTasks(),
        api.getMetadata().catch(err => { console.warn(err); return []; }),
        api.getDailyLogs().catch(err => { console.warn(err); return []; })
      ]);

      // Merge Data
      const mergedData = backendData.map((sheetEmp) => {
        const meta = dbMetadata.find(
          (dbEmp) => dbEmp.employee_name.toLowerCase() === sheetEmp.employee_name.toLowerCase()
        );
        // Filter logs specifically for this employee
        const logs = dbLogs.filter(
          (log) => log.employee_name.toLowerCase() === sheetEmp.employee_name.toLowerCase()
        );

        return {
          ...sheetEmp,
          metadata: meta,
          logs: logs
        };
      });

      setEmployees(mergedData);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'todo' | 'pending' | 'complete') => {
    if (!editingTask) return;
    setIsSaving(true);

    try {
      await api.updateTasks({
        employee_name: editingTask.employeeName,
        tasks: [{ task: editingTask.taskText, status: newStatus }]
      });

      // Update timestamp for TODAY
      await api.upsertDailyLog(editingTask.employeeName, todayStr);
        
      await fetchData();
      setEditingTask(null);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to update task.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
          <p className="text-gray-600">Syncing Your Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg shadow-lg">
            <Users className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Team Dashboard</h1>
            <p className="text-gray-500 text-sm">Real-time Data</p>
          </div>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shadow-sm">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      {error && <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">Backend Error: {error}</div>}

      <div className="grid gap-8">
        {employees.length === 0 ? <div className="text-center py-12 text-gray-500">No active tasks found.</div> : 
          employees.map((employee, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{employee.employee_name}</h2>
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span className="font-mono bg-gray-200 px-2 py-0.5 rounded text-xs">{employee.metadata?.employee_id || 'N/A'}</span>
                    <span className="text-blue-600 font-medium">{employee.metadata?.project_name || 'No Project Assigned'}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-x-auto">
                <div className="flex gap-6 min-w-max pb-4">
                  {(employee.history || []).map((day, dIdx) => {
                    const isToday = day.date === todayStr;
                    // Find timestamp log for this specific day
                    const dayLog = employee.logs?.find(l => l.task_date === day.date);

                    return (
                      <div key={dIdx} className={`w-72 flex-shrink-0 transition-opacity ${isToday ? 'opacity-100' : 'opacity-75'}`}>
                        <div className={`flex items-center justify-between mb-2 pb-2 border-b ${isToday ? 'border-blue-100' : 'border-gray-100'}`}>
                          <div className={`flex items-center gap-2 text-sm font-semibold ${isToday ? 'text-blue-700' : 'text-gray-500'}`}>
                            <Calendar size={14} />
                            {day.date} {isToday && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">TODAY</span>}
                          </div>
                          {!isToday && <Lock size={12} className="text-gray-400" />}
                        </div>

                        {/* Per-Day Metadata */}
                        {dayLog && (
                          <div className="flex justify-between text-[10px] text-gray-400 mb-3 px-1">
                            <span>Cr: {formatTime(dayLog.created_at)}</span>
                            <span>Mod: {formatTime(dayLog.updated_at)}</span>
                          </div>
                        )}

                        <div className="space-y-2">
                          {day.todo.map((task, i) => <TaskCard key={`t-${i}`} task={task} status="todo" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, taskText: task, currentStatus: 'todo' })} />)}
                          {day.pending.map((task, i) => <TaskCard key={`p-${i}`} task={task} status="pending" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, taskText: task, currentStatus: 'pending' })} />)}
                          {day.complete.map((task, i) => <TaskCard key={`c-${i}`} task={task} status="complete" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, taskText: task, currentStatus: 'complete' })} />)}
                          
                          {!day.todo.length && !day.pending.length && !day.complete.length && (
                             <div className="h-16 border-2 border-dashed border-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-300 text-xs">
                               <Info size={16} className="mb-1 opacity-50"/>No tasks
                             </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
             <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Update Task Status</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{editingTask.taskText}</p>
              </div>
              <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 mb-6">
              <StatusButton active={editingTask.currentStatus === 'todo'} type="todo" onClick={() => setEditingTask({...editingTask, currentStatus: 'todo'})} />
              <StatusButton active={editingTask.currentStatus === 'pending'} type="pending" onClick={() => setEditingTask({...editingTask, currentStatus: 'pending'})} />
              <StatusButton active={editingTask.currentStatus === 'complete'} type="complete" onClick={() => setEditingTask({...editingTask, currentStatus: 'complete'})} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditingTask(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleUpdateStatus(editingTask.currentStatus)} disabled={isSaving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2">
                {isSaving ? <RefreshCw className="animate-spin" size={18} /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function TaskCard({ task, status, canEdit, onClick }: { task: string; status: 'todo' | 'pending' | 'complete'; canEdit: boolean; onClick: () => void }) {
  const Icon = { todo: Circle, pending: Clock, complete: CheckCircle2 }[status];
  return (
    <div onClick={onClick} className={`group p-3 rounded-lg border relative overflow-hidden ${statusStyles[status]} border-l-4 ${canEdit ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed'}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 flex-shrink-0" />
        <span className="text-sm font-medium leading-snug">{task}</span>
      </div>
      {canEdit && <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={14} className="text-current opacity-50" /></div>}
    </div>
  );
}

function StatusButton({ active, type, onClick }: { active: boolean; type: 'todo' | 'pending' | 'complete'; onClick: () => void }) {
  const labels = { todo: 'To Do', pending: 'Pending', complete: 'Completed' };
  const activeClasses = { 
    todo: "border-gray-800 bg-gray-100 text-gray-900 ring-2 ring-gray-200", 
    pending: "border-orange-500 bg-orange-50 text-orange-900 ring-2 ring-orange-200", 
    complete: "border-green-500 bg-green-50 text-green-900 ring-2 ring-green-200" 
  };
  return (
    <button onClick={onClick} className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all duration-200 ${active ? activeClasses[type] : "border-gray-100 hover:border-gray-200 text-gray-500 bg-white"}`}>
      <span className="font-medium">{labels[type]}</span>
      {active && <CheckCircle2 size={18} />}
    </button>
  );
}