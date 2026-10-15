import { updateTaskStatus } from '../features/rescue/api';
import { ApiError } from './api';

export const QUEUE_KEY = 'drrcp_status_queue';

export interface QueueItem {
  assignment_id: number;
  status: string;
  closing_note?: string | null;
  client_update_id: string;
  queued_at: string;
}

export interface FlushResult {
  processed: number;
  dropped: number;
  remaining: number;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function listQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueue(
  item: Omit<QueueItem, 'client_update_id' | 'queued_at'>,
): QueueItem {
  const current = listQueue();
  const newItem: QueueItem = {
    ...item,
    client_update_id: generateUUID(),
    queued_at: new Date().toISOString(),
  };
  current.push(newItem);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(current));
  return newItem;
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export async function flushQueue(): Promise<FlushResult> {
  const queue = listQueue();
  if (queue.length === 0) {
    return { processed: 0, dropped: 0, remaining: 0 };
  }

  let processed = 0;
  let dropped = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await updateTaskStatus(
        item.assignment_id,
        item.status,
        item.closing_note,
        item.client_update_id,
      );

      // On success: remove this item and persist
      processed++;
      const remainingItems = listQueue().filter(
        (q) => q.client_update_id !== item.client_update_id,
      );
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingItems));
    } catch (err: unknown) {
      const isBusinessError =
        err instanceof ApiError && err.status >= 400 && err.status < 500;

      if (isBusinessError) {
        // Business error like INVALID_TRANSITION or REMARK_REQUIRED: drop item and log
        console.warn(
          `[offlineQueue] Business error (${err.code}): removing item ${item.client_update_id}`,
          err,
        );
        dropped++;
        const remainingItems = listQueue().filter(
          (q) => q.client_update_id !== item.client_update_id,
        );
        localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingItems));
        // Continue processing remaining items
        continue;
      }

      // Network error (err.status === 0 or no response) or server 5xx: STOP and keep rest
      console.warn('[offlineQueue] Network or server error, stopping queue flush:', err);
      break;
    }
  }

  const remaining = listQueue().length;
  return { processed, dropped, remaining };
}

// Export default object with same methods for convenience
export const offlineQueue = {
  enqueue,
  list: listQueue,
  clear: clearQueue,
  flush: flushQueue,
};
