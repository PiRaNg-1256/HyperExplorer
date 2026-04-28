import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X, ExternalLink, Plus, Tag as TagIcon } from 'lucide-react';
import { useAppStore, getActiveTab } from '../store';
import type { FileMetadata, Tag } from '../types';
import { formatSize, formatDate } from '../utils/format';

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mkv', 'avi', 'mov', 'ogv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus']);
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'py', 'go', 'java', 'kt',
  'cpp', 'c', 'h', 'cs', 'html', 'htm', 'css', 'scss', 'less', 'xml', 'svg',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'proto',
  'gitignore', 'env', 'lock', 'log',
]);

export const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#6366f1', // indigo (default)
  '#a855f7', // purple
  '#ec4899', // pink
  '#64748b', // slate
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── PreviewPanel ──────────────────────────────────────────────────────────────

export function PreviewPanel({ open, onClose }: Props) {
  const store = useAppStore();
  const tab = getActiveTab(store.panes[store.activePaneId]);
  const selected = [...tab.selectedPaths];
  const entry =
    selected.length === 1
      ? tab.entries.find((e) => e.path === selected[0]) ?? null
      : null;

  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);

  useEffect(() => {
    setTextContent(null);
    setTextError(null);
    setMetadata(null);
    if (!entry) return;

    invoke<FileMetadata>('get_file_metadata', { path: entry.path })
      .then(setMetadata)
      .catch(() => {});

    if (!entry.isDir && TEXT_EXT.has(entry.extension)) {
      invoke<string>('read_text_file', { path: entry.path })
        .then(setTextContent)
        .catch((e) => setTextError(String(e)));
    }
  }, [entry?.path]);

  if (!open) return null;

  return (
    <div className="w-72 shrink-0 flex flex-col border-l border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Preview
        </span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {!entry ? (
          <EmptyState />
        ) : (
          <>
            <FilePreview entry={entry} textContent={textContent} textError={textError} />
            <TagsSection entry={entry} />
            <PropertiesTable meta={metadata} entry={entry} />
          </>
        )}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-zinc-700 text-xs select-none p-4 text-center">
      Select a single file to preview it
    </div>
  );
}

// ── FilePreview ───────────────────────────────────────────────────────────────

function FilePreview({
  entry,
  textContent,
  textError,
}: {
  entry: NonNullable<ReturnType<typeof getActiveTab>['entries'][number]>;
  textContent: string | null;
  textError: string | null;
}) {
  const { extension, isDir } = entry;

  if (isDir) return null;

  if (IMAGE_EXT.has(extension)) {
    return (
      <div className="shrink-0 p-2 flex items-center justify-center bg-zinc-950 min-h-[120px]">
        <img
          src={convertFileSrc(entry.path)}
          alt={entry.name}
          className="max-w-full max-h-64 object-contain"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>
    );
  }

  if (VIDEO_EXT.has(extension)) {
    return (
      <div className="shrink-0 p-2 bg-zinc-950">
        <video
          src={convertFileSrc(entry.path)}
          controls
          className="w-full max-h-48"
        />
      </div>
    );
  }

  if (AUDIO_EXT.has(extension)) {
    return (
      <div className="shrink-0 p-3 bg-zinc-950">
        <audio src={convertFileSrc(entry.path)} controls className="w-full" />
      </div>
    );
  }

  if (TEXT_EXT.has(extension)) {
    if (textError) {
      return (
        <div className="p-3 text-xs text-zinc-600 italic">{textError}</div>
      );
    }
    if (textContent === null) {
      return (
        <div className="p-3 text-xs text-zinc-600 animate-pulse">Loading…</div>
      );
    }
    return (
      <pre className="p-3 text-[11px] text-zinc-400 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-72 shrink-0">
        {textContent}
      </pre>
    );
  }

  return (
    <div className="p-3 shrink-0">
      <button
        onClick={() => {
          import('@tauri-apps/api/core').then(({ invoke }) =>
            invoke('open_file', { path: entry.path }),
          );
        }}
        className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300"
      >
        <ExternalLink size={13} />
        Open in default app
      </button>
    </div>
  );
}

// ── TagsSection ───────────────────────────────────────────────────────────────

