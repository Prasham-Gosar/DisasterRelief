import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import { Spinner } from '../ui/Spinner';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

interface RequireRoleProps {
  allowed: Role[];
  children: React.ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowed.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldAlert className="h-16 w-16 text-danger-400 mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">403 – Access Denied</h1>
      <p className="text-gray-500 mb-6 max-w-md">
        You don&apos;t have permission to access this page. Contact your administrator if you believe
        this is an error.
      </p>
      <Link
        to="/"
        className="inline-flex items-center px-4 py-2 rounded-ui bg-brand-600 text-white font-medium hover:bg-brand-700 focus-ring"
      >
        Go to Home
      </Link>
    </div>
  );
}
