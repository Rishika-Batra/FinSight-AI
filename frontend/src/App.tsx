import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import Transactions from './pages/Transactions';
import Login from './pages/Login';
import Register from './pages/Register';
import PrivateRoute from './components/PrivateRoute';

export const FolderIcon = ({ className = "w-5 h-5 shrink-0" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 5H8V8H22V19H2V5Z"
      fill="#FFD23F"
      stroke="#1A1A2E"
      strokeWidth="2"
      strokeLinejoin="miter"
    />
  </svg>
);

export const SmileyCloud = ({ className = "w-8 h-5 shrink-0" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M8 6H10V4H16V2H22V4H24V6H28V8H30V16H2V8H4V6H8Z" 
      fill="white" 
      stroke="#1A1A2E" 
      strokeWidth="2" 
      strokeLinejoin="miter" 
    />
    <path 
      d="M2 14H30V18H2V14Z" 
      fill="white" 
      stroke="#1A1A2E" 
      strokeWidth="2" 
      strokeLinejoin="miter" 
    />
    <rect x="3" y="13" width="26" height="3" fill="white" />
    <rect x="10" y="8" width="2" height="2" fill="#1A1A2E" />
    <rect x="18" y="8" width="2" height="2" fill="#1A1A2E" />
    <rect x="10" y="11" width="2" height="2" fill="#1A1A2E" />
    <rect x="12" y="13" width="6" height="2" fill="#1A1A2E" />
    <rect x="18" y="11" width="2" height="2" fill="#1A1A2E" />
  </svg>
);

interface BackgroundItem {
  type: 'sparkle' | 'heart' | 'cloud' | 'moon' | 'cluster';
  x: number;
  y: number;
  size: number;
  color: string;
  animate?: boolean;
}

const DECORATIONS: BackgroundItem[] = [
  // Left Sidebar column (x: 2–20)
  { type: 'sparkle', x: 3,  y: 4,  size: 34, color: '#00B4D8' },
  { type: 'heart',   x: 13, y: 11, size: 30, color: '#FF7676', animate: true },
  { type: 'cluster', x: 7,  y: 20, size: 28, color: '#FFDE4D' },
  { type: 'sparkle', x: 17, y: 31, size: 36, color: '#FF6FB5', animate: true },
  { type: 'moon',    x: 5,  y: 43, size: 40, color: '#FFDE4D' },
  { type: 'heart',   x: 15, y: 55, size: 28, color: '#FF6FB5' },
  { type: 'cluster', x: 4,  y: 67, size: 26, color: '#00B4D8' },
  { type: 'cloud',   x: 11, y: 78, size: 68, color: '#FFFFFF' },
  { type: 'sparkle', x: 18, y: 88, size: 32, color: '#FFDE4D', animate: true },
  { type: 'heart',   x: 7,  y: 95, size: 28, color: '#FF7676' },

  // Left-center strip (x: 21–38)
  { type: 'cloud',   x: 24, y: 7,  size: 76, color: '#FFFFFF' },
  { type: 'sparkle', x: 32, y: 3,  size: 40, color: '#FFDE4D', animate: true },
  { type: 'heart',   x: 22, y: 17, size: 32, color: '#FF6FB5' },
  { type: 'moon',    x: 36, y: 24, size: 44, color: '#FFDE4D' },
  { type: 'cluster', x: 27, y: 34, size: 30, color: '#00B4D8' },
  { type: 'sparkle', x: 35, y: 42, size: 38, color: '#FFFFFF', animate: true },
  { type: 'cloud',   x: 23, y: 54, size: 72, color: '#FFF3F8' },
  { type: 'heart',   x: 37, y: 60, size: 30, color: '#FF7676' },
  { type: 'sparkle', x: 26, y: 72, size: 36, color: '#00B4D8' },
  { type: 'moon',    x: 33, y: 82, size: 42, color: '#FFDE4D', animate: true },
  { type: 'cluster', x: 24, y: 92, size: 28, color: '#FF6FB5' },

  // Center strip (x: 39–60)
  { type: 'heart',   x: 42, y: 8,  size: 34, color: '#FF6FB5' },
  { type: 'cluster', x: 52, y: 5,  size: 30, color: '#00B4D8' },
  { type: 'sparkle', x: 46, y: 18, size: 40, color: '#FFFFFF', animate: true },
  { type: 'cloud',   x: 56, y: 22, size: 68, color: '#FFFFFF' },
  { type: 'moon',    x: 41, y: 35, size: 44, color: '#FFDE4D' },
  { type: 'heart',   x: 55, y: 40, size: 32, color: '#FF7676', animate: true },
  { type: 'sparkle', x: 43, y: 50, size: 38, color: '#FFDE4D' },
  { type: 'cluster', x: 58, y: 56, size: 28, color: '#FF6FB5' },
  { type: 'cloud',   x: 44, y: 67, size: 74, color: '#FFF3F8' },
  { type: 'sparkle', x: 54, y: 74, size: 36, color: '#00B4D8', animate: true },
  { type: 'heart',   x: 40, y: 84, size: 30, color: '#FF6FB5' },
  { type: 'moon',    x: 57, y: 90, size: 42, color: '#FFDE4D' },
  { type: 'cluster', x: 48, y: 96, size: 26, color: '#FFFFFF' },

  // Right-center strip (x: 61–80)
  { type: 'sparkle', x: 63, y: 6,  size: 40, color: '#FF6FB5', animate: true },
  { type: 'cloud',   x: 74, y: 11, size: 82, color: '#FFFFFF' },
  { type: 'heart',   x: 64, y: 24, size: 32, color: '#FF7676' },
  { type: 'cluster', x: 78, y: 18, size: 30, color: '#00B4D8' },
  { type: 'moon',    x: 66, y: 36, size: 46, color: '#FFDE4D' },
  { type: 'sparkle', x: 76, y: 42, size: 38, color: '#FFDE4D', animate: true },
  { type: 'cloud',   x: 62, y: 52, size: 70, color: '#FFF3F8' },
  { type: 'heart',   x: 79, y: 58, size: 30, color: '#FF6FB5', animate: true },
  { type: 'cluster', x: 70, y: 65, size: 28, color: '#FFFFFF' },
  { type: 'sparkle', x: 65, y: 76, size: 42, color: '#00B4D8' },
  { type: 'moon',    x: 77, y: 82, size: 44, color: '#FFDE4D' },
  { type: 'heart',   x: 63, y: 90, size: 30, color: '#FF7676' },
  { type: 'cluster', x: 73, y: 95, size: 26, color: '#FF6FB5' },

  // Far right column (x: 81–98)
  { type: 'heart',   x: 90, y: 4,  size: 34, color: '#FF7676' },
  { type: 'cloud',   x: 84, y: 14, size: 78, color: '#FFFFFF' },
  { type: 'sparkle', x: 95, y: 10, size: 38, color: '#FFDE4D', animate: true },
  { type: 'moon',    x: 83, y: 26, size: 46, color: '#FFDE4D' },
  { type: 'cluster', x: 93, y: 22, size: 30, color: '#00B4D8' },
  { type: 'heart',   x: 87, y: 38, size: 32, color: '#FF6FB5' },
  { type: 'sparkle', x: 97, y: 32, size: 36, color: '#FFFFFF', animate: true },
  { type: 'cloud',   x: 82, y: 48, size: 68, color: '#FFF3F8' },
  { type: 'moon',    x: 94, y: 52, size: 44, color: '#FFDE4D', animate: true },
  { type: 'sparkle', x: 86, y: 62, size: 40, color: '#00B4D8' },
  { type: 'heart',   x: 96, y: 68, size: 30, color: '#FF7676' },
  { type: 'cluster', x: 82, y: 76, size: 28, color: '#FFDE4D' },
  { type: 'cloud',   x: 91, y: 83, size: 72, color: '#FFFFFF' },
  { type: 'sparkle', x: 98, y: 90, size: 36, color: '#FF6FB5', animate: true },
  { type: 'heart',   x: 85, y: 94, size: 30, color: '#FF7676' },
  { type: 'cluster', x: 94, y: 97, size: 26, color: '#00B4D8' },
];

const AmbientBackground = ({ opacity }: { opacity: number }) => {
  return (
    <div 
      className="fixed inset-0 pointer-events-none select-none z-0 transition-opacity duration-300" 
      style={{ opacity }}
      aria-hidden="true"
    >
      {DECORATIONS.map((item, idx) => {
        const style = {
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `${item.size}px`,
          height: `${item.size}px`,
        };
        const animClass = item.animate ? 'animate-pulse-slow' : '';
        
        return (
          <div 
            key={idx} 
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${animClass}`} 
            style={style}
          >
            {item.type === 'sparkle' && (
              <svg viewBox="0 0 8 8" fill="none" className="w-full h-full" style={{ color: item.color }}>
                <path d="M4,0 Q4,4 8,4 Q4,4 4,8 Q4,4 0,4 Q4,4 4,0" fill="currentColor" />
              </svg>
            )}
            {item.type === 'heart' && (
              <svg viewBox="0 0 8 6" fill="none" className="w-full h-full" style={{ color: item.color }}>
                <path d="M1,0 h2 v1 h-2 z M5,0 h2 v1 h-2 z M0,1 h8 v2 h-8 z M1,3 h6 v1 h-6 z M2,4 h4 v1 h-4 z M3,5 h2 v1 h-2 z" fill="currentColor" />
              </svg>
            )}
            {item.type === 'cloud' && (
              <svg viewBox="0 0 24 12" fill="none" className="w-full h-full" style={{ color: item.color }}>
                <path d="M6,2 h12 v2 h-12 z M4,4 h16 v2 h-16 z M2,6 h20 v4 h-20 z M4,10 h16 v2 h-16 z" fill="currentColor" />
              </svg>
            )}
            {item.type === 'moon' && (
              <svg viewBox="0 0 10 12" fill="none" className="w-full h-full" style={{ color: item.color }}>
                <path d="M4,0h3v2h-1v2h-1v4h1v2h1v2h-3v-1h-1v-2h-1v-4h1v-2h1v-1h1z" fill="currentColor" />
              </svg>
            )}
            {item.type === 'cluster' && (
              <svg viewBox="0 0 3 3" fill="none" className="w-full h-full" style={{ color: item.color }}>
                <path d="M1,0 h1 v3 h-1 z M0,1 h3 v1 h-3 z" fill="currentColor" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
};

function NavigationLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isAuthPage = currentPath === '/login' || currentPath === '/register';

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
  };

  if (isAuthPage) {
    return <div className="min-h-screen bg-[#FDF6E3] text-[#1A1A2E] font-sans selection:bg-[#FF6FB5] selection:text-white">{children}</div>;
  }

  const isTransactionsPage = currentPath.startsWith('/transactions');
  const bgOpacity = isTransactionsPage ? 0.28 : 0.45;

  return (
    <div className="min-h-screen bg-[#FDF6E3] text-[#1A1A2E] flex flex-col md:flex-row font-sans selection:bg-[#FF6FB5] selection:text-white relative">
      {/* Dense background overlay */}
      <AmbientBackground opacity={bgOpacity} />

      {/* Sidebar navigation styled like a retro folder view */}
      <aside className="w-full md:w-68 bg-[#F5EBE6] border-b-2 md:border-b-0 md:border-r-2 border-[#1A1A2E] p-6 flex flex-col justify-between relative z-10" id="sidebar-navigation">
        <div className="space-y-8">
          <div className="bg-[#FF6FB5] border-2 border-[#1A1A2E] p-3 shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-between">
            <span className="text-sm font-bold font-retro-title text-[#1A1A2E] uppercase tracking-wider flex items-center gap-2">
              <SmileyCloud className="w-6 h-4" />
              FinSight
            </span>
            <span className="text-xs font-bold text-[#1A1A2E] font-retro-mono">v1.0</span>
          </div>

          <nav className="flex flex-col gap-3">
            <Link
              to="/dashboard"
              id="sidebar-link-dashboard"
              className={`flex items-center gap-3 px-4 py-2.5 border-2 border-[#1A1A2E] text-sm font-retro-title uppercase tracking-wide transition-all ${
                currentPath === '/dashboard'
                  ? 'bg-[#FFDE4D] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] translate-x-0.5 translate-y-0.5'
                  : 'bg-white text-[#1A1A2E] hover:bg-[#FF6FB5]/20 shadow-[4px_4px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#1A1A2E]'
              }`}
            >
              <FolderIcon className="w-4 h-4" /> Dashboard
            </Link>

            <Link
              to="/budget"
              id="sidebar-link-budget"
              className={`flex items-center gap-3 px-4 py-2.5 border-2 border-[#1A1A2E] text-sm font-retro-title uppercase tracking-wide transition-all ${
                currentPath === '/budget'
                  ? 'bg-[#FFDE4D] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] translate-x-0.5 translate-y-0.5'
                  : 'bg-white text-[#1A1A2E] hover:bg-[#FF6FB5]/20 shadow-[4px_4px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#1A1A2E]'
              }`}
            >
              <FolderIcon className="w-4 h-4" /> Budget Overview
            </Link>

            <Link
              to="/transactions"
              id="sidebar-link-transactions"
              className={`flex items-center gap-3 px-4 py-2.5 border-2 border-[#1A1A2E] text-sm font-retro-title uppercase tracking-wide transition-all ${
                currentPath.startsWith('/transactions')
                  ? 'bg-[#FFDE4D] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] translate-x-0.5 translate-y-0.5'
                  : 'bg-white text-[#1A1A2E] hover:bg-[#FF6FB5]/20 shadow-[4px_4px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#1A1A2E]'
              }`}
            >
              <FolderIcon className="w-4 h-4" /> Transactions
            </Link>

            <button
              onClick={handleLogout}
              id="sidebar-logout-btn"
              className="flex items-center gap-3 px-4 py-2.5 border-2 border-[#1A1A2E] text-sm font-retro-title uppercase tracking-wide bg-[#FF7676] text-[#1A1A2E] hover:bg-red-400 shadow-[4px_4px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#1A1A2E] cursor-pointer text-left"
            >
              <span className="text-base">🚪</span> Sign Out
            </button>
          </nav>
        </div>

        <div className="hidden md:block pt-6 border-t-2 border-[#1A1A2E] text-xs font-retro-mono font-bold text-[#1A1A2E]/70">
          <div className="flex items-center justify-between">
            <div>
              SYSTEM: READY<br />
              © 2026 FINSIGHT AI
            </div>
            {/* Equalizer graphic */}
            <div className="flex items-end gap-[2px] h-6 pb-1 opacity-80" aria-hidden="true">
              {[4, 10, 15, 8, 18, 12, 6, 14, 9, 5].map((height, i) => (
                <span
                  key={i}
                  style={{ height: `${height}px` }}
                  className="w-[3px] bg-[#FF6FB5] border-t border-l border-r border-[#1A1A2E] block"
                />
              ))}
            </div>
          </div>
        </div>
      </aside>


      {/* Main Content Area */}
      <div className="flex-1 overflow-x-hidden p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigationLayout>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/transactions" element={<Transactions />} />
          </Route>

          {/* Redirect to dashboard on load (guarded route, defaults to /login if unauthenticated) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </NavigationLayout>
    </BrowserRouter>
  );
}
