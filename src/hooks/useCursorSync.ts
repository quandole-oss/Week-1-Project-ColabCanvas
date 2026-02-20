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
              // Only include if active recently (10 seconds for background tab tolerance)
              if (Date.now() - msg.cursor.lastActive < 10000) {
                next.set(msg.cursor.userId, msg.cursor);
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
        setRemoteCursors(cursors);
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
    const cursorState: CursorState = {
      x: lastPositionRef.current.x,
      y: lastPositionRef.current.y,
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
      lastPositionRef.current = { x, y };

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
        sendCursorUpdate();
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