function TagsSection({
  entry,
}: {
  entry: NonNullable<ReturnType<typeof getActiveTab>['entries'][number]>;
}) {
  const store = useAppStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(TAG_COLORS[8]); // indigo default

  async function loadTags() {
    try {
      const result = await invoke<Tag[]>('get_tags', { filePath: entry.path });
      setTags(result);
    } catch { /* ignore */ }
  }

  async function refreshGlobalTags() {
    try {
      const all = await invoke<Tag[]>('get_all_tags');
      store.setAllTags(all);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    setTags([]);
    setAdding(false);
    setTagName('');
    loadTags();
  }, [entry.path]);

  async function handleAdd() {
    const name = tagName.trim();
    if (!name) return;
    try {
      await invoke('add_tag', { filePath: entry.path, tagName: name, color: tagColor });
      setTagName('');
      setAdding(false);
      await loadTags();
      await refreshGlobalTags();
    } catch (e) {
      store.addToast(`Tag error: ${String(e)}`, 'error');
    }
  }

  async function handleRemove(name: string) {
    try {
      await invoke('remove_tag', { filePath: entry.path, tagName: name });
      await loadTags();
      await refreshGlobalTags();
    } catch (e) {
      store.addToast(`Tag error: ${String(e)}`, 'error');
    }
  }

  return (
    <div className="border-t border-zinc-800 px-3 py-3 shrink-0">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <TagIcon size={11} className="text-zinc-600" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Tags
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            title="Add tag"
            className="text-zinc-600 hover:text-indigo-400 transition-colors"
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {/* Existing tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag.tagName}
            className="flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full text-[11px] text-white"
            style={{
              backgroundColor: tag.color + '33',
              border: `1px solid ${tag.color}66`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <span style={{ color: tag.color }} className="font-medium">
              {tag.tagName}
            </span>
            <button
              onClick={() => handleRemove(tag.tagName)}
              className="ml-0.5 text-zinc-500 hover:text-white transition-colors"
              title={`Remove "${tag.tagName}"`}
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {tags.length === 0 && !adding && (
          <span className="text-[11px] text-zinc-700 italic">
            No tags — click + to add
          </span>
        )}
      </div>

      {/* Add-tag form */}
      {adding && (
        <div className="space-y-2 pt-1">
          {/* Name input */}
          <input
            autoFocus
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setTagName('');
              }
            }}
            placeholder="Tag name…"
            className="w-full bg-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 px-2 py-1.5 rounded outline-none ring-1 ring-zinc-700 focus:ring-indigo-500 transition-shadow"
          />

          {/* Color swatches */}
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setTagColor(c)}
                title={c}
                className="w-4 h-4 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c,
                  transform: tagColor === c ? 'scale(1.3)' : undefined,
                  boxShadow: tagColor === c ? `0 0 0 2px #18181b, 0 0 0 3.5px ${c}` : undefined,
                }}
              />
            ))}
          </div>

          {/* Preview pill */}
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[11px]"
              style={{
                backgroundColor: tagColor + '33',
                border: `1px solid ${tagColor}66`,
                color: tagColor,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: tagColor }}
              />
              <span className="font-medium">{tagName || 'Preview'}</span>
            </span>
          </div>

          {/* Confirm / cancel */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={!tagName.trim()}
              className="flex-1 py-1 rounded text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              Add Tag
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setTagName('');
              }}
              className="px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PropertiesTable ───────────────────────────────────────────────────────────

function PropertiesTable({
  meta,
  entry,
}: {
  meta: FileMetadata | null;
  entry: NonNullable<ReturnType<typeof getActiveTab>['entries'][number]>;
}) {
  const rows: [string, string][] = [
    ['Name', entry.name],
    ['Type', entry.isDir ? 'Folder' : entry.extension?.toUpperCase() || 'File'],
    ['Size', entry.isDir ? '—' : formatSize(entry.size, false)],
    ['Modified', formatDate(entry.modified)],
    ...(meta
      ? ([
          ['Created', formatDate(meta.created)],
          ['Read-only', meta.readonly ? 'Yes' : 'No'],
        ] as [string, string][])
      : []),
    ['Path', entry.path],
  ];

  return (
    <div className="border-t border-zinc-800 px-3 py-3 shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">
        Properties
      </p>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="align-top">
              <td className="text-zinc-600 pr-2 py-0.5 whitespace-nowrap">{label}</td>
              <td className="text-zinc-300 break-all py-0.5">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
