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

// Lerp factor per frame: higher = snappier, lower = smoother (0.2 ≈ smooth at 60fps)
const CURSOR_LERP = 0.22;

export function CursorOverlay({ cursors, canvasRef }: CursorOverlayProps) {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const cursorElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const smoothPositionsRef = useRef<Map<string, ScreenPosition>>(new Map());
  const cursorsRef = useRef<Map<string, CursorState>>(cursors);

  // Keep cursorsRef in sync without triggering rAF restart
  useEffect(() => {
    cursorsRef.current = cursors;
  }, [cursors]);

  // rAF loop: lerp display position toward target for smooth movement
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
        if (typeof cursor.x !== 'number' || typeof cursor.y !== 'number') return;
        const targetX = cursor.x * zoom + vpt[4];
        const targetY = cursor.y * zoom + vpt[5];

        let smooth = smoothPositionsRef.current.get(odId);
        if (!smooth) {
          smooth = { x: targetX, y: targetY };
          smoothPositionsRef.current.set(odId, smooth);
        }
        smooth.x += (targetX - smooth.x) * CURSOR_LERP;
        smooth.y += (targetY - smooth.y) * CURSOR_LERP;
        el.style.transform = `translate(${smooth.x}px, ${smooth.y}px)`;
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
    smoothPositionsRef.current.forEach((_, id) => {
      if (!cursors.has(id)) {
        smoothPositionsRef.current.delete(id);
        cursorElementsRef.current.delete(id);
      }
    });
  }, [cursors]);

  const setElementRef = useCallback((odId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cursorElementsRef.current.set(odId, el);
    } else {
      cursorElementsRef.current.delete(odId);
      smoothPositionsRef.current.delete(odId);
    }
  }, []);

  // Only show cursor when user is NOT interacting with an object (no selection, not moving, not dragging)
  const cursorsToShow = Array.from(cursors.entries()).filter(([, cursor]) => {
    const hasSelection = cursor.selectedObjectIds && cursor.selectedObjectIds.length > 0;
    const isMoving = cursor.isMoving === true;
    const isDragging = cursor.movingObjectPositions != null && Object.keys(cursor.movingObjectPositions).length > 0;
    return !hasSelection && !isMoving && !isDragging;
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {cursorsToShow.map(([odId, cursor]) => (
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
