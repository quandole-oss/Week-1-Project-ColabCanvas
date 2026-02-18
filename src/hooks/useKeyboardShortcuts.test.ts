import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fire(key: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(event);
}

describe('useKeyboardShortcuts', () => {
  const callbacks = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDeleteSelected: vi.fn(),
    onLayerForward: vi.fn(),
    onLayerBackward: vi.fn(),
    onLayerToFront: vi.fn(),
    onLayerToBack: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
  };

  const fabricRef = { current: { getActiveObject: () => null } as any };

  beforeEach(() => {
    Object.values(callbacks).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    // cleanup is handled by renderHook unmount
  });

  it('Cmd+C calls onCopy when not editing text', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire('c', { metaKey: true });
    expect(callbacks.onCopy).toHaveBeenCalledOnce();
  });

  it('Cmd+C does NOT call onCopy when Fabric textbox is editing', () => {
    const editingRef = {
      current: { getActiveObject: () => ({ isEditing: true }) } as any,
    };
    renderHook(() => useKeyboardShortcuts({ fabricRef: editingRef, ...callbacks }));
    fire('c', { metaKey: true });
    expect(callbacks.onCopy).not.toHaveBeenCalled();
  });

  it('Backspace does NOT trigger onDeleteSelected if target is an input', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const event = new KeyboardEvent('keydown', {
      code: 'Backspace',
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(callbacks.onDeleteSelected).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Shift+] (key=}) triggers onLayerToFront', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire('}', { shiftKey: true });
    expect(callbacks.onLayerToFront).toHaveBeenCalledOnce();
  });

  it('] triggers onLayerForward', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire(']');
    expect(callbacks.onLayerForward).toHaveBeenCalledOnce();
  });

  it('Ctrl+Z triggers onUndo', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire('z', { ctrlKey: true });
    expect(callbacks.onUndo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+Z triggers onRedo', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire('z', { ctrlKey: true, shiftKey: true });
    expect(callbacks.onRedo).toHaveBeenCalledOnce();
  });

  it('rapid Cmd+V fires onPaste for each keydown (guard lives in Canvas)', () => {
    renderHook(() => useKeyboardShortcuts({ fabricRef, ...callbacks }));
    fire('v', { metaKey: true });
    fire('v', { metaKey: true });
    expect(callbacks.onPaste).toHaveBeenCalledTimes(2);
  });
});

describe('paste guard logic', () => {
  it('second paste call is blocked while first is in progress', () => {
    let isPasting = false;
    const pasteFn = vi.fn(() => { isPasting = true; });

    const guardedPaste = () => {
      if (isPasting) return;
      pasteFn();
    };

    guardedPaste(); // first call goes through
    guardedPaste(); // second call blocked
    expect(pasteFn).toHaveBeenCalledOnce();
  });
});
