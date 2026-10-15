import { describe, expect, it, vi, beforeEach } from 'vitest';
import { enqueue, listQueue, flushQueue } from './offlineQueue';
import * as rescueApi from '../features/rescue/api';
import { ApiError } from './api';

vi.mock('../features/rescue/api', () => ({
  updateTaskStatus: vi.fn(),
}));

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('enqueues an item and persists to localStorage with UUID and timestamp', () => {
    const item = enqueue({
      assignment_id: 42,
      status: 'en_route',
      closing_note: null,
    });

    expect(item.assignment_id).toBe(42);
    expect(item.status).toBe('en_route');
    expect(item.client_update_id).toBeDefined();
    expect(item.queued_at).toBeDefined();

    const stored = listQueue();
    expect(stored).toHaveLength(1);
    expect(stored[0].client_update_id).toBe(item.client_update_id);
  });

  it('flushes items in order and removes each upon successful API response', async () => {
    enqueue({ assignment_id: 10, status: 'en_route' });
    enqueue({ assignment_id: 10, status: 'on_site' });
    enqueue({ assignment_id: 10, status: 'resolved', closing_note: 'Resolved note' });

    expect(listQueue()).toHaveLength(3);

    vi.mocked(rescueApi.updateTaskStatus).mockResolvedValue({} as any);

    const result = await flushQueue();

    expect(result.processed).toBe(3);
    expect(result.dropped).toBe(0);
    expect(result.remaining).toBe(0);

    expect(rescueApi.updateTaskStatus).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(rescueApi.updateTaskStatus).mock.calls;
    expect(calls[0][1]).toBe('en_route');
    expect(calls[1][1]).toBe('on_site');
    expect(calls[2][1]).toBe('resolved');

    expect(listQueue()).toHaveLength(0);
  });

  it('drops items and continues on 4xx business errors (e.g. INVALID_TRANSITION or REMARK_REQUIRED)', async () => {
    enqueue({ assignment_id: 10, status: 'resolved', closing_note: 'short' });
    enqueue({ assignment_id: 11, status: 'en_route' });

    // First call fails with 400 REMARK_REQUIRED
    vi.mocked(rescueApi.updateTaskStatus)
      .mockRejectedValueOnce(new ApiError('REMARK_REQUIRED', 'Remark required', 400))
      .mockResolvedValueOnce({} as any);

    const result = await flushQueue();

    expect(result.dropped).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(rescueApi.updateTaskStatus).toHaveBeenCalledTimes(2);
    expect(listQueue()).toHaveLength(0);
  });

  it('stops queue processing and keeps all remaining items upon network error', async () => {
    enqueue({ assignment_id: 1, status: 'en_route' });
    enqueue({ assignment_id: 2, status: 'on_site' });

    // First call fails with network error (status 0)
    vi.mocked(rescueApi.updateTaskStatus).mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 'Network connection failed', 0),
    );

    const result = await flushQueue();

    expect(result.processed).toBe(0);
    expect(result.dropped).toBe(0);
    expect(result.remaining).toBe(2);

    // Only attempted first call; stopped before second call
    expect(rescueApi.updateTaskStatus).toHaveBeenCalledTimes(1);
    expect(listQueue()).toHaveLength(2);
  });
});
