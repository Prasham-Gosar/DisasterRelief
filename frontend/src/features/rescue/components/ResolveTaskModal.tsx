import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal, Button, Textarea } from '../../../components/ui';

interface ResolveTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
  loading: boolean;
  serverError?: string | null;
}

export function ResolveTaskModal({
  open,
  onClose,
  onSubmit,
  loading,
  serverError,
}: ResolveTaskModalProps) {
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = note.trim();
  const isTooShort = trimmed.length < 5;
  const validationError = touched && isTooShort ? 'Closing note must be at least 5 characters' : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isTooShort) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) {
          setNote('');
          setTouched(false);
          onClose();
        }
      }}
      title="Complete & Resolve Incident"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isTooShort || loading}
            loading={loading}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Resolve Task
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Please provide a final operational remark summarizing the actions taken and outcome before resolving.
        </p>

        <div>
          <label htmlFor="closing-note" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            Closing Note <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="closing-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Fire extinguished, 4 residents assisted, area secured with local police."
            hasError={Boolean(validationError ?? serverError)}
            disabled={loading}
            className="w-full"
          />

          <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
            <span>
              {validationError ? (
                <span className="text-red-600">{validationError}</span>
              ) : serverError ? (
                <span className="text-red-600">{serverError}</span>
              ) : (
                'Minimum 5 characters required'
              )}
            </span>
            <span className={`font-mono ${trimmed.length < 5 ? 'text-amber-600' : 'text-green-600'}`}>
              {trimmed.length} / 5 min
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
