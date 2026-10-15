import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, HelpCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/format';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const { user } = useAuth();
  const drawerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Esc key and focus trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Focus first element
    const first = drawerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    // Prevent body scrolling while open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const role = user?.role;
  const isCoordinator = role === 'coordinator' || role === 'system_administrator';
  const isRescueMember = role === 'rescue_team_member';

  const drawerContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Help and instructions"
    >
      <div
        ref={drawerRef}
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/75">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-gray-900">Platform Help & Guide</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-ui text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus-ring"
            aria-label="Close help drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Role Badge */}
        <div className="px-6 py-3 bg-brand-50/50 border-b border-brand-100/50 text-xs text-brand-900 flex items-center justify-between">
          <span>Active Role:</span>
          <span className="font-semibold uppercase tracking-wider">
            {role ? roleLabel(role) : 'Guest'}
          </span>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6 text-sm text-gray-700">
          {/* Coordinator Guide */}
          {isCoordinator && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 text-base">Coordinator Operational Workflow</h3>
              <ol className="space-y-3.5 list-decimal list-outside pl-4">
                <li>
                  <strong>Review queue:</strong> Check incoming incident reports under the Incidents page to evaluate report credibility and urgency.
                </li>
                <li>
                  <strong>Verify / Reject:</strong> Verify legitimate reports to queue them for dispatch. Reject duplicates or spam with a required remark.
                </li>
                <li>
                  <strong>Dispatch:</strong> Click Dispatch on verified incidents to match and assign suitable rescue units based on proximity and unit specialization.
                </li>
                <li>
                  <strong>Monitor operations:</strong> Track active assignments on the Operations Board and view real-time GPS locations on the Operations Map.
                </li>
                <li>
                  <strong>Reassign:</strong> If a team is delayed, click Reassign on the board to select an alternative unit. A reason of at least 5 characters is required.
                </li>
                <li>
                  <strong>Overdue limit:</strong> Click &quot;Overdue Limit&quot; on the Operations Board to configure response time thresholds (1 to 600 minutes).
                </li>
              </ol>
            </div>
          )}

          {/* Rescue Member Guide */}
          {isRescueMember && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 text-base">Field Rescue Member Instructions</h3>
              <ol className="space-y-3.5 list-decimal list-outside pl-4">
                <li>
                  <strong>Check task:</strong> View the incident briefing, victim contact, and target location on your Rescue Dashboard.
                </li>
                <li>
                  <strong>I am en route:</strong> Tap the button when your team departs. This notifies coordinators and citizens that help is on the way.
                </li>
                <li>
                  <strong>I am on site:</strong> Tap when arriving at the emergency scene to log your on-scene timestamp.
                </li>
                <li>
                  <strong>Mark resolved:</strong> Once rescue actions are complete, submit a closing note (min 5 characters) to return your unit to standby.
                </li>
                <li>
                  <strong>Offline behaviour:</strong> If network connection is lost, keep advancing status steps normally. Your actions are saved locally and synced automatically when reconnected.
                </li>
              </ol>
            </div>
          )}

          {/* Fallback Guide for other roles */}
          {!isCoordinator && !isRescueMember && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900 text-base">General Platform Overview</h3>
              <ul className="space-y-2 list-disc list-outside pl-4">
                <li>Report emergencies quickly with location and photos.</li>
                <li>Track response status using your unique tracking reference code.</li>
                <li>Receive automatic SMS and in-app alerts on status updates.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 text-white rounded-ui text-sm font-semibold hover:bg-brand-700 focus-ring"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(drawerContent, document.body)
    : drawerContent;
}
