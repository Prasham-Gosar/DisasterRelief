import { Link, Outlet } from 'react-router-dom';

export function PublicShell() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 focus-ring rounded-ui px-1">
              <div className="bg-brand-600 text-white font-bold text-sm px-2 py-1 rounded">
                DRRCP
              </div>
            </Link>
            <nav className="flex items-center gap-4 text-sm" aria-label="Public navigation">
              <Link
                to="/report"
                className="text-gray-600 hover:text-brand-600 font-medium focus-ring rounded-ui px-2 py-1"
              >
                Report
              </Link>
              <Link
                to="/track"
                className="text-gray-600 hover:text-brand-600 font-medium focus-ring rounded-ui px-2 py-1"
              >
                Track
              </Link>
              <Link
                to="/login"
                className="text-brand-600 hover:text-brand-700 font-medium focus-ring rounded-ui px-2 py-1"
              >
                Login
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
