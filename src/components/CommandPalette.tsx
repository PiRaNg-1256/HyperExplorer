/**
 * CommandPalette — Ctrl+K palette with two modes:
 *   1. Quick-nav  — fuzzy search over history, pinned dirs, drives, special dirs
 *   2. AI mode    — prefix query with "?" to send natural-language prompt to Ollama
 *
 * Ollama endpoint: http://localhost:11434/api/generate (stream: true)
 * Default model:   llama3.2  (Ollama must be running locally)
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  KeyboardEvent,
} from 'react';
import {
  Search,
  Clock,
  Pin,
  HardDrive,
  Folder,
  Bot,
  Loader2,
  CornerDownLeft,
  AlertCircle,
  Navigation,
  FolderSearch,
  MessageSquare,
  ExternalLink,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, getActiveTab } from '../store';
import type { LucideIcon } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultKind = 'history' | 'pinned' | 'drive' | 'special';

interface QuickResult {
  id: string;
  kind: ResultKind;
  label: string;
  path: string;
  icon: LucideIcon;
}

interface AiAction {
  action: 'navigate' | 'search' | 'open' | 'message';
  path?: string;
  query?: string;
  message: string;
}

interface HistoryEntry {
  path: string;
  visitedAt: number;
}

interface PinnedEntry {
  path: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'llama3.2';
const MAX_HISTORY = 30;
const AI_PREFIX = '?';

const KIND_LABELS: Record<ResultKind, string> = {
  history: 'Recent',
  pinned: 'Pinned',
  drive: 'Drive',
  special: 'Quick Access',
};

// ── Fuzzy filter ──────────────────────────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Build Ollama prompt ───────────────────────────────────────────────────────

function buildPrompt(userQuery: string, currentPath: string, selectedFiles: string[]): string {
  const selStr = selectedFiles.length > 0
    ? selectedFiles.join(', ')
    : 'none';
  return `You are an AI assistant for HyperExplorer, a dual-pane Windows file manager.
Current directory: ${currentPath}
Selected files: ${selStr}

The user asked: "${userQuery}"

Respond ONLY with a valid JSON object — no markdown, no explanation, just raw JSON:
{
  "action": "navigate" | "search" | "open" | "message",
  "path": "<absolute Windows path, required if action is navigate or open>",
  "query": "<search term, required if action is search>",
  "message": "<brief human-readable explanation of what you are doing>"
}

Action meanings:
- navigate: change the active pane to the given path
- search: run a file search with the given query string in the current directory
- open: open the file at the given path with its default application
- message: just show the message to the user, no file operation needed

Examples:
- "go to downloads" → {"action":"navigate","path":"C:\\\\Users\\\\YourName\\\\Downloads","message":"Navigating to Downloads"}
- "find all PDFs" → {"action":"search","query":"*.pdf","message":"Searching for PDF files"}
- "open documents" → {"action":"navigate","path":"C:\\\\Users\\\\YourName\\\\Documents","message":"Opening Documents folder"}
- "what is in this folder?" → {"action":"message","message":"I can see you are in ${currentPath}. Ask me to navigate, search, or open files."}`;
}

// ── Parse AI response to action ───────────────────────────────────────────────

function parseAiAction(raw: string): AiAction | null {
  // Strip potential markdown fences
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // Find the first {...} block
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as AiAction;
  } catch {
    return null;
  }
}

// ── Action icon map ───────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, LucideIcon> = {
  navigate: Navigation,
  search: FolderSearch,
  open: ExternalLink,
  message: MessageSquare,
};

// ── Main component ────────────────────────────────────────────────────────────

export function CommandPalette() {
  const store = useAppStore();
  const activePaneId = store.activePaneId;
  const activeTab = getActiveTab(store.panes[activePaneId]);

  // ── Local state ─────────────────────────────────────────────────────────────

  const [query, setQuery] = useState('');
  const [allResults, setAllResults] = useState<QuickResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiAction, setAiAction] = useState<AiAction | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isAiMode = query.startsWith(AI_PREFIX);
  const aiQuery = isAiMode ? query.slice(AI_PREFIX.length).trim() : '';

  // ── Load quick results on open ───────────────────────────────────────────────

  useEffect(() => {
    if (!store.paletteOpen) return;
    setQuery('');
    setAiText('');
    setAiAction(null);
    setAiError(null);
    setSelectedIdx(0);

    async function load() {
      const results: QuickResult[] = [];

      // Drives
      for (const drive of store.drives) {
        results.push({
          id: `drive:${drive}`,
          kind: 'drive',
          label: drive,
          path: drive,
          icon: HardDrive,
        });
      }

      // Special dirs
      for (const dir of store.specialDirs) {
        results.push({
          id: `special:${dir.path}`,
          kind: 'special',
          label: dir.name,
          path: dir.path,
          icon: Folder,
        });
      }

      // Pinned
      try {
        const pinned = await invoke<PinnedEntry[]>('get_pinned');
        for (const p of pinned) {
          const label = p.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p.path;
          results.push({
            id: `pinned:${p.path}`,
            kind: 'pinned',
            label,
            path: p.path,
            icon: Pin,
          });
        }
      } catch { /* Ollama offline, pinned unavailable — ignore */ }

      // History (most recent first, deduplicated)
      try {
        const history = await invoke<HistoryEntry[]>('get_history');
        const seen = new Set<string>();
        let count = 0;
        for (const h of history) {
          if (seen.has(h.path)) continue;
          seen.add(h.path);
          const label = h.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? h.path;
          results.push({
            id: `history:${h.path}`,
            kind: 'history',
            label,
            path: h.path,
            icon: Clock,
          });
          if (++count >= MAX_HISTORY) break;
        }
      } catch { /* ignore */ }

      setAllResults(results);
    }

    load();
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [store.paletteOpen]);

  // ── Filtered results ─────────────────────────────────────────────────────────

  const filteredResults = (() => {
    if (isAiMode) return [];
    if (!query.trim()) return allResults;
    return allResults.filter(
      (r) => fuzzyMatch(r.label, query) || fuzzyMatch(r.path, query),
    );
  })();

  // Keep selectedIdx in bounds
  useEffect(() => {
    setSelectedIdx((idx) => Math.max(0, Math.min(idx, filteredResults.length - 1)));
  }, [filteredResults.length]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLDivElement>(
      `[data-idx="${selectedIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // ── Ollama streaming query ────────────────────────────────────────────────────

  const runAiQuery = useCallback(async () => {
    if (!aiQuery) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setAiStreaming(true);
    setAiText('');
    setAiAction(null);
    setAiError(null);

    const selectedFiles = [...activeTab.selectedPaths];
    const prompt = buildPrompt(aiQuery, activeTab.currentPath, selectedFiles);

    try {
      const resp = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        throw new Error(`Ollama returned HTTP ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { response?: string; done?: boolean };
            if (obj.response) {
              full += obj.response;
              setAiText(full);
            }
            if (obj.done) break;
          } catch { /* ignore malformed chunk */ }
        }
      }

      // Try to extract a structured action from the completed response
      const parsed = parseAiAction(full);
      setAiAction(parsed);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setAiError('Ollama is not running. Start it with: ollama serve');
      } else {
        setAiError(msg);
      }
    } finally {
      setAiStreaming(false);
    }
  }, [aiQuery, activeTab]);

  // ── Execute a quick-nav result ───────────────────────────────────────────────

  function executeResult(result: QuickResult) {
    store.setCurrentPath(activePaneId, result.path);
    store.setPaletteOpen(false);
  }

  // ── Execute an AI action ─────────────────────────────────────────────────────

  function executeAiAction(action: AiAction) {
    switch (action.action) {
      case 'navigate':
        if (action.path) store.setCurrentPath(activePaneId, action.path);
        break;
      case 'search':
        if (action.query) store.setSearchQuery(activePaneId, action.query);
        break;
      case 'open':
        if (action.path) invoke('open_file', { path: action.path }).catch(() => {});
        break;
      case 'message':
        // Nothing to execute, the message is already displayed
        break;
    }
    store.setPaletteOpen(false);
  }

  // ── Keyboard handler ─────────────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      abortRef.current?.abort();
      store.setPaletteOpen(false);
      return;
    }

    if (isAiMode) {
      if (e.key === 'Enter' && !aiStreaming) {
        e.preventDefault();
        runAiQuery();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filteredResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = filteredResults[selectedIdx];
      if (result) executeResult(result);
    }
  }

  // ── Group results for display ────────────────────────────────────────────────

  const grouped = (['special', 'pinned', 'drive', 'history'] as ResultKind[])
    .map((kind) => ({
      kind,
      items: filteredResults.filter((r) => r.kind === kind),
    }))
    .filter((g) => g.items.length > 0);

  // Flat index tracker for keyboard highlight
  let flatIdx = 0;

  // ── Don't render if closed ───────────────────────────────────────────────────

  if (!store.paletteOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          abortRef.current?.abort();
          store.setPaletteOpen(false);
        }
      }}
    >
      {/* Panel */}
      <div className="w-[620px] max-h-[70vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
          {isAiMode
            ? <Bot size={16} className="text-indigo-400 shrink-0" />
            : <Search size={16} className="text-zinc-500 shrink-0" />}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAiText('');
              setAiAction(null);
              setAiError(null);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isAiMode
              ? 'Ask AI anything about your files… (Enter to send)'
              : 'Search files, folders or type ? to ask AI…'}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            spellCheck={false}
            autoComplete="off"
          />

          {isAiMode && (
            <button
              onClick={() => { abortRef.current?.abort(); runAiQuery(); }}
              disabled={aiStreaming || !aiQuery}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
            >
              {aiStreaming
                ? <Loader2 size={12} className="animate-spin" />
                : <CornerDownLeft size={12} />}
              {aiStreaming ? 'Thinking…' : 'Ask'}
            </button>
          )}

          <button
            onClick={() => { abortRef.current?.abort(); store.setPaletteOpen(false); }}
            className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── AI mode body ─────────────────────────────────────────────────── */}
          {isAiMode && (
            <div className="p-4 space-y-3">
              {/* Idle state */}
              {!aiStreaming && !aiText && !aiError && (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
                  <Bot size={28} />
                  <p className="text-sm">
                    {aiQuery
                      ? 'Press Enter or click Ask'
                      : 'Type your question after the ?'}
                  </p>
                  <p className="text-xs text-zinc-700">
                    Powered by Ollama ({OLLAMA_MODEL}) · running locally
                  </p>
                </div>
              )}

              {/* Error */}
              {aiError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-950/50 border border-red-800/50 px-3 py-2.5 text-sm text-red-300">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Streaming / completed response */}
              {aiText && (
                <div className="space-y-3">
                  {/* Raw response (shown while streaming or if no action parsed) */}
                  {(aiStreaming || !aiAction) && (
                    <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2.5 text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {aiText}
                      {aiStreaming && (
                        <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                  )}

                  {/* Parsed action card */}
                  {!aiStreaming && aiAction && (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-800/80 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-zinc-800">
                        {(() => {
                          const Icon = ACTION_ICONS[aiAction.action] ?? MessageSquare;
                          return <Icon size={14} className="text-indigo-400 shrink-0" />;
                        })()}
                        <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
                          {aiAction.action}
                        </span>
                      </div>
                      <div className="px-3 py-2.5 space-y-1.5">
                        <p className="text-sm text-zinc-300">{aiAction.message}</p>
                        {(aiAction.path || aiAction.query) && (
                          <p className="text-xs text-zinc-500 font-mono truncate">
                            {aiAction.path ?? aiAction.query}
                          </p>
                        )}
                      </div>
                      {aiAction.action !== 'message' && (
                        <div className="px-3 pb-3">
                          <button
                            onClick={() => executeAiAction(aiAction!)}
                            className="w-full py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm text-white transition-colors"
                          >
                            Execute
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Quick-nav mode body ──────────────────────────────────────────── */}
          {!isAiMode && (
            <div ref={listRef} className="py-1">
              {filteredResults.length === 0 && query.trim() ? (
                <div className="flex items-center justify-center py-10 text-zinc-600 text-sm">
                  No results for "{query}"
                </div>
              ) : (
                grouped.map(({ kind, items }) => (
                  <div key={kind}>
                    {/* Group header */}
                    <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                      {KIND_LABELS[kind]}
                    </div>

                    {/* Items */}
                    {items.map((result) => {
                      const myIdx = flatIdx++;
                      const Icon = result.icon;
                      const isHighlighted = myIdx === selectedIdx;
                      return (
                        <div
                          key={result.id}
                          data-idx={myIdx}
                          onMouseEnter={() => setSelectedIdx(myIdx)}
                          onClick={() => executeResult(result)}
                          className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-indigo-600/25 text-zinc-100'
                              : 'text-zinc-300 hover:bg-white/5'
                          }`}
                        >
                          <Icon
                            size={14}
                            className={isHighlighted ? 'text-indigo-400' : 'text-zinc-500'}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{result.label}</div>
                            <div className="text-[11px] text-zinc-600 truncate">{result.path}</div>
                          </div>
                          {isHighlighted && (
                            <CornerDownLeft size={12} className="text-zinc-600 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-900/80 shrink-0">
          {isAiMode ? (
            <span className="text-[11px] text-zinc-600">
              <span className="text-zinc-500">Enter</span> to send ·{' '}
              <span className="text-zinc-500">Esc</span> to close ·{' '}
              model: <span className="text-zinc-500">{OLLAMA_MODEL}</span>
            </span>
          ) : (
            <span className="text-[11px] text-zinc-600">
              <span className="text-zinc-500">↑↓</span> navigate ·{' '}
              <span className="text-zinc-500">Enter</span> open ·{' '}
              <span className="text-zinc-500">?</span> ask AI ·{' '}
              <span className="text-zinc-500">Esc</span> close
            </span>
          )}
          <span className="text-[11px] text-zinc-700">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
