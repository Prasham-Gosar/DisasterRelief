import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectModal } from './RejectModal';

const setup = (props: Partial<React.ComponentProps<typeof RejectModal>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<RejectModal open onClose={onClose} onConfirm={onConfirm} {...props} />);
  return { onConfirm, onClose, user: userEvent.setup() };
};

describe('RejectModal (BR-1: a reason is mandatory)', () => {
  it('keeps Reject disabled while the reason is empty', () => {
    const { onConfirm } = setup();
    const button = screen.getByRole('button', { name: /reject report/i });
    expect(button).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps Reject disabled for a reason under 5 characters and explains why after leaving the field', async () => {
    const { onConfirm, user } = setup();
    await user.type(screen.getByRole('textbox'), 'no');
    await user.tab(); // leave the field
    expect(screen.getByRole('button', { name: /reject report/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 5 characters/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores spaces when counting the reason', async () => {
    const { user } = setup();
    await user.type(screen.getByRole('textbox'), '      ab   ');
    expect(screen.getByRole('button', { name: /reject report/i })).toBeDisabled();
  });

  it('confirms with the trimmed reason once it is long enough', async () => {
    const { onConfirm, user } = setup();
    await user.type(screen.getByRole('textbox'), '  Not a real flood  ');
    await user.click(screen.getByRole('button', { name: /reject report/i }));
    expect(onConfirm).toHaveBeenCalledWith('Not a real flood');
  });

  it('shows an error that came back from the server', () => {
    setup({ serverError: 'This report was just updated by someone else.' });
    expect(screen.getByText(/just updated by someone else/i)).toBeInTheDocument();
  });
});
