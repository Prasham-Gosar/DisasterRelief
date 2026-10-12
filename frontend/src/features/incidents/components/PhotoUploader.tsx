import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '../../../components/ui';
import { MAX_PHOTOS, photoProblem } from '../schemas';

interface PhotoUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
}

/** Up to 3 photos (jpeg/png/webp, 5 MB each) with thumbnails and inline errors */
export function PhotoUploader({ files, onChange }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);

  // Create preview URLs and always clean them up (otherwise the browser keeps them in memory)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // lets the same file be picked again later
    const accepted: File[] = [];
    const msgs: string[] = [];
    for (const file of picked) {
      const problem = photoProblem(file);
      if (problem) msgs.push(problem);
      else if (files.length + accepted.length >= MAX_PHOTOS) {
        msgs.push(`You can add at most ${MAX_PHOTOS} photos.`);
        break;
      } else accepted.push(file);
    }
    setProblems(msgs);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  };

  const remove = (index: number) => {
    setProblems([]);
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Photos <span className="font-normal text-gray-500">(optional, up to {MAX_PHOTOS})</span>
        </span>
        <span className="text-xs text-gray-500">{files.length}/{MAX_PHOTOS}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {previews.map((url, i) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-ui border border-gray-200">
            <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white focus-ring"
              aria-label={`Remove photo ${i + 1}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} className="h-20 w-20 flex-col !gap-1 !px-1">
            <Camera className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs">Add</span>
          </Button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handlePick} />

      {problems.length > 0 && (
        <ul className="space-y-0.5" role="alert">
          {problems.map((p) => (
            <li key={p} className="text-xs text-danger-600">{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
