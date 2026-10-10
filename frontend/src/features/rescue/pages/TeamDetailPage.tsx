import { useParams } from 'react-router-dom';

export function TeamDetailPage() {
  const { id } = useParams();
  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-gray-900">Team #{id}</h1>
      <p className="text-gray-500 mt-2">Team detail view – coming soon.</p>
    </div>
  );
}
