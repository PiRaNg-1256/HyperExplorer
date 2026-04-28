import { create } from 'zustand';
import type {
  FileEntry,
  PaneId,
  PaneState,
  SortDir,
  SortField,
  TabState,
  Tag,
  Toast,
  ViewMode,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _tabId = 0;
let _toastId = 0;
const uid = () => String(++_tabId);

export function makeTab(path = 'C:\\'): TabState {
  return {
    id: uid(),
    currentPath: path,
    history: [path],
    historyIndex: 0,
    entries: [],
    loading: false,
    selectedPaths: new Set(),
    sortField: 'name',
    sortDir: 'asc',
    viewMode: 'list',
    searchQuery: '',
    tagFilter: null,
    renamingPath: null,
    refreshTrigger: 0,
    pendingNewFolderName: null,
  };
}

export function makePane(path = 'C:\\'): PaneState {
  const tab = makeTab(path);
  return { tabs: [tab], activeTabId: tab.id };
}

/** Returns the active tab for a pane — safe, always non-null. */
export function getActiveTab(pane: PaneState): TabState {
  return pane.tabs.find((t) => t.id === pane.activeTabId) ?? pane.tabs[0];
}

/** Immutably updates the active tab of one pane. */
function updateActiveTab(
  panes: Record<PaneId, PaneState>,
  paneId: PaneId,
  updater: (tab: TabState) => Partial<TabState>,
): Record<PaneId, PaneState> {
  const pane = panes[paneId];
  const newTabs = pane.tabs.map((t) =>
    t.id === pane.activeTabId ? { ...t, ...updater(t) } : t,
  );
  return { ...panes, [paneId]: { ...pane, tabs: newTabs } };
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore {
  // Layout
  dividerPercent: number;
  previewOpen: boolean;
  paletteOpen: boolean;
  canvasOpen: boolean;
  activePaneId: PaneId;

  // Panes
  panes: Record<PaneId, PaneState>;

  // Sidebar shared data
  drives: string[];
  specialDirs: FileEntry[];
  allTags: Tag[];

  // Clipboard
  clipboard: { paths: string[]; cut: boolean } | null;

  // Pending drop (set by FileList, resolved by DropModal in App)
  pendingDrop: {
    sourcePaths: string[];
    sourcePaneId: PaneId;
    destinationDir: string;
    destinationPaneId: PaneId;
  } | null;

  // Toasts
  toasts: Toast[];

  // Layout
  setDividerPercent: (pct: number) => void;
  togglePreview: () => void;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setCanvasOpen: (v: boolean) => void;
  toggleCanvas: () => void;
  setActivePaneId: (id: PaneId) => void;

  // Tabs
  openTab: (paneId: PaneId, path?: string) => void;
  closeTab: (paneId: PaneId, tabId: string) => void;
  activateTab: (paneId: PaneId, tabId: string) => void;

  // Navigation (operates on active tab)
  setCurrentPath: (paneId: PaneId, path: string, pushHistory?: boolean) => void;
  setEntries: (paneId: PaneId, entries: FileEntry[]) => void;
  setLoading: (paneId: PaneId, v: boolean) => void;
  goBack: (paneId: PaneId) => string | null;
  goForward: (paneId: PaneId) => string | null;
  goUp: (paneId: PaneId) => string | null;
  triggerRefresh: (paneId: PaneId) => void;

  // Selection
  setSelectedPaths: (paneId: PaneId, paths: Set<string>) => void;
  toggleSelected: (paneId: PaneId, path: string) => void;
  clearSelection: (paneId: PaneId) => void;

  // Sort / view
  setSortField: (paneId: PaneId, f: SortField) => void;
  setSortDir: (paneId: PaneId, d: SortDir) => void;
  setViewMode: (paneId: PaneId, m: ViewMode) => void;
  setSearchQuery: (paneId: PaneId, q: string) => void;
  setTagFilter: (paneId: PaneId, tag: string | null) => void;

  // Rename
  setRenamingPath: (paneId: PaneId, path: string | null) => void;
  setPendingNewFolderName: (paneId: PaneId, name: string | null) => void;

  // Sidebar data
  setDrives: (drives: string[]) => void;
  setSpecialDirs: (dirs: FileEntry[]) => void;
  setAllTags: (tags: Tag[]) => void;

  // Clipboard
  setClipboard: (data: { paths: string[]; cut: boolean } | null) => void;

  // Drop
  setPendingDrop: (drop: AppStore['pendingDrop']) => void;
  clearPendingDrop: () => void;

  // Toasts
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

// ── Implementation ────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>((set, get) => ({
  dividerPercent: 50,
  previewOpen: false,
  paletteOpen: false,
  canvasOpen: false,
  activePaneId: 'left',
  panes: {
    left: makePane('C:\\'),
    right: makePane('C:\\'),
  },
  drives: [],
  specialDirs: [],
  allTags: [],
  clipboard: null,
  pendingDrop: null,
  toasts: [],

  // ── Layout ──────────────────────────────────────────────────────────────────

  setDividerPercent: (pct) =>
    set({ dividerPercent: Math.max(15, Math.min(85, pct)) }),

  togglePreview: () => set((s) => ({ previewOpen: !s.previewOpen })),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

  setCanvasOpen: (canvasOpen) => set({ canvasOpen }),
  toggleCanvas: () => set((s) => ({ canvasOpen: !s.canvasOpen })),

  setActivePaneId: (activePaneId) => set({ activePaneId }),

  // ── Tabs ────────────────────────────────────────────────────────────────────

  openTab: (paneId, path) => {
    set((s) => {
      const pane = s.panes[paneId];
      const newPath = path ?? getActiveTab(pane).currentPath;
      const tab = makeTab(newPath);
      return {
        panes: {
          ...s.panes,
          [paneId]: { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id },
        },
      };
    });
  },

  closeTab: (paneId, tabId) => {
    set((s) => {
      const pane = s.panes[paneId];
      if (pane.tabs.length === 1) {
        const fresh = makeTab('C:\\');
        return {
          panes: { ...s.panes, [paneId]: { tabs: [fresh], activeTabId: fresh.id } },
        };
      }
      const idx = pane.tabs.findIndex((t) => t.id === tabId);
      const newTabs = pane.tabs.filter((t) => t.id !== tabId);
      let newActiveId = pane.activeTabId;
      if (pane.activeTabId === tabId) {
        newActiveId = (newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0]).id;
      }
      return {
        panes: { ...s.panes, [paneId]: { tabs: newTabs, activeTabId: newActiveId } },
      };
    });
  },

  activateTab: (paneId, tabId) => {
    set((s) => ({
      panes: { ...s.panes, [paneId]: { ...s.panes[paneId], activeTabId: tabId } },
    }));
  },

  // ── Navigation ──────────────────────────────────────────────────────────────

  setCurrentPath: (paneId, path, pushHistory = true) => {
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, (tab) => {
        if (pushHistory) {
          const hist = tab.history.slice(0, tab.historyIndex + 1);
          hist.push(path);
          return {
            currentPath: path,
            history: hist,
            historyIndex: hist.length - 1,
            selectedPaths: new Set(),
            searchQuery: '',
            tagFilter: null,
            renamingPath: null,
          };
        }
        return { currentPath: path, selectedPaths: new Set(), renamingPath: null };
      }),
    }));
  },

  setEntries: (paneId, entries) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ entries })) })),

  setLoading: (paneId, loading) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ loading })) })),

  goBack: (paneId) => {
    const tab = getActiveTab(get().panes[paneId]);
    if (tab.historyIndex <= 0) return null;
    const newIndex = tab.historyIndex - 1;
    const path = tab.history[newIndex];
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, () => ({
        historyIndex: newIndex,
        currentPath: path,
        selectedPaths: new Set(),
        renamingPath: null,
      })),
    }));
    return path;
  },

  goForward: (paneId) => {
    const tab = getActiveTab(get().panes[paneId]);
    if (tab.historyIndex >= tab.history.length - 1) return null;
    const newIndex = tab.historyIndex + 1;
    const path = tab.history[newIndex];
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, () => ({
        historyIndex: newIndex,
        currentPath: path,
        selectedPaths: new Set(),
        renamingPath: null,
      })),
    }));
    return path;
  },

  goUp: (paneId) => {
    const tab = getActiveTab(get().panes[paneId]);
    const p = tab.currentPath.replace(/[\\/]+$/, '');
    const lastSep = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
    if (lastSep <= 0) return null;
    let parent = p.slice(0, lastSep);
    if (/^[A-Za-z]:$/.test(parent)) parent += '\\';
    get().setCurrentPath(paneId, parent);
    return parent;
  },

  triggerRefresh: (paneId) => {
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, (t) => ({
        refreshTrigger: t.refreshTrigger + 1,
      })),
    }));
  },

  // ── Selection ────────────────────────────────────────────────────────────────

  setSelectedPaths: (paneId, selectedPaths) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ selectedPaths })) })),

  toggleSelected: (paneId, path) =>
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, (t) => {
        const next = new Set(t.selectedPaths);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return { selectedPaths: next };
      }),
    })),

  clearSelection: (paneId) =>
    set((s) => ({
      panes: updateActiveTab(s.panes, paneId, () => ({ selectedPaths: new Set() })),
    })),

  // ── Sort / view ──────────────────────────────────────────────────────────────

  setSortField: (paneId, sortField) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ sortField })) })),
  setSortDir: (paneId, sortDir) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ sortDir })) })),
  setViewMode: (paneId, viewMode) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ viewMode })) })),
  setSearchQuery: (paneId, searchQuery) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ searchQuery })) })),
  setTagFilter: (paneId, tagFilter) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ tagFilter })) })),

  setRenamingPath: (paneId, renamingPath) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ renamingPath })) })),

  setPendingNewFolderName: (paneId, pendingNewFolderName) =>
    set((s) => ({ panes: updateActiveTab(s.panes, paneId, () => ({ pendingNewFolderName })) })),

  // ── Sidebar data ─────────────────────────────────────────────────────────────

  setDrives: (drives) => set({ drives }),
  setSpecialDirs: (specialDirs) => set({ specialDirs }),
  setAllTags: (allTags) => set({ allTags }),

  // ── Clipboard ────────────────────────────────────────────────────────────────

  setClipboard: (clipboard) => set({ clipboard }),

  // ── Drop ─────────────────────────────────────────────────────────────────────

  setPendingDrop: (pendingDrop) => set({ pendingDrop }),
  clearPendingDrop: () => set({ pendingDrop: null }),

  // ── Toasts ───────────────────────────────────────────────────────────────────

  addToast: (message, type = 'info') => {
    const id = String(++_toastId);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
