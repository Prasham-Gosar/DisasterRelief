import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Input, Spinner, useToast } from '../../../components/ui';
import { fetchDispatchSettings, updateDispatchSettings } from '../api';
import { dispatchKeys } from '../queryKeys';
import { ApiError } from '../../../lib/api';

interface OverdueSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function OverdueSettingsModal({ open, onClose }: OverdueSettingsModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [minutes, setMinutes] = useState<string>('30');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: dispatchKeys.settings(),
    queryFn: fetchDispatchSettings,
    enabled: open,
  });

  useEffect(() => {
    if (data?.overdue_minutes !== undefined) {
      setMinutes(String(data.overdue_minutes));
      setErrorMsg(null);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (val: number) => updateDispatchSettings(val),
    onSuccess: (res) => {
      toast('success', `Overdue response threshold updated to ${res.overdue_minutes} minutes`);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.all });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to update settings';
      setErrorMsg(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(minutes, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 600) {
      setErrorMsg('Overdue limit must be between 1 and 600 minutes');
      return;
    }
    setErrorMsg(null);
    mutation.mutate(parsed);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title="Overdue Response Limit Settings"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={mutation.isPending || isLoading}
            loading={mutation.isPending}
          >
            Save Settings
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Set the maximum elapsed time before an ongoing incident response is flagged as overdue on the operations board.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
            <Spinner size="sm" />
            <span>Loading settings...</span>
          </div>
        ) : (
          <div>
            <label
              htmlFor="overdue-minutes-input"
              className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
            >
              Overdue Limit (Minutes) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="overdue-minutes-input"
                type="number"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setErrorMsg(null);
                }}
                disabled={mutation.isPending}
                className="w-32"
                autoFocus
              />
              <span className="text-sm text-gray-500">minutes (1 - 600)</span>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errorMsg}</p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
