import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
      <p className="text-xl font-semibold text-gray-700 mb-4">Page Not Found</p>
      <p className="text-gray-500 mb-6 max-w-md">
        The page you are looking for doesn't exist or has been moved.
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
