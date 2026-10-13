import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Radio, ArrowRight, ShieldCheck, Users } from 'lucide-react';
import type { AssignResponse } from '../../../lib/types';
import { Card, Button } from '../../../components/ui';

interface AssignSuccessPanelProps {
  result: AssignResponse;
  onReset?: () => void;
}

export function AssignSuccessPanel({ result }: AssignSuccessPanelProps) {
  const navigate = useNavigate();

  return (
    <Card className="max-w-2xl mx-auto py-8 px-6 text-center shadow-md animate-in fade-in zoom-in-95 duration-200">
      <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900">
        Emergency Teams Dispatched!
      </h2>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        Report status transitioned to <strong className="font-semibold text-gray-700 capitalize">{result.report_status}</strong>.
        Dispatched units have received mobile push alerts.
      </p>

      {/* Dispatched Teams List */}
      <div className="my-6 space-y-3 max-w-lg mx-auto text-left">
        {result.assignments.map((assignment) => (
          <div
            key={assignment.assignment_id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-ui border border-gray-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-100 text-brand-700 rounded-full">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  {assignment.team.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="capitalize text-green-700 font-medium">
                    Status: {assignment.team.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700">
              <Users className="w-3.5 h-3.5 text-brand-600" />
              {assignment.members_acknowledged} Acknowledged
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
        <Button
          variant="secondary"
          onClick={() => navigate('/coordinator/incidents')}
        >
          Back to Incidents
        </Button>
        <Button
          variant="primary"
          onClick={() => navigate('/coordinator/operations')}
        >
          <Radio className="w-4 h-4 mr-2" />
          View operations board
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
}
