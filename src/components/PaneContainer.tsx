import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Copy,
  Scissors,
  Clipboard,
  Pencil,
  Trash2,
  FolderPlus,
  RefreshCw,
  Archive,
  Link,
  ExternalLink,
  MonitorPlay,
  MapPin,
} from 'lucide-react';
import { useAppStore, getActiveTab } from '../store';
import type { FileEntry, FsChangeEvent, PaneId } from '../types';
import type { MenuItem } from './ContextMenu';
import { ContextMenu } from './ContextMenu';
import { TabBar } from './TabBar';
import { Toolbar } from './Toolbar';
import { Breadcrumb } from './Breadcrumb';
import { FileList } from './FileList';
import { GridView } from './GridView';
import { StatusBar } from './StatusBar';

interface Props {
  paneId: PaneId;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function pathBasename(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p;
}

function pathJoin(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/, '') + '\\' + name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaneContainer({ paneId }: Props) {
  const store = useAppStore();
  const pane = store.panes[paneId];
  const tab = getActiveTab(pane);
  const isActive = store.activePaneId === paneId;

  const { currentPath, searchQuery, refreshTrigger, viewMode, tagFilter, entries } = tab;

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    targets: string[];
  } | null>(null);

  // Indexed file count state
  const [indexedCount, setIndexedCount] = useState(0);

  // ── Load directory ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let unlistenSearch: (() => void) | undefined;

    async function load() {
      store.setLoading(paneId, true);
      try {
        let result: FileEntry[];
        if (searchQuery.trim()) {
          // Clear entries and listen to streaming results
          store.setEntries(paneId, []);

          // Listen to search-result-batch events
          unlistenSearch = await listen<{ results: FileEntry[] }>('search-result-batch', (event) => {
            if (!cancelled) {
              const state = useAppStore.getState();
              const current = getActiveTab(state.panes[paneId]);
              store.setEntries(paneId, [...current.entries, ...event.payload.results]);
            }
          });

          // Call search to get final results
          result = await invoke<FileEntry[]>('search_files', {
            root: currentPath,
            query: searchQuery.trim(),
            recursive: tab.searchRecursive,
          });
        } else {
          result = await invoke<FileEntry[]>('list_dir', { path: currentPath });
          invoke('add_history', { path: currentPath }).catch(() => {});
        }
        if (!cancelled) store.setEntries(paneId, result);
      } catch (e) {
        if (!cancelled)
          store.addToast(`Cannot open "${currentPath}": ${String(e)}`, 'error');
      } finally {
        if (!cancelled) store.setLoading(paneId, false);
        unlistenSearch?.();
      }
    }

    if (!searchQuery.trim()) {
      load();
      return () => {
        cancelled = true;
        unlistenSearch?.();
      };
    }

