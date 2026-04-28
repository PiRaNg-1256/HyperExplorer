import { useEffect } from 'react';
import { useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PaneContainer } from './components/PaneContainer';
import { ResizeDivider } from './components/ResizeDivider';
import { PreviewPanel } from './components/PreviewPanel';
import { DropModal } from './components/DropModal';
import { ToastContainer } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { SpatialCanvas } from './components/SpatialCanvas';

export default function App() {
  const store = useAppStore();

  // ── Global keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+K → toggle command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        store.togglePalette();
        return;
      }

      // Ctrl+\ → toggle spatial canvas
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        store.toggleCanvas();
        return;
      }

      // Spacebar → toggle preview (when not in an input/textarea and palette closed)
      if (
        e.key === ' ' &&
        !store.paletteOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        store.togglePreview();
      }

      // Tab → switch active pane (when palette closed)
      if (
        e.key === 'Tab' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !store.paletteOpen &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        store.setActivePaneId(store.activePaneId === 'left' ? 'right' : 'left');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store.activePaneId]);

  const leftWidth = `${store.dividerPercent}%`;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200 overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <Sidebar />

        {/* Dual pane area */}
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {/* Left pane */}
          <div style={{ width: leftWidth }} className="min-w-0 overflow-hidden">
            <PaneContainer paneId="left" />
          </div>

          {/* Resize divider */}
          <ResizeDivider />

          {/* Right pane */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <PaneContainer paneId="right" />
          </div>
        </div>

        {/* Preview panel */}
        <PreviewPanel
          open={store.previewOpen}
          onClose={() => store.togglePreview()}
        />
      </div>

      {/* Drop modal (rendered at root so it overlays both panes) */}
      <DropModal />

      {/* AI command palette (Ctrl+K) */}
      <CommandPalette />

      {/* Spatial canvas (Ctrl+\) */}
      <SpatialCanvas />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
