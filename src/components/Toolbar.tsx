import { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  List,
  Grid,
  Search,
  RefreshCw,
  X,
  GitBranch,
} from 'lucide-react';
import { useAppStore, getActiveTab } from '../store';
import type { PaneId } from '../types';

interface Props {
  paneId: PaneId;
  onRefresh: () => void;
}

export function Toolbar({ paneId, onRefresh }: Props) {
  const store = useAppStore();
  const tab = getActiveTab(store.panes[paneId]);
  const searchRef = useRef<HTMLInputElement>(null);

  const canBack = tab.historyIndex > 0;
  const canForward = tab.historyIndex < tab.history.length - 1;
  const isRoot = /^[A-Za-z]:\\?$/.test(tab.currentPath);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
      {/* Nav buttons */}
      <button
        onClick={() => store.goBack(paneId)}
        disabled={!canBack}
        title="Back (Alt+←)"
        className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => store.goForward(paneId)}
        disabled={!canForward}
        title="Forward (Alt+→)"
        className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default"
      >
        <ChevronRight size={16} />
      </button>
      <button
        onClick={() => store.goUp(paneId)}
        disabled={isRoot}
        title="Up (Backspace)"
        className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default"
      >
        <ChevronUp size={16} />
      </button>

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      <button
        onClick={onRefresh}
        title="Refresh (F5)"
        className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
      >
        <RefreshCw size={14} />
      </button>

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-zinc-800 rounded px-2 py-1 flex-1 max-w-64">
        <Search size={12} className="text-zinc-500 shrink-0" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search…"
          value={tab.searchQuery}
          onChange={(e) => store.setSearchQuery(paneId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              store.setSearchQuery(paneId, '');
              searchRef.current?.blur();
            }
          }}
          className="bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none w-full"
        />
        {tab.searchQuery && (
          <button
            onClick={() => store.setSearchQuery(paneId, '')}
            className="text-zinc-600 hover:text-zinc-400"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <button
        onClick={() => store.setSearchRecursive(paneId, !tab.searchRecursive)}
        title={tab.searchRecursive ? 'Search recursively (current folder only)' : 'Search current folder only (include subfolders)'}
        className={`p-1.5 rounded text-zinc-400 hover:text-zinc-200 ${
          tab.searchRecursive ? 'hover:bg-zinc-700' : 'bg-zinc-700 text-white'
        }`}
      >
        <GitBranch size={13} />
      </button>

      <div className="flex-1" />

      {/* View toggle */}
      <div className="flex items-center border border-zinc-700 rounded overflow-hidden">
        <button
          onClick={() => store.setViewMode(paneId, 'list')}
          title="List view"
          className={`p-1.5 ${tab.viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <List size={13} />
        </button>
        <button
          onClick={() => store.setViewMode(paneId, 'grid')}
          title="Grid view"
          className={`p-1.5 ${tab.viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Grid size={13} />
        </button>
      </div>
    </div>
  );
}