    const timer = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unlistenSearch?.();
    };
  // refreshTrigger increment forces a reload without path change (e.g. after drop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, searchQuery, tab.searchRecursive, refreshTrigger]);

  // ── Get indexed file count when search is active ──────────────────────────────

  useEffect(() => {
    if (searchQuery.trim()) {
      invoke<number>('get_indexed_file_count', {
        root: currentPath,
        recursive: tab.searchRecursive,
      })
        .then(setIndexedCount)
        .catch(() => setIndexedCount(0));
    } else {
      setIndexedCount(0);
    }
  }, [currentPath, searchQuery, tab.searchRecursive]);

  // ── Watch directory ─────────────────────────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    invoke('watch_dir', { path: currentPath }).catch(() => {});

    listen<FsChangeEvent>('fs-change', (event) => {
      const state = useAppStore.getState();
      const currentTab = getActiveTab(state.panes[paneId]);
      if (event.payload.path === currentTab.currentPath) {
        invoke<FileEntry[]>('list_dir', { path: currentTab.currentPath })
          .then((result) => useAppStore.getState().setEntries(paneId, result))
          .catch(() => {});
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, [currentPath, paneId]);

  // ── Operation handlers ──────────────────────────────────────────────────────

  async function handleDelete(paths: string[]) {
    if (paths.length === 0) return;
    try {
      await invoke('delete_to_trash', { paths });
      store.clearSelection(paneId);
      store.triggerRefresh(paneId);
    } catch (e) {
      store.addToast(`Delete failed: ${String(e)}`, 'error');
    }
  }

  async function handlePaste() {
    const state = useAppStore.getState();
    const { clipboard } = state;
    if (!clipboard || clipboard.paths.length === 0) return;
    const destDir = getActiveTab(state.panes[paneId]).currentPath;
    const cmd = clipboard.cut ? 'move_file' : 'copy_file';
    const errors: string[] = [];
    for (const src of clipboard.paths) {
      const dest = pathJoin(destDir, pathBasename(src));
      try {
        await invoke(cmd, { from: src, to: dest });
      } catch (e) {
        errors.push(String(e));
      }
    }
    if (clipboard.cut) store.setClipboard(null);
    store.triggerRefresh(paneId);
    if (errors.length > 0) {
      store.addToast(`Paste error: ${errors[0]}`, 'error');
    }
  }

  async function handleNewFolder() {
    const state = useAppStore.getState();
    const dir = getActiveTab(state.panes[paneId]).currentPath;
    const existingEntries = getActiveTab(state.panes[paneId]).entries;
    const existingNames = new Set(existingEntries.map((e) => e.name.toLowerCase()));

    let folderName = 'New Folder';
    let n = 2;
    while (existingNames.has(folderName.toLowerCase())) {
      folderName = `New Folder (${n++})`;
    }

    try {
      await invoke('create_dir', { path: pathJoin(dir, folderName) });
      store.setPendingNewFolderName(paneId, folderName);
      store.triggerRefresh(paneId);
    } catch (e) {
      store.addToast(`Cannot create folder: ${String(e)}`, 'error');
    }
  }

  async function handleCompressZip(targets: string[]) {
    if (targets.length === 0) return;
    const state = useAppStore.getState();
    const destDir = getActiveTab(state.panes[paneId]).currentPath;
    try {
      const zipPath = await invoke<string>('compress_to_zip', {
        paths: targets,
        destDir,
      });
      store.triggerRefresh(paneId);
      store.addToast(`Created ${pathBasename(zipPath)}`, 'info');
    } catch (e) {
      store.addToast(`Compress failed: ${String(e)}`, 'error');
    }
  }

  async function handlePinToCanvas(targets: string[]) {
    const state = useAppStore.getState();
    const tab = getActiveTab(state.panes[paneId]);
    let pinned = 0;
    for (let i = 0; i < targets.length; i++) {
      const path = targets[i];
      const entry = tab.entries.find((e) => e.path === path);
      const isDir = entry?.isDir ?? false;
      const posX = 60 + (i % 4) * 200;
      const posY = 60 + Math.floor(i / 4) * 160;
      try {
        await invoke('pin_item', { path, positionX: posX, positionY: posY, isDir });
        pinned++;
      } catch { /* ignore */ }
    }
    if (pinned > 0) {
      store.addToast(`Pinned ${pinned} item${pinned > 1 ? 's' : ''} to canvas`, 'info');
      store.setCanvasOpen(true);
    }
  }

  async function copyPathToClipboard(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      store.addToast('Path copied to clipboard', 'info');
    } catch {
      store.addToast('Failed to copy path', 'error');
    }
  }

  // ── Build context menu items ────────────────────────────────────────────────

  function buildMenuItems(targets: string[]): MenuItem[] {
    const state = useAppStore.getState();
    const { clipboard } = state;
    const hasClipboard = !!clipboard && clipboard.paths.length > 0;
    const isSingle = targets.length === 1;
    const hasTargets = targets.length > 0;

    const items: MenuItem[] = [];

    if (hasTargets) {
      // Open (single item)
      if (isSingle) {
        items.push({
          kind: 'item',
          label: 'Open',
          icon: ExternalLink,
          shortcut: 'Enter',
          onClick: () => {
            invoke('open_file', { path: targets[0] }).catch((e) =>
              store.addToast(`Cannot open: ${String(e)}`, 'error'),
            );
          },
        });
        // Open With (single file only)
        const entry = entries.find((e) => e.path === targets[0]);
        if (entry && !entry.isDir) {
          items.push({
            kind: 'item',
            label: 'Open With…',
            icon: MonitorPlay,
            onClick: () => {
              invoke('show_open_with_dialog', { path: targets[0] }).catch(() => {});
            },
          });
        }
        items.push({ kind: 'separator' });
      }

      // Cut / Copy
      items.push({
        kind: 'item',
        label: 'Cut',
        icon: Scissors,
        shortcut: 'Ctrl+X',
        onClick: () => store.setClipboard({ paths: targets, cut: true }),
      });
      items.push({
        kind: 'item',
        label: 'Copy',
        icon: Copy,
        shortcut: 'Ctrl+C',
        onClick: () => store.setClipboard({ paths: targets, cut: false }),
      });
    }

    // Paste (always shown)
    items.push({
      kind: 'item',
      label: 'Paste',
      icon: Clipboard,
      shortcut: 'Ctrl+V',
      disabled: !hasClipboard,
      onClick: handlePaste,
    });

    if (hasTargets) {
      items.push({ kind: 'separator' });

      // Rename (single item)
      if (isSingle) {
        items.push({
          kind: 'item',
          label: 'Rename',
          icon: Pencil,
          shortcut: 'F2',
          onClick: () => store.setRenamingPath(paneId, targets[0]),
        });
      }

      // Delete
      items.push({
        kind: 'item',
        label: `Delete${targets.length > 1 ? ` (${targets.length} items)` : ''}`,
        icon: Trash2,
        shortcut: 'Del',
        danger: true,
        onClick: () => handleDelete(targets),
      });
    }

    items.push({ kind: 'separator' });

    // New Folder
    items.push({
      kind: 'item',
      label: 'New Folder',
      icon: FolderPlus,
      shortcut: 'Ctrl+Shift+N',
      onClick: handleNewFolder,
    });

    if (hasTargets) {
      // Pin to Canvas
      items.push({
        kind: 'item',
        label: `Pin to Canvas${targets.length > 1 ? ` (${targets.length} items)` : ''}`,
        icon: MapPin,
        onClick: () => handlePinToCanvas(targets),
      });

      // Compress to ZIP
      items.push({
        kind: 'item',
        label: `Compress to ZIP${targets.length > 1 ? ` (${targets.length} items)` : ''}`,
        icon: Archive,
        onClick: () => handleCompressZip(targets),
      });

      // Copy Path (single item)
      if (isSingle) {
        items.push({
          kind: 'item',
          label: 'Copy Path',
          icon: Link,
          shortcut: 'Ctrl+Shift+C',
          onClick: () => copyPathToClipboard(targets[0]),
        });
      }
    }

    items.push({ kind: 'separator' });

    // Refresh
    items.push({
      kind: 'item',
      label: 'Refresh',
      icon: RefreshCw,
      shortcut: 'F5',
      onClick: () => store.triggerRefresh(paneId),
    });

    return items;
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isActive) return;

      // Tab management (always active)
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        store.openTab(paneId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        store.closeTab(paneId, getActiveTab(useAppStore.getState().panes[paneId]).id);
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        store.triggerRefresh(paneId);
        return;
      }

      // File operations — skip while renaming
      const currentTab = getActiveTab(useAppStore.getState().panes[paneId]);
      if (currentTab.renamingPath) return;

      if (e.key === 'Delete') {
        e.preventDefault();
        const selected = [...getActiveTab(useAppStore.getState().panes[paneId]).selectedPaths];
        if (selected.length > 0) handleDelete(selected);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'c') {
        e.preventDefault();
        const selected = [...getActiveTab(useAppStore.getState().panes[paneId]).selectedPaths];
        if (selected.length > 0) store.setClipboard({ paths: selected, cut: false });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'x') {
        e.preventDefault();
        const selected = [...getActiveTab(useAppStore.getState().panes[paneId]).selectedPaths];
        if (selected.length > 0) store.setClipboard({ paths: selected, cut: true });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewFolder();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        const selected = [...getActiveTab(useAppStore.getState().panes[paneId]).selectedPaths];
        if (selected.length === 1) copyPathToClipboard(selected[0]);
        return;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, paneId]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  function handleNavigate(path: string) {
    if (path === '__UP__') {
      store.goUp(paneId);
    } else {
      store.setCurrentPath(paneId, path);
    }
  }

  function handleOpen(entry: FileEntry) {
    invoke('open_file', { path: entry.path }).catch((e) =>
      store.addToast(`Cannot open: ${String(e)}`, 'error'),
    );
  }

  function handleDrop(sourcePaths: string[], sourcePaneId: PaneId, destDir: string) {
    store.setPendingDrop({
      sourcePaths,
      sourcePaneId,
      destinationDir: destDir,
      destinationPaneId: paneId,
    });
  }

  // ── Tag filter ──────────────────────────────────────────────────────────────

  const displayedEntries =
    tagFilter
      ? entries.filter((e) =>
          store.allTags.some(
            (t) => t.filePath === e.path && t.tagName === tagFilter,
          ),
        )
      : entries;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col h-full min-w-0 overflow-hidden ${
        isActive ? '' : 'opacity-75'
      }`}
      onMouseDown={() => store.setActivePaneId(paneId)}
    >
      <TabBar paneId={paneId} />
      <Toolbar paneId={paneId} onRefresh={() => store.triggerRefresh(paneId)} />
      <Breadcrumb path={currentPath} onNavigate={handleNavigate} />

      {/* Loading indicator */}
      {tab.loading && (
        <div className="h-0.5 bg-gradient-to-r from-indigo-500 to-indigo-400 animate-pulse shrink-0" />
      )}

      {viewMode === 'list' ? (
        <FileList
          paneId={paneId}
          entries={displayedEntries}
          onNavigate={handleNavigate}
          onOpen={handleOpen}
          onRefresh={() => store.triggerRefresh(paneId)}
          onDrop={handleDrop}
          onContextMenu={(x, y, targets) => setCtxMenu({ x, y, targets })}
        />
      ) : (
        <GridView
          paneId={paneId}
          entries={displayedEntries}
          onNavigate={handleNavigate}
          onOpen={handleOpen}
        />
      )}

      <StatusBar paneId={paneId} total={displayedEntries.length} indexedCount={indexedCount} />

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildMenuItems(ctxMenu.targets)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
