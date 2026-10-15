import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../components/ui/Toast';
import { ReassignModal } from './ReassignModal';
import * as dispatchApi from '../api';
import { ApiError } from '../../../lib/api';
import type { DispatchAssignment } from '../../../lib/types';

vi.mock('../api', () => ({
  fetchAvailableTeams: vi.fn(),
  reassignTeam: vi.fn(),
}));

const mockAssignment: DispatchAssignment = {
  assignment_id: 10,
  status: 'assigned',
  assigned_at: '2026-10-15T09:00:00Z',
  elapsed_minutes: 25,
  overdue: false,
  overdue_minutes: 0,
  team: { id: 1, name: 'Team Alpha', team_type: 'fire' },
  report: {
    id: 99,
    tracking_ref: 'INC-FIRE-99',
    incident_type: 'fire',
    severity: 'critical',
    status: 'assigned',
    location: 'Downtown Market',
  },
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ReassignModal (Reason Mandatory >= 5 Chars)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dispatchApi.fetchAvailableTeams).mockResolvedValue({
      report_id: 99,
      items: [
        {
          team_id: 2,
          name: 'Team Bravo',
          team_type: 'fire',
          distance_km: 3.5,
          member_count: 5,
          suitable: true,
        },
      ],
    });
  });

  it('keeps Confirm Reassignment button disabled when reason is empty', () => {
    renderWithClient(
      <ReassignModal
        open={true}
        onClose={vi.fn()}
        assignment={mockAssignment}
      />,
    );

    const confirmBtn = screen.getByRole('button', { name: /confirm reassignment/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('keeps button disabled when reason is less than 5 characters and displays error message', async () => {
    const user = userEvent.setup();

    renderWithClient(
      <ReassignModal
        open={true}
        onClose={vi.fn()}
        assignment={mockAssignment}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /reason for reassignment/i });
    await user.type(textarea, 'late');
    await user.tab();

    const confirmBtn = screen.getByRole('button', { name: /confirm reassignment/i });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/reason must be at least 5 characters/i)).toBeInTheDocument();
  });

  it('enables button and calls reassignTeam when reason has >= 5 characters', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(dispatchApi.reassignTeam).mockResolvedValue({} as any);

    renderWithClient(
      <ReassignModal
        open={true}
        onClose={onClose}
        assignment={mockAssignment}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /reason for reassignment/i });
    await user.type(textarea, 'Unit vehicle broke down, dispatching backup unit.');

    const confirmBtn = screen.getByRole('button', { name: /confirm reassignment/i });
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);

    expect(dispatchApi.reassignTeam).toHaveBeenCalledWith(99, {
      from_team_id: 1,
      to_team_id: null,
      reason: 'Unit vehicle broke down, dispatching backup unit.',
    });
  });

  it('maps NO_TEAM_AVAILABLE error code to friendly message', async () => {
    const user = userEvent.setup();
    vi.mocked(dispatchApi.reassignTeam).mockRejectedValue(
      new ApiError('NO_TEAM_AVAILABLE', 'No team found', 400),
    );

    renderWithClient(
      <ReassignModal
        open={true}
        onClose={vi.fn()}
        assignment={mockAssignment}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /reason for reassignment/i });
    await user.type(textarea, 'Team stuck in traffic');

    const confirmBtn = screen.getByRole('button', { name: /confirm reassignment/i });
    await user.click(confirmBtn);

    expect(await screen.findByText('No other team is available')).toBeInTheDocument();
  });
});
