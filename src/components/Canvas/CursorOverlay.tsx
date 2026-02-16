import { useEffect, useState, useRef } from 'react';
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
  const [screenPositions, setScreenPositions] = useState<Map<string, ScreenPosition>>(() => new Map());
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Convert world coordinates to screen coordinates
  useEffect(() => {
    const updatePositions = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      const zoom = canvas.getZoom();
      const newPositions = new Map<string, ScreenPosition>();

      cursors.forEach((cursor, odId) => {
        const screenX = cursor.x * zoom + vpt[4];
        const screenY = cursor.y * zoom + vpt[5];
        newPositions.set(odId, { x: screenX, y: screenY });
      });

      setScreenPositions(newPositions);
      animationFrameRef.current = requestAnimationFrame(updatePositions);
    };

    updatePositions();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cursors, canvasRef]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {Array.from(cursors.entries()).map(([odId, cursor]) => {
        const pos = screenPositions.get(odId);
        if (!pos) return null;

        return (
          <div
            key={odId}
            className="absolute transition-transform duration-75"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            }}
          >
            {/* Cursor arrow */}
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

            {/* Name label */}
            <div
              className="absolute left-5 top-4 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
