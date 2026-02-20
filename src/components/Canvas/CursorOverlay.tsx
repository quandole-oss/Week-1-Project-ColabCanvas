import { useEffect, useRef, useCallback } from 'react';
import type { Canvas } from 'fabric';
import type { CursorState } from '../../types';

interface CursorOverlayProps {
  cursors: Map<string, CursorState>;
  canvasRef: React.MutableRefObject<Canvas | null>;
}

interface ScreenPosition {
  x: number;
  y: number;
}

export function CursorOverlay({ cursors, canvasRef }: CursorOverlayProps) {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const cursorElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastPositionsRef = useRef<Map<string, ScreenPosition>>(new Map());
  const cursorsRef = useRef<Map<string, CursorState>>(cursors);

  // Keep cursorsRef in sync without triggering rAF restart
  useEffect(() => {
    cursorsRef.current = cursors;
  }, [cursors]);

  // rAF loop: direct DOM manipulation, no React state
  useEffect(() => {
    const updatePositions = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(updatePositions);
        return;
      }
      const vpt = canvas.viewportTransform;
      if (!vpt) {
        animationFrameRef.current = requestAnimationFrame(updatePositions);
        return;
      }
      const zoom = canvas.getZoom();

      cursorsRef.current.forEach((cursor, odId) => {
        const el = cursorElementsRef.current.get(odId);
        if (!el) return;
        const screenX = cursor.x * zoom + vpt[4];
        const screenY = cursor.y * zoom + vpt[5];
        const last = lastPositionsRef.current.get(odId);
        if (last && Math.abs(last.x - screenX) < 0.5 && Math.abs(last.y - screenY) < 0.5) return;
        lastPositionsRef.current.set(odId, { x: screenX, y: screenY });
        el.style.transform = `translate(${screenX}px, ${screenY}px)`;
      });

      animationFrameRef.current = requestAnimationFrame(updatePositions);
    };

    animationFrameRef.current = requestAnimationFrame(updatePositions);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canvasRef]);

  // Clean up stale entries when cursors leave
  useEffect(() => {
    lastPositionsRef.current.forEach((_, id) => {
      if (!cursors.has(id)) {
        lastPositionsRef.current.delete(id);
        cursorElementsRef.current.delete(id);
      }
    });
  }, [cursors]);

  const setElementRef = useCallback((odId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cursorElementsRef.current.set(odId, el);
    } else {
      cursorElementsRef.current.delete(odId);
      lastPositionsRef.current.delete(odId);
    }
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {Array.from(cursors.entries()).map(([odId, cursor]) => (
        <div
          key={odId}
          ref={setElementRef(odId)}
          className="absolute"
          style={{
            willChange: 'transform',
            transform: 'translate(-9999px, -9999px)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
          >
            <path
              d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.38 2.79a.5.5 0 0 0-.88.42Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
          <div
            className="absolute left-5 top-4 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.userName}
          </div>
        </div>
      ))}
    </div>
  );
}
