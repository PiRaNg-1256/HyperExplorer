/**
 * SpatialCanvas — pinboard view powered by @xyflow/react.
 *
 * Features:
 *  - Load all pinned items from SQLite on open
 *  - Drag nodes freely; positions auto-saved (debounced 500ms)
 *  - Double-click folder node  → navigate active pane
 *  - Double-click file node    → open with default app
 *  - × button on each node     → unpin
 *  - "Pin selected" button in toolbar → pin active selection
 *  - Ctrl+\ (handled in App.tsx) toggles the overlay
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  type Node,
  type NodeProps,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Navigation,
  ExternalLink,
  MapPin,
  LayoutGrid,
  Trash2,
} from 'lucide-react';
import { useAppStore, getActiveTab } from '../store';
import type { PinnedItem } from '../types';
import { FileIcon } from './FileIcon';

// ── Node data type ────────────────────────────────────────────────────────────

type PinNodeData = {
  name: string;
  path: string;
  isDir: boolean;
  extension: string;
};

type PinNode = Node<PinNodeData, 'pin'>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pathBasename(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p;
}

function pathExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function pinnedToNode(p: PinnedItem): PinNode {
  const name = pathBasename(p.path);
  return {
    id: p.path,
    type: 'pin',
    position: { x: p.positionX, y: p.positionY },
    data: {
      name,
      path: p.path,
      isDir: p.isDir,
      extension: p.isDir ? '' : pathExtension(name),
    },
  };
}

// ── Custom PinNode component ──────────────────────────────────────────────────

function PinNodeComponent({ id, data }: NodeProps) {
  const { name, path, isDir, extension } = data as PinNodeData;
  const store = useAppStore();

  function handleActivate() {
    if (isDir) {
      store.setCurrentPath(store.activePaneId, path);
      store.setCanvasOpen(false);
    } else {
      invoke('open_file', { path }).catch(() => {});
    }
  }

  async function handleUnpin() {
    try {
      await invoke('unpin_item', { path });
    } catch { /* ignore */ }
    // The parent canvas listens to node changes; we also signal via a custom event
    window.dispatchEvent(new CustomEvent('canvas:unpin', { detail: { id } }));
  }

  return (
    <div
      className="group w-44 rounded-lg border border-zinc-700 bg-zinc-850 shadow-2xl overflow-hidden select-none"
      style={{ backgroundColor: '#1c1c1f' }}
      onDoubleClick={handleActivate}
    >
      {/* Accent stripe */}
      <div
        className={`h-0.5 w-full ${isDir ? 'bg-indigo-500' : 'bg-zinc-600'}`}
      />

      {/* Header: icon + name + unpin */}
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
        <div className="shrink-0">
          <FileIcon isDir={isDir} extension={extension} />
        </div>
        <span
          className="flex-1 text-[13px] font-medium text-zinc-200 truncate"
          title={name}
        >
          {name}
        </span>
        <button
          className="nodrag nopan shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
          onClick={handleUnpin}
          title="Unpin"
        >
          <X size={12} />
        </button>
      </div>

      {/* Path */}
      <div className="px-2.5 pb-2 text-[10px] text-zinc-600 truncate" title={path}>
        {path}
      </div>

      {/* Action button */}
      <div className="border-t border-zinc-700/50 px-2 py-1.5">
        <button
          className="nodrag nopan w-full flex items-center justify-center gap-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          onClick={handleActivate}
          title={isDir ? 'Navigate to folder' : 'Open file'}
        >
          {isDir ? <Navigation size={11} /> : <ExternalLink size={11} />}
          <span>{isDir ? 'Navigate' : 'Open'}</span>
        </button>
      </div>
    </div>
  );
}

const nodeTypes = { pin: PinNodeComponent };

// ── Main SpatialCanvas ────────────────────────────────────────────────────────

