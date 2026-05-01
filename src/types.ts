// ── Rust-mirrored structs (serde camelCase) ───────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  size: number;       // bytes
  modified: number;   // unix ms
  isDir: boolean;
  extension: string;
}

export interface FileMetadata extends FileEntry {
  created: number;    // unix ms
  readonly: boolean;
}

export interface Tag {
  filePath: string;
  tagName: string;
  color: string;
}

export interface HistoryEntry {
  path: string;
  visitedAt: number;
}

export interface PinnedItem {
  path: string;
  positionX: number;
  positionY: number;
  isDir: boolean;
}

export interface FsChangeEvent {
  path: string;
  kind: string;
  affectedPaths: string[];
}

// ── UI types ──────────────────────────────────────────────────────────────────

export type SortField = 'name' | 'size' | 'modified' | 'extension';
export type SortDir   = 'asc' | 'desc';
export type ViewMode  = 'list' | 'grid';
export type PaneId    = 'left' | 'right';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

// ── Tab / Pane (dual-pane store) ──────────────────────────────────────────────

export interface TabState {
  id: string;
  currentPath: string;
  history: string[];
  historyIndex: number;
  entries: FileEntry[];
  loading: boolean;
  selectedPaths: Set<string>;
  sortField: SortField;
  sortDir: SortDir;
  viewMode: ViewMode;
  searchQuery: string;
  searchRecursive: boolean;
  tagFilter: string | null;
  renamingPath: string | null;
  refreshTrigger: number;
  pendingNewFolderName: string | null;  // set after create_dir; cleared by FileList useEffect
}

export interface PaneState {
  tabs: TabState[];
  activeTabId: string;
}

// ── Drag context (module-level, not React state) ──────────────────────────────

export interface DragPayload {
  sourcePaneId: PaneId;
  paths: string[];
}
