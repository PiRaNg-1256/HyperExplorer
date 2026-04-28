import { useAppStore, getActiveTab } from '../store';
import type { PaneId } from '../types';
import { formatSize } from '../utils/format';

interface Props {
  paneId: PaneId;
  total: number;
}

export function StatusBar({ paneId, total }: Props) {
  const { panes } = useAppStore();
  const tab = getActiveTab(panes[paneId]);
  const { selectedPaths, entries, tagFilter } = tab;

  const count = selectedPaths.size;
  const totalBytes = entries
    .filter((e) => selectedPaths.has(e.path) && !e.isDir)
    .reduce((acc, e) => acc + e.size, 0);

  return (
    <div className="flex items-center gap-3 px-3 py-1 border-t border-zinc-800 bg-zinc-900 text-xs text-zinc-600 shrink-0 select-none">
      {count > 0 ? (
        <span className="text-zinc-400">
          {count} item{count !== 1 ? 's' : ''} selected
          {totalBytes > 0 ? ` · ${formatSize(totalBytes, false)}` : ''}
        </span>
      ) : (
        <span>{total} item{total !== 1 ? 's' : ''}</span>
      )}
      {tagFilter && (
        <span className="text-indigo-400 ml-auto">Filter: #{tagFilter}</span>
      )}
    </div>
  );
}