export function SpatialCanvas() {
  const store = useAppStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<PinNode>([]);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Load pinned items on open ─────────────────────────────────────────────

  async function loadPinned() {
    setLoading(true);
    try {
      const pinned = await invoke<PinnedItem[]>('get_pinned');
      setNodes(pinned.map(pinnedToNode));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!store.canvasOpen) return;
    loadPinned();
  }, [store.canvasOpen]);

  // ── Listen for unpin events from child nodes ──────────────────────────────

  useEffect(() => {
    function onUnpin(e: Event) {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setNodes((nds) => nds.filter((n) => n.id !== id));
    }
    window.addEventListener('canvas:unpin', onUnpin);
    return () => window.removeEventListener('canvas:unpin', onUnpin);
  }, [setNodes]);

  // ── Save position after drag (debounced 500ms) ────────────────────────────

  const handleNodesChange: OnNodesChange<PinNode> = useCallback(
    (changes) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          const { id } = change;
          const timer = saveTimers.current.get(id);
          if (timer) clearTimeout(timer);
          const t = setTimeout(() => {
            invoke('pin_item', {
              path: id,
              positionX: change.position!.x,
              positionY: change.position!.y,
              isDir: nodes.find((n) => n.id === id)?.data.isDir ?? false,
            }).catch(() => {});
            saveTimers.current.delete(id);
          }, 500);
          saveTimers.current.set(id, t);
        }
      }
    },
    [onNodesChange, nodes],
  );

  // ── Pin all currently selected files in the active pane ───────────────────

  async function handlePinSelected() {
    const state = useAppStore.getState();
    const tab = getActiveTab(state.panes[state.activePaneId]);
    const selected = [...tab.selectedPaths];
    if (selected.length === 0) {
      store.addToast('Select files first, then pin them', 'info');
      return;
    }

    // Spread new nodes horizontally below existing ones
    const existingIds = new Set(nodes.map((n) => n.id));
    const newPaths = selected.filter((p) => !existingIds.has(p));
    if (newPaths.length === 0) {
      store.addToast('All selected items are already pinned', 'info');
      return;
    }

    const startX = 60;
    const startY = nodes.length > 0
      ? Math.max(...nodes.map((n) => n.position.y)) + 160
      : 60;

    const newNodes: PinNode[] = [];
    for (let i = 0; i < newPaths.length; i++) {
      const path = newPaths[i];
      const entry = tab.entries.find((e) => e.path === path);
      const isDir = entry?.isDir ?? false;
      const posX = startX + (i % 4) * 200;
      const posY = startY + Math.floor(i / 4) * 160;
      await invoke('pin_item', { path, positionX: posX, positionY: posY, isDir }).catch(() => {});
      const name = pathBasename(path);
      newNodes.push({
        id: path,
        type: 'pin',
        position: { x: posX, y: posY },
        data: {
          name,
          path,
          isDir,
          extension: isDir ? '' : pathExtension(name),
        },
      });
    }

    setNodes((nds) => [...nds, ...newNodes]);
    store.addToast(
      `Pinned ${newNodes.length} item${newNodes.length > 1 ? 's' : ''} to canvas`,
      'info',
    );
  }

  // ── Clear all pinned ──────────────────────────────────────────────────────

  async function handleClearAll() {
    for (const node of nodes) {
      await invoke('unpin_item', { path: node.id }).catch(() => {});
    }
    setNodes([]);
  }

  // ── Auto-layout: arrange in a grid ───────────────────────────────────────

  function handleAutoLayout() {
    setNodes((nds) =>
      nds.map((n, i) => ({
        ...n,
        position: { x: 60 + (i % 4) * 200, y: 60 + Math.floor(i / 4) * 160 },
      })),
    );
    // Persist new positions
    setTimeout(() => {
      setNodes((nds) => {
        for (const n of nds) {
          invoke('pin_item', {
            path: n.id,
            positionX: n.position.x,
            positionY: n.position.y,
            isDir: n.data.isDir,
          }).catch(() => {});
        }
        return nds;
      });
    }, 50);
  }

  // ── Don't render when closed ──────────────────────────────────────────────

  if (!store.canvasOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-3">
          <MapPin size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-300">Spatial Canvas</span>
          <span className="text-xs text-zinc-600">
            {nodes.length} {nodes.length === 1 ? 'item' : 'items'} pinned
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Pin selected from active pane */}
          <button
            onClick={handlePinSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            title="Pin selected files from active pane"
          >
            <MapPin size={12} />
            Pin Selected
          </button>

          {/* Auto-layout */}
          {nodes.length > 0 && (
            <button
              onClick={handleAutoLayout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Arrange in a grid"
            >
              <LayoutGrid size={12} />
              Layout
            </button>
          )}

          {/* Clear all */}
          {nodes.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-zinc-700 hover:border-red-800 text-zinc-500 hover:text-red-400 transition-colors"
              title="Unpin all items"
            >
              <Trash2 size={12} />
              Clear All
            </button>
          )}

          {/* Close */}
          <button
            onClick={() => store.setCanvasOpen(false)}
            className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close canvas (Ctrl+\)"
          >
            <X size={12} />
            Close
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-700 text-sm h-full">
            Loading pinned items…
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={[]}
            onNodesChange={handleNodesChange}
            nodeTypes={nodeTypes}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            style={{ backgroundColor: '#09090b' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#27272a"
            />

            <Controls
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: 8,
                padding: 4,
              }}
            />

            <MiniMap
              style={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: 8,
              }}
              nodeColor="#6366f1"
              maskColor="rgba(9,9,11,0.7)"
            />

            {/* Empty state */}
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-32 flex flex-col items-center gap-3 text-center">
                  <MapPin size={36} className="text-zinc-800" />
                  <p className="text-zinc-600 text-sm font-medium">
                    No items pinned yet
                  </p>
                  <p className="text-zinc-700 text-xs max-w-xs">
                    Select files in any pane, then click{' '}
                    <span className="text-zinc-500 font-medium">Pin Selected</span>{' '}
                    — or right-click files and choose{' '}
                    <span className="text-zinc-500 font-medium">Pin to Canvas</span>.
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
