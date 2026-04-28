import { invoke } from '@tauri-apps/api/core';
import { MoveRight, Copy, X } from 'lucide-react';
import { useAppStore } from '../store';

export function DropModal() {
  const store = useAppStore();
  const drop = store.pendingDrop;

  if (!drop) return null;

  const { sourcePaths, destinationDir, sourcePaneId, destinationPaneId } = drop;
  const destName = destinationDir.replace(/.*[\\/]/, '') || destinationDir;

  async function execute(action: 'move' | 'copy') {
    const cmd = action === 'move' ? 'move_file' : 'copy_file';
    store.clearPendingDrop();
    for (const src of sourcePaths) {
      const name = src.replace(/.*[\\/]/, '');
      const dest = destinationDir.replace(/[\\/]+$/, '') + '\\' + name;
      try {
        await invoke(cmd, { from: src, to: dest });
      } catch (e) {
        store.addToast(`Failed to ${action} "${name}": ${String(e)}`, 'error');
      }
    }
    store.triggerRefresh(sourcePaneId);
    store.triggerRefresh(destinationPaneId);
    store.addToast(
      `${action === 'move' ? 'Moved' : 'Copied'} ${sourcePaths.length} item${sourcePaths.length !== 1 ? 's' : ''} to ${destName}`,
      'success',
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => store.clearPendingDrop()}
    >
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 shadow-2xl w-80 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-200">
              {sourcePaths.length} item{sourcePaths.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">→ {destName}</p>
          </div>
          <button
            onClick={() => store.clearPendingDrop()}
            className="text-zinc-600 hover:text-zinc-300"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => execute('move')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
          >
            <MoveRight size={14} />
            Move
          </button>
          <button
            onClick={() => execute('copy')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded transition-colors"
          >
            <Copy size={14} />
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
