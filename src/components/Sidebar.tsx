import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { FileEntry, Tag } from '../types';
import {
  HardDrive,
  Monitor,
  Download,
  FileText,
  Image,
  Video,
  Music,
  X,
  MapPin,
  type LucideIcon,
} from 'lucide-react';

const SPECIAL_ICONS: Record<string, LucideIcon> = {
  Desktop: Monitor,
  Downloads: Download,
  Documents: FileText,
  Pictures: Image,
  Videos: Video,
  Music: Music,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        {title}
      </div>
      {children}
    </div>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
        active
          ? 'bg-indigo-500/20 text-white'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const store = useAppStore();
  const { drives, specialDirs, allTags, activePaneId } = store;

  const activeTab = (() => {
    const pane = store.panes[activePaneId];
    return pane.tabs.find((t) => t.id === pane.activeTabId) ?? pane.tabs[0];
  })();

  const currentPath = activeTab.currentPath;
  const tagFilter = activeTab.tagFilter;

  // Unique tags from all tags
  const uniqueTags = [...new Map(allTags.map((t) => [t.tagName, t])).values()];

  useEffect(() => {
    invoke<string[]>('list_drives')
      .then((d) => store.setDrives(d))
      .catch(() => {});
    invoke<FileEntry[]>('get_special_dirs')
      .then((d) => store.setSpecialDirs(d))
      .catch(() => {});
    invoke<Tag[]>('get_all_tags')
      .then((t) => store.setAllTags(t))
      .catch(() => {});
  }, []);

  function navigate(path: string) {
    store.setCurrentPath(activePaneId, path);
  }

  return (
    <div className="w-48 shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800 py-2 select-none overflow-hidden">
      {/* Favorites */}
      <SidebarSection title="Favorites">
        {specialDirs.map((dir) => {
          const Icon = SPECIAL_ICONS[dir.name] ?? FileText;
          return (
            <SidebarItem
              key={dir.path}
              label={dir.name}
              icon={<Icon size={14} />}
              active={currentPath === dir.path}
              onClick={() => navigate(dir.path)}
            />
          );
        })}
      </SidebarSection>

      {/* Drives */}
      <SidebarSection title="Drives">
        {drives.map((drive) => (
          <SidebarItem
            key={drive}
            label={drive}
            icon={<HardDrive size={14} />}
            active={currentPath === drive}
            onClick={() => navigate(drive)}
          />
        ))}
      </SidebarSection>

      <div className="flex-1 overflow-y-auto">
      {/* Tags */}
      {uniqueTags.length > 0 && (
        <SidebarSection title="Tags">
          {tagFilter && (
            <button
              onClick={() => store.setTagFilter(activePaneId, null)}
              className="w-full flex items-center gap-2 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <X size={11} /> Clear filter
            </button>
          )}
          {uniqueTags.map((tag) => (
            <button
              key={tag.tagName}
              onClick={() =>
                store.setTagFilter(
                  activePaneId,
                  tagFilter === tag.tagName ? null : tag.tagName,
                )
              }
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                tagFilter === tag.tagName
                  ? 'text-white bg-white/10'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: tag.color }}
              />
              <span className="truncate">{tag.tagName}</span>
            </button>
          ))}
        </SidebarSection>
      )}
      </div>

      {/* Canvas toggle button — pinned at the bottom */}
      <div className="shrink-0 border-t border-zinc-800 px-2 py-2">
        <button
          onClick={() => store.toggleCanvas()}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
            store.canvasOpen
              ? 'bg-indigo-500/20 text-indigo-300'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
          }`}
          title="Spatial Canvas (Ctrl+\)"
        >
          <MapPin size={14} />
          <span>Spatial Canvas</span>
          <span className="ml-auto text-[10px] text-zinc-700">Ctrl+\</span>
        </button>
      </div>
    </div>
  );
}
