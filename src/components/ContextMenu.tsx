import { useLayoutEffect, useRef, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MenuItem =
  | {
      kind: 'item';
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onClick: () => void;
    }
  | { kind: 'separator' };

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Start off-screen so the first paint is invisible while we measure
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  // After the first paint, clamp to viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
      top: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
    });
  }, [x, y]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Invisible backdrop — click/right-click outside closes the menu */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu panel */}
      <div
        ref={menuRef}
        className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[210px] text-sm select-none"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) =>
          item.kind === 'separator' ? (
            <div key={i} className="h-px bg-zinc-700/80 my-1" />
          ) : (
            <button
              key={i}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-2.5 px-3 py-[5px] text-left transition-colors ${
                item.disabled
                  ? 'text-zinc-600 cursor-default'
                  : item.danger
                  ? 'text-red-400 hover:bg-red-900/40 cursor-pointer'
                  : 'text-zinc-300 hover:bg-zinc-700 cursor-pointer'
              }`}
            >
              {item.icon ? (
                <item.icon
                  size={14}
                  className={`shrink-0 ${item.danger ? 'text-red-500' : 'text-zinc-500'}`}
                />
              ) : (
                <span className="w-[14px] shrink-0" />
              )}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[11px] text-zinc-600 ml-3 shrink-0">{item.shortcut}</span>
              )}
            </button>
          ),
        )}
      </div>
    </>
  );
}
