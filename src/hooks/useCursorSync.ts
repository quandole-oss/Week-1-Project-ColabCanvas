import { useEffect, useState, useCallback, useRef } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import { updateCursor, setupCursorCleanup, removeCursor, subscribeToCursors } from '../services/cursorSync';
import { throttle } from '../utils';
import type { CursorState } from '../types';

interface UseCursorSyncOptions {
  roomId: string;
  odId: string;
  userName: string;
  userColor: string;
}

type CursorMessage =
  | { type: 'cursor-update'; cursor: CursorState }
  | { type: 'cursor-remove'; odId: string };

export function useCursorSync({
  roomId,
  odId,
  userName,
  userColor,
}: UseCursorSyncOptions) {
  const [remoteCursors, setRemoteCursors] = useState<Map<string, CursorState>>(
    () => new Map()
  );
  const isSetup = useRef(false);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  // Demo mode: use BroadcastChannel for cursor sync
  useEffect(() => {
    if (!isFirebaseConfigured) {
      const channel = new BroadcastChannel(`canvas-cursors-${roomId}`);
      broadcastChannel.current = channel;

      channel.onmessage = (event: MessageEvent<CursorMessage>) => {
        const msg = event.data;

        if (msg.type === 'cursor-update') {
          // Don't include our own cursor
          if (msg.cursor.userId !== odId) {
            setRemoteCursors((prev) => {
              const next = new Map(prev);
              if (Date.now() - msg.cursor.lastActive < 10000) {
                const c = msg.cursor;
                let x = c.x, y = c.y;
                if (x === 0 && y === 0 && next.has(c.userId)) {
                  const old = next.get(c.userId)!;
                  x = old.x;
                  y = old.y;
                }
                next.set(c.userId, { ...c, x, y });
              }
              return next;
            });
          }
        } else if (msg.type === 'cursor-remove') {
          setRemoteCursors((prev) => {
            const next = new Map(prev);
            next.delete(msg.odId);
            return next;
          });
        }
      };

      // Clean up stale cursors periodically (10 second timeout for background tab tolerance)
      const cleanupInterval = setInterval(() => {
        setRemoteCursors((prev) => {
          const next = new Map(prev);
          const now = Date.now();
          for (const [id, cursor] of next) {
            if (now - cursor.lastActive > 10000) {
              next.delete(id);
            }
          }
          return next;
        });
      }, 3000);

      return () => {
        // Notify others we're leaving
        channel.postMessage({ type: 'cursor-remove', odId } as CursorMessage);
        channel.close();
        broadcastChannel.current = null;
        clearInterval(cleanupInterval);
      };
    }
  }, [roomId, odId]);

  // Set up cursor cleanup on disconnect (Firebase only)
  useEffect(() => {
    if (!isFirebaseConfigured || isSetup.current) return;
    isSetup.current = true;

    try {
      setupCursorCleanup(roomId, odId);
    } catch (error) {
      console.warn('Cursor cleanup setup failed:', error);
    }

    return () => {
      try {
        removeCursor(roomId, odId);
      } catch (error) {
        console.warn('Cursor removal failed:', error);
      }
    };
  }, [roomId, odId]);

  // Subscribe to remote cursors (Firebase only)
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    try {
      const unsubscribe = subscribeToCursors(roomId, odId, (cursors) => {
        // #region agent log
        cursors.forEach((c, id) => { if (c.x === 0 && c.y === 0) { fetch('http://127.0.0.1:7242/ingest/258c0b6e-62fe-4ca4-b5c9-b5b43d02debf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCursorSync.ts:subscribeToCursors',message:'Received remote cursor at (0,0)',data:{userId:id,isMoving:c.isMoving},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{}); } });
        // #endregion
        setRemoteCursors((prev) => {
          const next = new Map<string, CursorState>();
          cursors.forEach((c, id) => {
            let x = c.x, y = c.y;
            if (x === 0 && y === 0 && prev.has(id)) {
              const old = prev.get(id)!;
              x = old.x;
              y = old.y;
            }
            next.set(id, { ...c, x, y });
          });
          return next;
        });
      });

      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.warn('Cursor subscription failed:', error);
    }
  }, [roomId, odId]);

  // Track current selection, position, and motion state for broadcast
  const currentSelectionRef = useRef<string[] | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const isMovingRef = useRef(false);
  const movingPositionsRef = useRef<Record<string, { left: number; top: number; angle?: number }> | null>(null);

  // Send cursor state update
  const sendCursorUpdate = useCallback(() => {
    const x = lastPositionRef.current.x;
    const y = lastPositionRef.current.y;
    // Never broadcast (0,0) — causes remote cursor to snap to top-left (selection clear + heartbeat both hit this)
    if (x === 0 && y === 0) return;
    // #region agent log
    if (x === 0 && y === 0) { fetch('http://127.0.0.1:7242/ingest/258c0b6e-62fe-4ca4-b5c9-b5b43d02debf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCursorSync.ts:sendCursorUpdate',message:'Broadcasting cursor at (0,0)',data:{x,y,isMoving:isMovingRef.current},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{}); }
    // #endregion
    const cursorState: CursorState = {
      x,
      y,
      userId: odId,
      userName,
      color: userColor,
      lastActive: Date.now(),
      selectedObjectIds: currentSelectionRef.current,
      isMoving: isMovingRef.current,
      movingObjectPositions: isMovingRef.current ? movingPositionsRef.current : null,
    };

    if (isFirebaseConfigured) {
      updateCursor(roomId, cursorState);
    } else if (broadcastChannel.current) {
      broadcastChannel.current.postMessage({
        type: 'cursor-update',
        cursor: cursorState,
      } as CursorMessage);
    }
  }, [roomId, odId, userName, userColor]);

  // Heartbeat to keep cursor/selection alive even when idle
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      sendCursorUpdate();
    }, 2000); // Send heartbeat every 2 seconds

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [sendCursorUpdate]);

  // Throttled position-only broadcast (50ms) - for mouse movement
  const throttledPositionUpdate = useCallback(
    throttle((x: number, y: number) => {
      lastPositionRef.current = { x, y };
      sendCursorUpdate();
    }, 50),
    [sendCursorUpdate]
  );

  // Broadcast cursor - selection/motion changes are immediate, position is throttled
  const broadcastCursor = useCallback(
    (x: number, y: number, selectedObjectIds?: string[] | null, isMoving?: boolean, movingObjectPositions?: Record<string, { left: number; top: number; angle?: number }> | null) => {
      // When Canvas clears selection it sends (0,0); don't overwrite last position so we keep
      // broadcasting the real cursor location and avoid remote cursor snapping to top-left
      const selectionClearOnly = x === 0 && y === 0 && selectedObjectIds === null && isMoving === false;
      if (!selectionClearOnly) {
        lastPositionRef.current = { x, y };
      }

      const selectionChanged = selectedObjectIds !== undefined &&
        JSON.stringify(selectedObjectIds) !== JSON.stringify(currentSelectionRef.current);

      const motionChanged = isMoving !== undefined &&
        isMoving !== isMovingRef.current;

      if (selectedObjectIds !== undefined) {
        currentSelectionRef.current = selectedObjectIds;
      }

      if (isMoving !== undefined) {
        isMovingRef.current = isMoving;
      }

      if (movingObjectPositions !== undefined) {
        movingPositionsRef.current = movingObjectPositions;
      }

      // During active drag, always send immediately to minimize latency
      if (isMoving && movingObjectPositions) {
        sendCursorUpdate();
      } else if (selectionChanged || motionChanged) {
        // Never broadcast (0,0) when only clearing selection — observer would snap cursor to origin
        if (selectionClearOnly && lastPositionRef.current.x === 0 && lastPositionRef.current.y === 0) {
          // Skip send; observers keep previous cursor position
        } else {
          sendCursorUpdate();
        }
      } else {
        throttledPositionUpdate(x, y);
      }
    },
    [sendCursorUpdate, throttledPositionUpdate]
  );

  return {
    remoteCursors,
    broadcastCursor,
  };
}
