# HyperExplorer

A fast, AI-powered Windows file manager built with **Tauri v2** (Rust backend) + **React 18** + **TypeScript**.

![Tech Stack](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri) ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Rust](https://img.shields.io/badge/Rust-edition%202021-orange?logo=rust)

---

## Features

| Phase | Feature |
|-------|---------|
| 1 | Virtualised dual-pane file list, Rust FS commands, SQLite persistence |
| 2 | Resizable panes, per-pane tab system, drag-and-drop (move/copy), preview panel, tag sidebar filter |
| 3 | Right-click context menu, clipboard (cut/copy/paste), Delete → Recycle Bin, new folder with instant rename, Open With, Compress to ZIP, copy path |
| 4 | AI command palette (`Ctrl+K`) with fuzzy nav + Ollama natural-language queries (streaming) |
| 5 | Tag system — coloured tags per file, add/remove in preview panel, dot badges in file list |
| 6 | Spatial canvas (`Ctrl+\`) — pin files as draggable nodes, positions persisted to SQLite |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://tauri.app/) |
| UI | React 18 + TypeScript + Vite 6 |
| Styling | Tailwind CSS v4 |
| State | Zustand v5 |
| Virtualised list | TanStack Virtual v3 |
| Canvas | @xyflow/react |
| Icons | Lucide React |
| DB | SQLite via `rusqlite` (bundled) with FTS5 |
| FS watch | `notify` v6 |
| Trash | `trash` v3 |
| AI | Ollama (local, `llama3.2`) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI v2](https://tauri.app/start/prerequisites/) — `cargo install tauri-cli`
- Windows 10/11 (primary target; macOS/Linux partially supported)
- [Ollama](https://ollama.com/) (optional — only needed for AI palette features)

---

## Development

```bash
# 1. Install JS dependencies
npm install

# 2. Start the dev server (Rust compiles + Vite HMR)
npm run tauri dev
```

The first `cargo build` takes a few minutes; subsequent runs are fast.

---

## Build

```bash
npm run tauri build
```

Produces a signed Windows installer under `src-tauri/target/release/bundle/`.

---

## Architecture

```
HyperExplorer/
├── src/                        # React frontend
│   ├── App.tsx                 # Root — global shortcuts, layout
│   ├── store.ts                # Zustand store (dual-pane state)
│   ├── types.ts                # Shared TypeScript types
│   ├── hooks/
│   │   └── useDragContext.ts   # Module-level drag state (no re-renders)
│   ├── utils/
│   │   └── format.ts           # File size / date formatters
│   └── components/
│       ├── PaneContainer.tsx   # One pane (load, watch, keyboard, context menu)
│       ├── FileList.tsx        # Virtualised rows (TanStack Virtual)
│       ├── GridView.tsx        # Grid / thumbnail view
│       ├── TabBar.tsx          # Per-pane tabs
│       ├── Toolbar.tsx         # Nav buttons, view toggle, search
│       ├── Breadcrumb.tsx      # Clickable path breadcrumb
│       ├── Sidebar.tsx         # Drives, favourites, tag filter, canvas button
│       ├── PreviewPanel.tsx    # File preview + tag management
│       ├── ContextMenu.tsx     # Right-click menu (presentational)
│       ├── CommandPalette.tsx  # Ctrl+K palette — fuzzy nav + Ollama AI
│       ├── SpatialCanvas.tsx   # Ctrl+\ pinboard (@xyflow/react)
│       ├── ResizeDivider.tsx   # Drag to resize panes
│       ├── DropModal.tsx       # Move / Copy confirmation
│       ├── StatusBar.tsx       # File count, selection info
│       ├── Toast.tsx           # Notification toasts
│       └── FileIcon.tsx        # Extension → icon mapping
│
└── src-tauri/                  # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── lib.rs              # App setup, state, command registration
        ├── main.rs             # Entry point
        ├── commands.rs         # All FS operations
        └── db.rs               # SQLite — tags, history, pinned, FTS5 index
```

### Key design decisions

- **Dual-pane store**: `TabState → PaneState → AppStore` hierarchy; `updateActiveTab` immutable helper prevents accidental cross-pane mutations.
- **Stale-closure safety**: all keyboard/operation handlers call `useAppStore.getState()` for fresh reads inside event listeners.
- **Drag state**: module-level mutable variable (`dragContext`) instead of React state avoids re-renders on every drag pixel.
- **Search**: SQLite FTS5 virtual table provides instant filename search; falls back to `walkdir` scan for un-indexed paths.
- **Tag dots**: `useMemo`-derived `Map<path, Tag[]>` in `FileList` gives O(1) per-row tag lookup.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open AI command palette |
| `Ctrl+\` | Toggle spatial canvas |
| `Space` | Toggle preview panel |
| `Tab` | Switch active pane |
| `Ctrl+T` | New tab in active pane |
| `Ctrl+W` | Close active tab |
| `F5` | Refresh |
| `F2` | Rename selected |
| `Delete` | Move to Recycle Bin |
| `Ctrl+C / X / V` | Copy / Cut / Paste |
| `Ctrl+Shift+N` | New folder (renames immediately) |
| `Ctrl+Shift+C` | Copy full path |
| `↑ ↓ Enter` | Navigate file list |
| `Ctrl+A` | Select all |
| `Backspace` | Go up one level |

---

## AI Palette (Ctrl+K)

Type normally for **fuzzy navigation** over recent paths, pinned folders, and drives.

Prefix your query with `?` to enter **AI mode** — queries are sent to a locally running Ollama instance (`llama3.2` by default). The model responds with a structured action (`navigate`, `search`, `open`, or `message`) which is parsed and displayed as an executable action card.

```bash
# Start Ollama before using the AI palette
ollama serve
ollama pull llama3.2
```

---

## License

MIT
