import { useRef, useCallback, useEffect, useMemo, useState, KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry, PaneId, SortField } from '../types';
import { useAppStore, getActiveTab } from '../store';
import { dragContext } from '../hooks/useDragContext';
import { FileIcon } from './FileIcon';
import { formatSize, formatDate } from '../utils/format';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  paneId: PaneId;
  entries: FileEntry[];
  onNavigate: (path: string) => void;
  onOpen: (entry: FileEntry) => void;
  onRefresh: () => void;
  onDrop: (sourcePaths: string[], sourcePaneId: PaneId, destinationDir: string) => void;
  onContextMenu: (x: number, y: number, targets: string[]) => void;
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  field?: SortField;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 select-none ${className ?? ''}`}
    >
      {label}
      {active ? dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} /> : null}
    </button>
  );
}

// ── Inline rename input ───────────────────────────────────────────────────────

function RenameInput({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: FileEntry;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = entry.name.lastIndexOf('.');
    if (!entry.isDir && dot > 0) {
      el.setSelectionRange(0, dot);
    } else {
      el.select();
    }
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onConfirm(value.trim());
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onConfirm(value.trim())}
      onClick={(e) => e.stopPropagation()}
      className="bg-zinc-700 text-white text-sm px-1.5 py-0 outline-none ring-2 ring-indigo-500 rounded-sm w-full min-w-0"
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FileList({
  paneId,
  entries,
  onNavigate,
  onOpen,
  onRefresh,
  onDrop,
  onContextMenu,
}: Props) {
  const store = useAppStore();
  const tab = getActiveTab(store.panes[paneId]);
  const { selectedPaths, sortField, sortDir, renamingPath, pendingNewFolderName } = tab;

  // Build a path→Tag[] map for O(1) row lookup; re-derives whenever allTags changes
  const tagsByPath = useMemo(() => {
    const map = new Map<string, { tagName: string; color: string }[]>();
    for (const tag of store.allTags) {
      const list = map.get(tag.filePath) ?? [];
      list.push({ tagName: tag.tagName, color: tag.color });
      map.set(tag.filePath, list);
    }
    return map;
  }, [store.allTags]);

  const parentRef = useRef<HTMLDivElement>(null);
  const lastClickedIndex = useRef(-1);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  // ── Sorted entries (memoised) ─────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let cmp = 0;
      if (sortField === 'name')          cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortField === 'size')     cmp = a.size - b.size;
      else if (sortField === 'modified') cmp = a.modified - b.modified;
      else if (sortField === 'extension') cmp = a.extension.localeCompare(b.extension);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, sortField, sortDir]);

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 15,
  });

  // ── Auto-rename after "New Folder" ────────────────────────────────────────

  useEffect(() => {
    if (!pendingNewFolderName) return;
    const match = entries.find(
      (e) => e.isDir && e.name === pendingNewFolderName,
    );
    if (match) {
      store.setRenamingPath(paneId, match.path);
      store.setSelectedPaths(paneId, new Set([match.path]));
      store.setPendingNewFolderName(paneId, null);
      const idx = sorted.findIndex((e) => e.path === match.path);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
    }
  }, [entries, pendingNewFolderName]);

  // ── Selection ──────────────────────────────────────────────────────────────

  function handleRowClick(e: React.MouseEvent, entry: FileEntry, index: number) {
    if (renamingPath) return;
    store.setActivePaneId(paneId);

    if (e.shiftKey && lastClickedIndex.current >= 0) {
      const lo = Math.min(lastClickedIndex.current, index);
      const hi = Math.max(lastClickedIndex.current, index);
      store.setSelectedPaths(paneId, new Set(sorted.slice(lo, hi + 1).map((f) => f.path)));
    } else if (e.ctrlKey || e.metaKey) {
      store.toggleSelected(paneId, entry.path);
    } else {
      store.setSelectedPaths(paneId, new Set([entry.path]));
    }
    lastClickedIndex.current = index;
  }

  function handleRowDoubleClick(entry: FileEntry) {
    if (renamingPath) return;
    if (entry.isDir) onNavigate(entry.path);
    else onOpen(entry);
  }

  // ── Context menu ───────────────────────────────────────────────────────────

  function handleRowContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicked on an already-selected item, keep multi-select; otherwise select just this one
    const targets = selectedPaths.has(entry.path)
      ? [...selectedPaths]
      : [entry.path];
    if (!selectedPaths.has(entry.path)) {
      store.setSelectedPaths(paneId, new Set([entry.path]));
    }
    onContextMenu(e.clientX, e.clientY, targets);
  }

  function handleBackgroundContextMenu(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return; // only fire on bare background
    e.preventDefault();
    onContextMenu(e.clientX, e.clientY, []); // [] = empty background
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (renamingPath) return;

      const firstIdx = sorted.findIndex((f) => selectedPaths.has(f.path));
      const idx = firstIdx >= 0 ? firstIdx : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(Math.max(idx, -1) + 1, sorted.length - 1);
        if (next >= 0) {
          store.setSelectedPaths(paneId, new Set([sorted[next].path]));
          lastClickedIndex.current = next;
          virtualizer.scrollToIndex(next, { align: 'auto' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(idx - 1, 0);
        if (sorted.length > 0) {
          store.setSelectedPaths(paneId, new Set([sorted[prev].path]));
          lastClickedIndex.current = prev;
          virtualizer.scrollToIndex(prev, { align: 'auto' });
        }
      } else if (e.key === 'Enter') {
        if (idx >= 0) handleRowDoubleClick(sorted[idx]);
      } else if (e.key === 'Backspace') {
        onNavigate('__UP__');
      } else if (e.key === 'Escape') {
        store.clearSelection(paneId);
      } else if (e.key === 'F2') {
        if (selectedPaths.size === 1) {
          store.setRenamingPath(paneId, [...selectedPaths][0]);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        store.setSelectedPaths(paneId, new Set(sorted.map((f) => f.path)));
      } else if (e.key === 'Delete') {
        // Let the PaneContainer window handler take it — just prevent default
        e.preventDefault();
      }
    },
    [sorted, selectedPaths, renamingPath, virtualizer, paneId],
  );

  // ── Rename ─────────────────────────────────────────────────────────────────

  async function handleRenameConfirm(entry: FileEntry, newName: string) {
    store.setRenamingPath(paneId, null);
    if (!newName || newName === entry.name) return;
    const dir = entry.path.replace(/[\\/][^\\/]+$/, '');
    const newPath = dir + '\\' + newName;
    try {
      await invoke('rename_file', { from: entry.path, to: newPath });
      onRefresh();
    } catch (e) {
      store.addToast(`Rename failed: ${String(e)}`, 'error');
    }
  }

  // ── Drag source ────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, entry: FileEntry) {
    const paths = selectedPaths.has(entry.path)
      ? [...selectedPaths]
      : [entry.path];
    if (!selectedPaths.has(entry.path)) {
      store.setSelectedPaths(paneId, new Set(paths));
    }
    dragContext.set({ sourcePaneId: paneId, paths });
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', paths.join('\n'));
  }

  function handleDragEnd() {
    dragContext.clear();
    setDragOverPath(null);
  }

  // ── Drop target ────────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent, targetPath: string) {
    const drag = dragContext.get();
    if (!drag) return;
    if (drag.paths.some((p) => p === targetPath)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(targetPath);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverPath(null);
    }
  }

  function handleDropOnFolder(e: React.DragEvent, folder: FileEntry) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    const drag = dragContext.get();
    if (!drag || drag.paths.some((p) => p === folder.path)) return;
    onDrop(drag.paths, drag.sourcePaneId, folder.path);
    dragContext.clear();
  }

  function handleDropOnPane(e: React.DragEvent) {
    e.preventDefault();
    setDragOverPath(null);
    const drag = dragContext.get();
    if (!drag) return;
    onDrop(drag.paths, drag.sourcePaneId, tab.currentPath);
    dragContext.clear();
  }

  // ── Reset on entries change ────────────────────────────────────────────────

  useEffect(() => {
    lastClickedIndex.current = -1;
  }, [entries]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const COL = { icon: 28, size: 78, modified: 148, type: 58 };

  if (entries.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-zinc-700 text-xs select-none"
        onContextMenu={handleBackgroundContextMenu}
      >
        This folder is empty
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onFocus={() => store.setActivePaneId(paneId)}
    >
      {/* Column header */}
      <div className="flex items-center h-7 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div style={{ width: COL.icon }} className="shrink-0" />
        <SortHeader
          label="Name" active={sortField === 'name'} dir={sortDir}
          onClick={() => { if (sortField === 'name') store.setSortDir(paneId, sortDir === 'asc' ? 'desc' : 'asc'); else { store.setSortField(paneId, 'name'); store.setSortDir(paneId, 'asc'); } }}
          className="flex-1 text-left"
        />
        <SortHeader
          label="Size" active={sortField === 'size'} dir={sortDir}
          onClick={() => { if (sortField === 'size') store.setSortDir(paneId, sortDir === 'asc' ? 'desc' : 'asc'); else { store.setSortField(paneId, 'size'); store.setSortDir(paneId, 'asc'); } }}
          className={`w-[${COL.size}px] justify-end`}
        />
        <SortHeader
          label="Modified" active={sortField === 'modified'} dir={sortDir}
          onClick={() => { if (sortField === 'modified') store.setSortDir(paneId, sortDir === 'asc' ? 'desc' : 'asc'); else { store.setSortField(paneId, 'modified'); store.setSortDir(paneId, 'asc'); } }}
          className={`w-[${COL.modified}px]`}
        />
        <SortHeader
          label="Type" active={sortField === 'extension'} dir={sortDir}
          onClick={() => { if (sortField === 'extension') store.setSortDir(paneId, sortDir === 'asc' ? 'desc' : 'asc'); else { store.setSortField(paneId, 'extension'); store.setSortDir(paneId, 'asc'); } }}
          className={`w-[${COL.type}px]`}
        />
      </div>

      {/* Virtualised rows */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onClick={(e) => { if (e.target === e.currentTarget) store.clearSelection(paneId); }}
        onContextMenu={handleBackgroundContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnPane}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const entry = sorted[vItem.index];
            const isSelected = selectedPaths.has(entry.path);
            const isRenaming = renamingPath === entry.path;
            const isDragOver = dragOverPath === entry.path;

            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                }}
                draggable={!isRenaming}
                onDragStart={(e) => handleDragStart(e, entry)}
                onDragEnd={handleDragEnd}
                onDragOver={entry.isDir ? (e) => handleDragOver(e, entry.path) : undefined}
                onDragLeave={entry.isDir ? handleDragLeave : undefined}
                onDrop={entry.isDir ? (e) => handleDropOnFolder(e, entry) : undefined}
                onContextMenu={(e) => handleRowContextMenu(e, entry)}
                className={`file-list-row flex items-center h-8 cursor-pointer border-b border-transparent transition-colors ${
                  isDragOver
                    ? 'bg-indigo-500/30 ring-1 ring-inset ring-indigo-500'
                    : isSelected
                    ? 'bg-indigo-500/20 hover:bg-indigo-500/25'
                    : 'hover:bg-white/5'
                }`}
                onClick={(e) => handleRowClick(e, entry, vItem.index)}
                onDoubleClick={() => handleRowDoubleClick(entry)}
              >
                {/* Icon */}
                <div style={{ width: COL.icon }} className="flex items-center justify-center shrink-0">
                  <FileIcon isDir={entry.isDir} extension={entry.extension} />
                </div>

                {/* Name / rename input */}
                <div className="flex-1 min-w-0 pr-2 flex items-center gap-1.5">
                  {/* Tag dots (max 4) */}
                  {(() => {
                    const dots = tagsByPath.get(entry.path);
                    if (!dots || dots.length === 0) return null;
                    return (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {dots.slice(0, 4).map((t) => (
                          <span
                            key={t.tagName}
                            title={t.tagName}
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                        ))}
                      </div>
                    );
                  })()}
                  {isRenaming ? (
                    <RenameInput
                      entry={entry}
                      onConfirm={(name) => handleRenameConfirm(entry, name)}
                      onCancel={() => store.setRenamingPath(paneId, null)}
                    />
                  ) : (
                    <span className="text-sm text-zinc-200 truncate">{entry.name}</span>
                  )}
                </div>

                {/* Size */}
                <div style={{ width: COL.size }} className="shrink-0 text-right pr-3 text-xs text-zinc-500">
                  {formatSize(entry.size, entry.isDir)}
                </div>

                {/* Modified */}
                <div style={{ width: COL.modified }} className="shrink-0 text-xs text-zinc-500 truncate">
                  {formatDate(entry.modified)}
                </div>

                {/* Type */}
                <div style={{ width: COL.type }} className="shrink-0 text-xs text-zinc-600 uppercase truncate pr-2">
                  {entry.isDir ? 'Folder' : entry.extension || '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
