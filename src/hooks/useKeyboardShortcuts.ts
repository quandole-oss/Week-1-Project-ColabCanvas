import { useEffect, type RefObject } from 'react';
import type { Canvas } from 'fabric';

export interface UseKeyboardShortcutsOptions {
  fabricRef: RefObject<Canvas | null>;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  onLayerForward?: () => void;
  onLayerBackward?: () => void;
  onLayerToFront?: () => void;
  onLayerToBack?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}

export function useKeyboardShortcuts({
  fabricRef,
  onUndo,
  onRedo,
  onDeleteSelected,
  onLayerForward,
  onLayerBackward,
  onLayerToFront,
  onLayerToBack,
  onCopy,
  onPaste,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input fields
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Skip if Fabric textbox is in editing mode
      const canvas = fabricRef.current;
      const activeObj = canvas?.getActiveObject();
      const isFabricEditing = !!(activeObj as any)?.isEditing;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+C — copy
      if (mod && e.key === 'c' && !isTyping && !isFabricEditing) {
        e.preventDefault();
        onCopy?.();
        return;
      }

      // Cmd/Ctrl+V — paste
      if (mod && e.key === 'v' && !isTyping && !isFabricEditing) {
        e.preventDefault();
        onPaste?.();
        return;
      }

      // Cmd/Ctrl+Z (no shift) — undo
      if (mod && e.key === 'z' && !e.shiftKey && !isTyping) {
        e.preventDefault();
        onUndo();
        return;
      }

      // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y — redo
      if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isTyping) {
        e.preventDefault();
        onRedo();
        return;
      }

      // Delete/Backspace — delete selected
      if ((e.code === 'Delete' || e.code === 'Backspace') && !isTyping && !isFabricEditing) {
        e.preventDefault();
        onDeleteSelected();
        return;
      }

      // Layer shortcuts (only when not typing/editing)
      if (isTyping || isFabricEditing) return;

      // `}` (Shift+]) — bring to front
      if (e.key === '}') {
        onLayerToFront?.();
        return;
      }

      // `{` (Shift+[) — send to back
      if (e.key === '{') {
        onLayerToBack?.();
        return;
      }

      // `]` — bring forward
      if (e.key === ']') {
        onLayerForward?.();
        return;
      }

      // `[` — send backward
      if (e.key === '[') {
        onLayerBackward?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    fabricRef,
    onUndo,
    onRedo,
    onDeleteSelected,
    onLayerForward,
    onLayerBackward,
    onLayerToFront,
    onLayerToBack,
    onCopy,
    onPaste,
  ]);
}
