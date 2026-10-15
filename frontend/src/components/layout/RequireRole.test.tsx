import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from './RequireRole';
import * as authModule from '../../lib/auth';
import type { User } from '../../lib/types';

vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(),
}));

describe('RequireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when user is logged out', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn().mockReturnValue(false),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireRole allowed={['coordinator']}>
                <div>Protected Coordinator Content</div>
              </RequireRole>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected Coordinator Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders 403 Access Denied when user has the wrong role', () => {
    const citizenUser: User = {
      id: 1,
      name: 'Test Citizen',
      email: 'citizen@test.com',
      role: 'citizen',
      public_code: 'CIT-1',
    };

    vi.mocked(authModule.useAuth).mockReturnValue({
      user: citizenUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn().mockImplementation((...roles) => roles.includes('citizen')),
    });

    render(
      <MemoryRouter initialEntries={['/coordinator']}>
        <Routes>
          <Route
            path="/coordinator"
            element={
              <RequireRole allowed={['coordinator']}>
                <div>Protected Coordinator Content</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected Coordinator Content')).not.toBeInTheDocument();
    expect(screen.getByText(/403 – Access Denied/i)).toBeInTheDocument();
  });

  it('renders children when user role matches allowed roles', () => {
    const coordinatorUser: User = {
      id: 2,
      name: 'Test Coordinator',
      email: 'coordinator@test.com',
      role: 'coordinator',
      public_code: 'COORD-1',
    };

    vi.mocked(authModule.useAuth).mockReturnValue({
      user: coordinatorUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn().mockImplementation((...roles) => roles.includes('coordinator')),
    });

    render(
      <MemoryRouter initialEntries={['/coordinator']}>
        <Routes>
          <Route
            path="/coordinator"
            element={
              <RequireRole allowed={['coordinator']}>
                <div>Protected Coordinator Content</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected Coordinator Content')).toBeInTheDocument();
  });
});
