import { X } from 'lucide-react';
import { useAppStore } from '../store';

const ICONS = {
  info: '💬',
  success: '✓',
  error: '✗',
};

const COLORS = {
  info: 'bg-zinc-700 border-zinc-600',
  success: 'bg-emerald-900 border-emerald-700',
  error: 'bg-red-900 border-red-700',
};

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-3 py-2 rounded border text-sm text-white shadow-lg pointer-events-auto ${COLORS[t.type]}`}
        >
          <span className="font-mono">{ICONS[t.type]}</span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="text-zinc-400 hover:text-white ml-2"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
