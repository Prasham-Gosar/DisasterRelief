import { useParams } from 'react-router-dom';

export function IncidentDetailPage() {
  const { id } = useParams();
  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-gray-900">Incident #{id}</h1>
      <p className="text-gray-500 mt-2">Incident detail view – coming soon.</p>
    </div>
  );
}
