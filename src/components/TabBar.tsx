import { X, Plus } from 'lucide-react';
import { useAppStore } from '../store';
import type { PaneId } from '../types';

interface Props {
  paneId: PaneId;
}

function tabLabel(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(i + 1) || p : p;
}

export function TabBar({ paneId }: Props) {
  const store = useAppStore();
  const pane = store.panes[paneId];

  return (
    <div className="flex items-center min-h-[34px] bg-zinc-900 border-b border-zinc-800 overflow-x-auto shrink-0">
      {pane.tabs.map((tab) => {
        const active = tab.id === pane.activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => store.activateTab(paneId, tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-zinc-800 cursor-pointer shrink-0 max-w-[160px] min-w-[80px] select-none transition-colors ${
              active
                ? 'bg-zinc-800 text-white border-b-2 border-b-indigo-500 -mb-px'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <span className="truncate flex-1">{tabLabel(tab.currentPath)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                store.closeTab(paneId, tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200 rounded transition-opacity shrink-0"
              title="Close tab"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      {/* New tab button */}
      <button
        onClick={() => store.openTab(paneId)}
        className="p-2 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
        title="New tab (Ctrl+T)"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
