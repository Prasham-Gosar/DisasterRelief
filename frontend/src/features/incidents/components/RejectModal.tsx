import { useEffect, useState } from 'react';
import { Button, Modal, Textarea } from '../../../components/ui';

const MIN_REMARK = 5;

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (remark: string) => void;
  loading?: boolean;
  /** error text coming back from the server (shown inside the dialog) */
  serverError?: string | null;
}

/** BR-1 / SD msg 8: rejecting needs a written reason, checked here AND by the API */
export function RejectModal({ open, onClose, onConfirm, loading = false, serverError }: RejectModalProps) {
  const [remark, setRemark] = useState('');
  const [touched, setTouched] = useState(false);

  // start fresh every time the dialog opens
  useEffect(() => {
    if (open) {
      setRemark('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = remark.trim();
  const valid = trimmed.length >= MIN_REMARK;
  const showError = touched && !valid;

  const submit = () => {
    setTouched(true);
    if (valid) onConfirm(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title="Reject this report"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={loading} disabled={!valid}>Reject report</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-600">
        The citizen will be told why. Explain briefly, for example "Duplicate of DRR-2026-000012" or "No emergency found at this location".
      </p>
      <label htmlFor="reject-remark" className="mb-1.5 block text-sm font-medium text-gray-700">
        Reason <span className="text-danger-500" aria-hidden="true">*</span>
      </label>
      <Textarea
        id="reject-remark"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        onBlur={() => setTouched(true)}
        hasError={showError}
        aria-invalid={showError}
        aria-describedby="reject-remark-help"
        maxLength={1000}
        placeholder="Why is this report being rejected?"
      />
      <p id="reject-remark-help" className={`mt-1 text-xs ${showError ? 'text-danger-600' : 'text-gray-500'}`} role={showError ? 'alert' : undefined}>
        {showError ? `A reason is required (at least ${MIN_REMARK} characters).` : `At least ${MIN_REMARK} characters. ${trimmed.length}/1000`}
      </p>
      {serverError && <p className="mt-3 text-sm text-danger-600" role="alert">{serverError}</p>}
    </Modal>
  );
}
