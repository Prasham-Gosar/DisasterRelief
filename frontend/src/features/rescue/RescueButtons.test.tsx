import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RescueTaskCard } from './components/RescueTaskCard';
import { ResolveTaskModal } from './components/ResolveTaskModal';
import type { RescueTask } from '../../lib/types';

const mockTask: RescueTask = {
  assignment_id: 101,
  status: 'assigned',
  assigned_at: '2026-10-15T10:00:00Z',
  team: { id: 1, name: 'Alpha Rescue' },
  report: {
    id: 50,
    tracking_ref: 'INC-FLOOD-01',
    incident_type: 'flood',
    severity: 'high',
    status: 'assigned',
    location: 'Sector 5, Riverside',
    latitude: 18.52,
    longitude: 73.85,
    description: 'Water rising rapidly near residential complex.',
    reporter_phone: '9876543210',
  },
};

describe('Rescue Status Flow & Buttons Step Logic', () => {
  it('only enables "I am en route" when task status is assigned', async () => {
    const onUpdateStatus = vi.fn();
    const user = userEvent.setup();

    render(
      <RescueTaskCard
        task={{ ...mockTask, status: 'assigned' }}
        effectiveStatus="assigned"
        onUpdateStatus={onUpdateStatus}
        isLoading={false}
      />,
    );

    const enRouteBtn = screen.getByRole('button', { name: /i am en route/i });
    expect(enRouteBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am on site/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark resolved/i })).not.toBeInTheDocument();

    await user.click(enRouteBtn);
    expect(onUpdateStatus).toHaveBeenCalledWith('en_route');
  });

  it('only enables "I am on site" when task status is en_route', async () => {
    const onUpdateStatus = vi.fn();
    const user = userEvent.setup();

    render(
      <RescueTaskCard
        task={{ ...mockTask, status: 'en_route' }}
        effectiveStatus="en_route"
        onUpdateStatus={onUpdateStatus}
        isLoading={false}
      />,
    );

    const onSiteBtn = screen.getByRole('button', { name: /i am on site/i });
    expect(onSiteBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am en route/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark resolved/i })).not.toBeInTheDocument();

    await user.click(onSiteBtn);
    expect(onUpdateStatus).toHaveBeenCalledWith('on_site');
  });

  it('only enables "Mark resolved" when task status is on_site', async () => {
    const onUpdateStatus = vi.fn();
    const user = userEvent.setup();

    render(
      <RescueTaskCard
        task={{ ...mockTask, status: 'on_site' }}
        effectiveStatus="on_site"
        onUpdateStatus={onUpdateStatus}
        isLoading={false}
      />,
    );

    const resolvedBtn = screen.getByRole('button', { name: /mark resolved/i });
    expect(resolvedBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am en route/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am on site/i })).not.toBeInTheDocument();

    await user.click(resolvedBtn);
    expect(onUpdateStatus).toHaveBeenCalledWith('resolved');
  });

  it('shows completed message when task status is resolved', () => {
    render(
      <RescueTaskCard
        task={{ ...mockTask, status: 'resolved' }}
        effectiveStatus="resolved"
        onUpdateStatus={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/task completed successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am en route/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i am on site/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark resolved/i })).not.toBeInTheDocument();
  });
});

describe('ResolveTaskModal Validation (Closing note required >= 5 chars)', () => {
  it('keeps Resolve button disabled when closing note is empty', () => {
    render(
      <ResolveTaskModal
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        loading={false}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /resolve task/i });
    expect(submitBtn).toBeDisabled();
  });

  it('keeps Resolve button disabled when closing note has fewer than 5 characters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ResolveTaskModal
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        loading={false}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /closing note/i });
    await user.type(textarea, 'Done');
    await user.tab();

    const submitBtn = screen.getByRole('button', { name: /resolve task/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/closing note must be at least 5 characters/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enables Resolve button and submits trimmed note when note >= 5 characters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ResolveTaskModal
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        loading={false}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /closing note/i });
    await user.type(textarea, '  All residents evacuated safely to relief camp.  ');

    const submitBtn = screen.getByRole('button', { name: /resolve task/i });
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith('All residents evacuated safely to relief camp.');
  });
});
