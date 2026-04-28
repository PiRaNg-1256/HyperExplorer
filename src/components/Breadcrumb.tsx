import { ChevronRight } from 'lucide-react';
import { breadcrumbParts } from '../utils/format';

interface Props {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: Props) {
  const parts = breadcrumbParts(path);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto min-w-0 text-sm text-zinc-300">
      {parts.map((part, i) => (
        <span key={part.path} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight size={12} className="text-zinc-600" />}
          <button
            onClick={() => onNavigate(part.path)}
            className={`px-1.5 py-0.5 rounded hover:bg-zinc-700 transition-colors ${
              i === parts.length - 1 ? 'text-white font-medium' : 'text-zinc-400'
            }`}
          >
            {part.label}
          </button>
        </span>
      ))}
    </div>
  );
}
