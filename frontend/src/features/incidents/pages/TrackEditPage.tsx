/** Placeholder – owned by teammate (Person A) */
import { useParams } from 'react-router-dom';

export function TrackEditPage() {
  const { ref } = useParams();

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold text-gray-900">Edit Report</h1>
      <p className="text-gray-500 mt-2">Editing report: {ref}</p>
    </div>
  );
}
