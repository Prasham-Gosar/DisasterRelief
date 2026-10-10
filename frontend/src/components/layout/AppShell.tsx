import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import {
  Menu,
  X,
  Bell,
  HelpCircle,
  LogOut,
  LayoutDashboard,
  AlertTriangle,
  Map as MapIcon,
  Users,
  Radio,
  ChevronDown,
} from 'lucide-react';
import { roleLabel } from '../../lib/format';

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navLinks = getNavLinks(user?.role);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 focus-ring rounded-ui px-1">
              <div className="bg-brand-600 text-white font-bold text-sm px-2 py-1 rounded">
                DRRCP
              </div>
              <span className="hidden sm:inline text-sm font-medium text-gray-600">
                Disaster Relief Platform
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-ui text-sm font-medium transition-colors focus-ring
                    ${isActive(link.to)
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <link.icon className="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Notification bell placeholder */}
              <Link
                to="/notifications"
                className="p-2 rounded-ui text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-ring"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </Link>

              {/* Help */}
              <Link
                to="#"
                className="hidden sm:flex p-2 rounded-ui text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-ring"
                aria-label="Help"
              >
                <HelpCircle className="h-5 w-5" />
              </Link>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-ui text-sm font-medium text-gray-700 hover:bg-gray-100 focus-ring"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                    {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <span className="hidden sm:inline max-w-[120px] truncate">{user?.name}</span>
                  <ChevronDown className="h-4 w-4 hidden sm:block" aria-hidden="true" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 z-50 mt-1 w-56 bg-white rounded-ui border border-gray-200 shadow-lg py-1">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {user?.role ? roleLabel(user.role) : ''}
                        </p>
                      </div>
                      <Link
                        to="#"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-ring sm:hidden"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <HelpCircle className="h-4 w-4" />
                        Help
                      </Link>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout();
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 focus-ring"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-ui text-gray-500 hover:bg-gray-100 focus-ring"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-gray-200 px-4 py-3 space-y-1" aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-ui text-sm font-medium transition-colors focus-ring
                  ${isActive(link.to)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
              >
                <link.icon className="h-5 w-5" aria-hidden="true" />
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

interface NavLink {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

function getNavLinks(role: string | undefined): NavLink[] {
  if (role === 'coordinator') {
    return [
      { to: '/coordinator/incidents', label: 'Incidents', icon: AlertTriangle },
      { to: '/coordinator/operations', label: 'Operations', icon: Radio },
      { to: '/coordinator/map', label: 'Map', icon: MapIcon },
      { to: '/coordinator/teams', label: 'Teams', icon: Users },
    ];
  }
  if (role === 'rescue_team_member') {
    return [
      { to: '/team', label: 'Dashboard', icon: LayoutDashboard },
    ];
  }
  return [];
}
