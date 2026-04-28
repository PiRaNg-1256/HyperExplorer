import { useRef } from 'react';
import { useAppStore } from '../store';

export function ResizeDivider() {
  const store = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = store.dividerPercent;
    const container = containerRef.current?.parentElement;
    const containerWidth = container?.offsetWidth ?? 800;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const deltaPct = (delta / containerWidth) * 100;
      store.setDividerPercent(startPct + deltaPct);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 bg-zinc-800 hover:bg-indigo-500 active:bg-indigo-500 cursor-col-resize transition-colors z-10"
      title="Drag to resize panes"
    />
  );
}
