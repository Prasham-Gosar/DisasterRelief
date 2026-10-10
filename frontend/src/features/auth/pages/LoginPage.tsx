import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, ApiError } from '../../../lib/auth';
import { Button, Input, FormField, ErrorBanner } from '../../../components/ui';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { Role } from '../../../lib/types';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

function getRedirectForRole(role: Role): string {
  switch (role) {
    case 'coordinator':
      return '/coordinator/incidents';
    case 'rescue_team_member':
      return '/team';
    default:
      return '/';
  }
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setApiError(null);
    try {
      const user = await login(data.email, data.password);
      const redirectTo = from ?? getRedirectForRole(user.role);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setApiError('Wrong email or password');
        } else {
          setApiError(err.message);
        }
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-brand-100 mb-4">
            <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in to DRRCP</h1>
          <p className="mt-2 text-sm text-gray-500">
            Disaster Relief and Rescue Coordination Platform
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-ui border border-gray-200 shadow-sm p-6 sm:p-8">
          {apiError && <ErrorBanner message={apiError} className="mb-4" />}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField label="Email" error={errors.email?.message} required>
              {(fieldProps) => (
                <Input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@drrcp.test"
                  hasError={!!errors.email}
                  {...fieldProps}
                />
              )}
            </FormField>

            <FormField label="Password" error={errors.password?.message} required>
              {(fieldProps) => (
                <div className="relative">
                  <Input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    hasError={!!errors.password}
                    className="pr-10"
                    {...fieldProps}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus-ring rounded p-0.5"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </FormField>

            <Button type="submit" loading={isSubmitting} className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        {/* Link back to home */}
        <p className="text-center text-sm text-gray-500">
          <Link to="/" className="text-brand-600 hover:text-brand-700 font-medium focus-ring rounded">
            ← Back to home
          </Link>
        </p>

        {/* Dev hint box */}
        {import.meta.env.DEV && (
          <div className="bg-amber-50 border border-amber-200 rounded-ui p-4 text-xs">
            <p className="font-semibold text-amber-800 mb-2">🧪 Demo Accounts (dev only)</p>
            <table className="w-full text-amber-700">
              <thead>
                <tr className="text-left">
                  <th className="pb-1 font-medium">Email</th>
                  <th className="pb-1 font-medium">Password</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr><td>coordinator@drrcp.test</td><td>Coord@123</td></tr>
                <tr><td>admin@drrcp.test</td><td>Admin@123</td></tr>
                <tr><td>fire.alpha1@drrcp.test</td><td>Rescue@123</td></tr>
                <tr><td>med.bravo1@drrcp.test</td><td>Rescue@123</td></tr>
                <tr><td>ndrf.charlie1@drrcp.test</td><td>Rescue@123</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
