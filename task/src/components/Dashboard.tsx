import { useEffect, useState, useMemo } from 'react';
import { Users, RefreshCw, Edit2, X, Calendar, CheckCircle2, Circle, Clock, Lock, Info, Search, Filter, ArrowUpDown, LayoutDashboard, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { api, EmployeeHistory, EmployeeMetadata, DailyLog } from '../lib/api';

interface MergedEmployee extends EmployeeHistory {
  metadata?: EmployeeMetadata;
  logs?: DailyLog[];
}

interface EditingTask {
  employeeName: string;
  sheetName: string; 
  taskText: string;
  currentStatus: 'todo' | 'pending' | 'complete';
}

type SortKey = 'name' | 'created';
type SortDirection = 'asc' | 'desc';
type Tab = 'dashboard' | 'dev' | 'managers';

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
  
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [nameFilter, setNameFilter] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ 
    key: 'name', 
    direction: 'asc' 
  });

  // State for expanding/collapsing individual stats in dashboard
  const [expandedStats, setExpandedStats] = useState<{dev: boolean, managers: boolean}>({ dev: false, managers: false });

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
      const [backendData, dbMetadata, dbLogs] = await Promise.all([
        api.getAllTasks(),
        api.getMetadata().catch(err => { console.warn(err); return []; }),
        api.getDailyLogs().catch(err => { console.warn(err); return []; })
      ]);

      const mergedData = backendData.map((sheetEmp) => {
        const meta = dbMetadata.find(
          (dbEmp) => dbEmp.employee_name.toLowerCase() === sheetEmp.employee_name.toLowerCase()
        );
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
        role: editingTask.sheetName as 'Dev' | 'Managers',
        tasks: [{ task: editingTask.taskText, status: newStatus }]
      });

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

  // Analytics Calculation
  const analytics = useMemo(() => {
    const calculateStats = (subset: MergedEmployee[]) => {
      let todo = 0, pending = 0, complete = 0;
      // Per-employee breakdown
      const breakdown = subset.map(emp => {
        let eTodo = 0, ePending = 0, eComplete = 0;
        emp.history.forEach(day => {
          eTodo += day.todo.length;
          ePending += day.pending.length;
          eComplete += day.complete.length;
        });
        // Add to aggregate
        todo += eTodo;
        pending += ePending;
        complete += eComplete;
        
        return { 
          name: emp.employee_name, 
          id: emp.metadata?.employee_id || 'N/A',
          todo: eTodo, 
          pending: ePending, 
          complete: eComplete 
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      return { count: subset.length, todo, pending, complete, breakdown };
    };

    return {
      dev: calculateStats(employees.filter(e => e.sheet_name === 'DEV')),
      managers: calculateStats(employees.filter(e => e.sheet_name === 'Managers')),
    };
  }, [employees]);

  // Processed Data
  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (activeTab === 'dev') result = result.filter(e => e.sheet_name === 'DEV');
    else if (activeTab === 'managers') result = result.filter(e => e.sheet_name === 'Managers');
    else return []; 

    if (nameFilter.trim()) result = result.filter(e => e.employee_name.toLowerCase().includes(nameFilter.toLowerCase()));
    if (idFilter.trim()) result = result.filter(e => e.metadata?.employee_id.toLowerCase().includes(idFilter.toLowerCase()));

    result.sort((a, b) => {
      let comparison = 0;
      if (sortConfig.key === 'name') comparison = a.employee_name.localeCompare(b.employee_name);
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [employees, activeTab, nameFilter, idFilter, sortConfig]);

  const allNames = useMemo(() => Array.from(new Set(employees.map(e => e.employee_name))).sort(), [employees]);
  const allIds = useMemo(() => Array.from(new Set(employees.map(e => e.metadata?.employee_id).filter(Boolean))).sort(), [employees]);

  useEffect(() => { fetchData(); }, []);

  const formatDate = (isoString?: string) => isoString ? new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const formatTime = (isoString?: string) => isoString ? new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

  // Function to calculate individual stats per employee for the card header
  const getEmployeeStats = (emp: MergedEmployee) => {
    let t = 0, p = 0, c = 0;
    emp.history.forEach(d => { t += d.todo.length; p += d.pending.length; c += d.complete.length; });
    return { t, p, c };
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><RefreshCw className="animate-spin text-red-600" size={40} /></div>;

  return (
    <div className="max-w-7xl mx-auto p-4 bg-gray-50 min-h-screen font-sans">
      <div className="mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg shadow-lg"><Users className="text-white" size={20} /></div>
            <div><h1 className="text-2xl font-bold text-gray-800">Team Overview</h1><p className="text-gray-500 text-xs font-medium">Dev & Manager Tasks</p></div>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 shadow-sm text-sm font-semibold"><RefreshCw size={16} /> Refresh</button>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          {['dashboard', 'dev', 'managers'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as Tab)} className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 capitalize transition-all ${activeTab === tab ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab === 'dashboard' ? <LayoutDashboard size={16} /> : <Database size={16} />} {tab === 'dev' ? 'Dev Sheet' : tab === 'managers' ? 'Managers Sheet' : 'Dashboard'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">Backend Error: {error}</div>}

      {/* DASHBOARD VIEW */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300 items-start">
          {[
            { id: 'dev', title: 'Dev Team', stats: analytics.dev },
            { id: 'managers', title: 'Managers', stats: analytics.managers }
          ].map((group, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-800">{group.title}</h3>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{group.stats.count} Members</span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center"><div className="text-2xl font-bold text-gray-800">{group.stats.todo}</div><div className="text-xs font-semibold text-gray-500 uppercase">To Do</div></div>
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 text-center"><div className="text-2xl font-bold text-orange-600">{group.stats.pending}</div><div className="text-xs font-semibold text-orange-600/80 uppercase">Pending</div></div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center"><div className="text-2xl font-bold text-green-600">{group.stats.complete}</div><div className="text-xs font-semibold text-green-600/80 uppercase">Complete</div></div>
                </div>
                
                {/* Expandable Breakdown */}
                <div className="border-t border-gray-100 pt-2">
                  <button 
                    onClick={() => setExpandedStats(prev => ({...prev, [group.id]: !prev[group.id as 'dev' | 'managers']}))}
                    className="w-full flex items-center justify-between py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    <span className="font-medium">Individual Breakdown</span>
                    {expandedStats[group.id as 'dev' | 'managers'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  
                  {expandedStats[group.id as 'dev' | 'managers'] && (
                    <div className="mt-2 space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                      {group.stats.breakdown.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-400">No members found</div>
                      ) : (
                        group.stats.breakdown.map((emp, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 text-sm border border-gray-50 hover:border-gray-100">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-800">{emp.name}</span>
                              <span className="text-[10px] text-gray-400">{emp.id}</span>
                            </div>
                            <div className="flex gap-2 text-xs font-medium">
                              {emp.todo > 0 && <span className="text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{emp.todo} T</span>}
                              {emp.pending > 0 && <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{emp.pending} P</span>}
                              {emp.complete > 0 && <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{emp.complete} C</span>}
                              {emp.todo === 0 && emp.pending === 0 && emp.complete === 0 && <span className="text-gray-300">-</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LIST VIEW */}
      {activeTab !== 'dashboard' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Filters... (Same as before) */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-3 items-center">
             {/* ... Search Inputs ... */}
             <div className="relative flex-1 w-full md:w-auto"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input list="employee-names" type="text" placeholder="Search Name..." value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} className="pl-9 pr-3 py-1.5 w-full text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-red-500 outline-none" /><datalist id="employee-names">{allNames.map((name, i) => <option key={i} value={name} />)}</datalist></div>
             <div className="relative flex-1 w-full md:w-auto"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold">ID</span><input list="employee-ids" type="text" placeholder="Filter ID..." value={idFilter} onChange={(e) => setIdFilter(e.target.value)} className="pl-8 pr-3 py-1.5 w-full text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-red-500 outline-none" /><datalist id="employee-ids">{allIds.map((id, i) => <option key={i} value={id as string} />)}</datalist></div>
             <div className="flex items-center gap-2 w-full md:w-auto border-l border-gray-100 pl-3">
               <ArrowUpDown size={14} className="text-gray-400" />
               <select value={`${sortConfig.key}-${sortConfig.direction}`} onChange={(e) => { const [key, direction] = e.target.value.split('-'); setSortConfig({ key: key as SortKey, direction: direction as SortDirection }); }} className="py-1.5 pl-1 pr-6 border-none bg-transparent text-sm font-medium text-gray-600 focus:ring-0 cursor-pointer">
                 <option value="name-asc">Name (A-Z)</option><option value="name-desc">Name (Z-A)</option>
               </select>
               {(nameFilter || idFilter) && <button onClick={() => { setNameFilter(''); setIdFilter(''); }} className="ml-auto text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">Clear</button>}
             </div>
          </div>

          <div className="grid gap-6">
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200"><p className="text-gray-500 text-sm">No records found for {activeTab} sheet.</p></div>
            ) : (
              filteredEmployees.map((employee, idx) => {
                const stats = getEmployeeStats(employee);
                return (
                  <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <h2 className="text-base font-bold text-gray-800">{employee.employee_name}</h2>
                        <div className="flex gap-2">
                          <span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500 font-mono">{employee.metadata?.employee_id || 'NO_ID'}</span>
                          <span className="text-[10px] bg-red-50 border border-red-100 px-1.5 py-0.5 rounded text-red-700 font-medium">{employee.metadata?.project_name || 'No Project'}</span>
                        </div>
                      </div>
                      
                      {/* Individual Stats Badge */}
                      <div className="flex gap-2 text-[10px] font-semibold">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border border-gray-200">{stats.t} Todo</span>
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full border border-orange-100">{stats.p} Pending</span>
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full border border-green-100">{stats.c} Done</span>
                      </div>
                    </div>

                    <div className="p-4 overflow-x-auto">
                      <div className="flex gap-4 min-w-max">
                        {(employee.history || []).map((day, dIdx) => {
                          const isToday = day.date === todayStr;
                          const dayLog = employee.logs?.find(l => l.task_date === day.date);
                          return (
                            <div key={dIdx} className={`w-64 flex-shrink-0 transition-opacity ${isToday ? 'opacity-100' : 'opacity-60 grayscale-[0.3]'}`}>
                              <div className={`flex items-center justify-between mb-2 pb-1 border-b ${isToday ? 'border-red-200' : 'border-gray-100'}`}>
                                <div className={`flex items-center gap-1.5 text-xs font-bold ${isToday ? 'text-red-700' : 'text-gray-500'}`}><Calendar size={12} />{day.date}</div>
                                {dayLog &&  <span className="text-[9px] text-gray-400 font-mono">{ formatTime(dayLog.created_at) } - { formatTime(dayLog.updated_at)}</span>}
                              </div>
                              <div className="space-y-1.5">
                                {day.todo.map((task, i) => <TaskCard key={`t-${i}`} task={task} status="todo" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, sheetName: employee.sheet_name, taskText: task, currentStatus: 'todo' })} />)}
                                {day.pending.map((task, i) => <TaskCard key={`p-${i}`} task={task} status="pending" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, sheetName: employee.sheet_name, taskText: task, currentStatus: 'pending' })} />)}
                                {day.complete.map((task, i) => <TaskCard key={`c-${i}`} task={task} status="complete" canEdit={isToday} onClick={() => isToday && setEditingTask({ employeeName: employee.employee_name, sheetName: employee.sheet_name, taskText: task, currentStatus: 'complete' })} />)}
                                {!day.todo.length && !day.pending.length && !day.complete.length && <div className="h-10 border border-dashed border-gray-100 rounded flex items-center justify-center text-gray-300 text-[10px]">Empty</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit Modal (Same) */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-5 max-w-sm w-full mx-4">
             <div className="flex justify-between items-start mb-4">
              <div><h3 className="text-base font-bold text-gray-900">Update Status</h3><p className="text-xs text-gray-500 mt-1 line-clamp-2">{editingTask.taskText}</p></div>
              <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 gap-2 mb-5">
              <StatusButton active={editingTask.currentStatus === 'todo'} type="todo" onClick={() => setEditingTask({...editingTask, currentStatus: 'todo'})} />
              <StatusButton active={editingTask.currentStatus === 'pending'} type="pending" onClick={() => setEditingTask({...editingTask, currentStatus: 'pending'})} />
              <StatusButton active={editingTask.currentStatus === 'complete'} type="complete" onClick={() => setEditingTask({...editingTask, currentStatus: 'complete'})} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingTask(null)} className="flex-1 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleUpdateStatus(editingTask.currentStatus)} disabled={isSaving} className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 flex justify-center items-center gap-2">{isSaving ? <RefreshCw className="animate-spin" size={14} /> : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers...
function TaskCard({ task, status, canEdit, onClick }: { task: string; status: 'todo' | 'pending' | 'complete'; canEdit: boolean; onClick: () => void }) {
  const Icon = { todo: Circle, pending: Clock, complete: CheckCircle2 }[status];
  return (
    <div onClick={onClick} className={`group p-2 rounded border relative overflow-hidden ${statusStyles[status]} border-l-[3px] ${canEdit ? 'cursor-pointer hover:shadow-sm' : 'cursor-not-allowed opacity-90'}`}>
      <div className="flex items-start gap-1.5"><Icon size={12} className="mt-0.5 flex-shrink-0" /><span className="text-[11px] font-medium leading-snug">{task}</span></div>
      {canEdit && <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={10} className="text-current opacity-60" /></div>}
    </div>
  );
}

function StatusButton({ active, type, onClick }: { active: boolean; type: 'todo' | 'pending' | 'complete'; onClick: () => void }) {
  const labels = { todo: 'To Do', pending: 'Pending', complete: 'Completed' };
  const activeClasses = { todo: "border-gray-800 bg-gray-100 text-gray-900", pending: "border-orange-500 bg-orange-50 text-orange-900", complete: "border-green-500 bg-green-50 text-green-900" };
  return (
    <button onClick={onClick} className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-all ${active ? activeClasses[type] : "border-gray-200 hover:border-gray-300 text-gray-500 bg-white"}`}>
      <span className="font-medium">{labels[type]}</span>
      {active && <CheckCircle2 size={14} />}
    </button>
  );
}