import { useState } from 'react';
import { LayoutDashboard, UserPlus } from 'lucide-react';
import EmployeeForm from './components/EmployeeForm';
import Dashboard from './components/Dashboard';

type View = 'form' | 'dashboard';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-gray-800">Employee Task Manager</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>
              <button
                onClick={() => setCurrentView('form')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'form'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <UserPlus size={18} />
                Add Employee Task
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="py-8">
        {currentView === 'dashboard' ? <Dashboard /> : <EmployeeForm />}
      </main>
    </div>
  );
}

export default App;
