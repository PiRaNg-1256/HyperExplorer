import type { FileEntry, PaneId } from '../types';
import { useAppStore, getActiveTab } from '../store';
import { FileIcon } from './FileIcon';

interface Props {
  paneId: PaneId;
  entries: FileEntry[];
  onNavigate: (path: string) => void;
  onOpen: (entry: FileEntry) => void;
}

export function GridView({ paneId, entries, onNavigate, onOpen }: Props) {
  const store = useAppStore();
  const tab = getActiveTab(store.panes[paneId]);
  const { selectedPaths } = tab;

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-700 text-xs select-none">
        This folder is empty
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-auto p-3"
      onClick={() => store.clearSelection(paneId)}
      onFocus={() => store.setActivePaneId(paneId)}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}
      >
        {entries.map((entry) => {
          const isSelected = selectedPaths.has(entry.path);
          return (
            <button
              key={entry.path}
              onClick={(e) => {
                e.stopPropagation();
                store.setSelectedPaths(paneId, new Set([entry.path]));
                store.setActivePaneId(paneId);
              }}
              onDoubleClick={() =>
                entry.isDir ? onNavigate(entry.path) : onOpen(entry)
              }
              className={`flex flex-col items-center gap-1.5 p-2 rounded text-center transition-colors select-none ${
                isSelected ? 'bg-indigo-500/25' : 'hover:bg-white/5'
              }`}
            >
              <FileIcon isDir={entry.isDir} extension={entry.extension} size={28} />
              <span className="text-xs text-zinc-300 leading-tight line-clamp-2 break-all">
                {entry.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
