import { useParams } from 'react-router-dom';

export function DispatchPage() {
  const { incidentId } = useParams();
  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-gray-900">Dispatch for Incident #{incidentId}</h1>
      <p className="text-gray-500 mt-2">Dispatch management – coming soon.</p>
    </div>
  );
}
