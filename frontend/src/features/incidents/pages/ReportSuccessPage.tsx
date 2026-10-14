import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Copy, Check, Info } from 'lucide-react';
import { Button, Card, EmptyState, StatusBadge } from '../../../components/ui';
import type { ReportSuccessState } from '../types';

export function ReportSuccessPage() {
  const state = useLocation().state as ReportSuccessState | null;
  const [copied, setCopied] = useState(false);

  // someone opened /report/success directly (no report was just sent)
  if (!state?.tracking_ref) {
    return (
      <EmptyState
        title="No report to show"
        description="Start a new report, or track one you already sent."
        action={
          <div className="flex gap-3">
            <Link to="/report" className="font-medium text-brand-700 underline">Report an emergency</Link>
            <Link to="/track" className="font-medium text-brand-700 underline">Track a report</Link>
          </div>
        }
      />
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.tracking_ref);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // clipboard blocked: the number is on screen, they can copy it by hand
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 text-center">
      <div className="space-y-2">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">Report received</h1>
        <p className="text-gray-600">A coordinator will check it shortly. We also sent you a confirmation message.</p>
      </div>

      <Card className="space-y-3">
        <p className="text-sm font-medium text-gray-500">Your tracking number</p>
        <p className="select-all break-all text-3xl font-bold tracking-wide text-gray-900">{state.tracking_ref}</p>
        <div className="flex items-center justify-center gap-3">
          <StatusBadge type="incident" status={state.status} />
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-sm text-gray-600" aria-live="polite">
          Save this number. You will need it, with your phone number, to check progress.
        </p>
      </Card>

      {state.possible_duplicate && (
        <div className="flex items-start gap-3 rounded-ui border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900" role="status">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Someone nearby may have already reported the same emergency. Your report is saved and
            will still be reviewed, so there is nothing more you need to do.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          to={`/track?ref=${encodeURIComponent(state.tracking_ref)}`}
          state={{ ref: state.tracking_ref, phone: state.phone }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-ui bg-brand-600 px-5 font-medium text-white hover:bg-brand-700 focus-ring"
        >
          Track this report
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center justify-center rounded-ui border border-gray-300 bg-white px-5 font-medium text-gray-700 hover:bg-gray-50 focus-ring"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
