import type { DragPayload } from '../types';

/**
 * Module-level mutable drag state. Intentionally NOT React state — we don't
 * want re-renders on every drag pixel. Components read it only in drop handlers.
 */
let _drag: DragPayload | null = null;

export const dragContext = {
  set: (payload: DragPayload | null): void => {
    _drag = payload;
  },
  get: (): DragPayload | null => _drag,
  clear: (): void => {
    _drag = null;
  },
};
