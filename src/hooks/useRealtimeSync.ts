import { useEffect, useState, useCallback, useRef } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import {
  syncObject,
  syncObjectPartial,
  deleteObject,
  subscribeToObjects,
  ensureRoom,
} from '../services/canvasSync';
import { debounce } from '../utils';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { Timestamp } from 'firebase/firestore';

interface UseRealtimeSyncOptions {
  roomId: string;
  odId: string;
}

// BroadcastChannel for demo mode (cross-tab sync in same browser)
type SyncMessage =
  | { type: 'create'; object: CanvasObject }
  | { type: 'update'; id: string; props: CanvasObjectProps }
  | { type: 'delete'; id: string }
  | { type: 'sync-request' }
  | { type: 'sync-response'; objects: [string, CanvasObject][] };

export function useRealtimeSync({ roomId, odId }: UseRealtimeSyncOptions) {
  const [objects, setObjects] = useState<Map<string, CanvasObject>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  // Refcount of pending local writes per object — only process remote echoes when count hits 0
  const localPendingUpdates = useRef<Map<string, number>>(new Map());
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const objectsRef = useRef<Map<string, CanvasObject>>(new Map());
  // Track objects currently being text-edited (optimistic lock)
  const editingObjectIds = useRef<Set<string>>(new Set());

  // Keep objectsRef in sync with objects state
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Demo mode: use BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsConnected(true);

      // Set up BroadcastChannel for cross-tab communication
      const channel = new BroadcastChannel(`canvas-room-${roomId}`);
      broadcastChannel.current = channel;

      channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const msg = event.data;

        if (msg.type === 'create') {
          setObjects((prev) => {
            const next = new Map(prev);
            next.set(msg.object.id, msg.object);
            return next;
          });
        } else if (msg.type === 'update') {
          // Skip if user is currently editing this object (optimistic lock)
          if (editingObjectIds.current.has(msg.id)) return;
          setObjects((prev) => {
            const next = new Map(prev);
            const obj = next.get(msg.id);
            if (obj) {
              next.set(msg.id, {
                ...obj,
                props: { ...obj.props, ...msg.props },
                updatedAt: Timestamp.now(),
              });
            }
            return next;
          });
        } else if (msg.type === 'delete') {
          setObjects((prev) => {
            const next = new Map(prev);
            next.delete(msg.id);
            return next;
          });
        } else if (msg.type === 'sync-request') {
          // Another tab is asking for current state
          channel.postMessage({
            type: 'sync-response',
            objects: Array.from(objectsRef.current.entries()),
          } as SyncMessage);
        } else if (msg.type === 'sync-response') {
          // Merge received objects with our state
          setObjects((prev) => {
            const next = new Map(prev);
            msg.objects.forEach(([id, obj]) => {
              if (!next.has(id)) {
                next.set(id, obj);
              }
            });
            return next;
          });
        }
      };

      // Request sync from other tabs
      channel.postMessage({ type: 'sync-request' } as SyncMessage);

      return () => {
        channel.close();
        broadcastChannel.current = null;
      };
    }

    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      try {
        // Ensure room exists
        await ensureRoom(roomId, odId);
      } catch (error) {
        console.error('Failed to ensure room:', error);
      }

      try {
        setIsConnected(true);

        // Subscribe to object changes (always try, even if ensureRoom had issues)
        unsubscribe = subscribeToObjects(
          roomId,
          // On add
          (obj) => {
            setObjects((prev) => {
              if (prev.has(obj.id)) return prev; // Skip own echo
              const next = new Map(prev);
              next.set(obj.id, obj);
              return next;
            });
          },
          // On modify
          (obj) => {
            // Skip if this is our own pending update echoing back (refcount)
            const pending = localPendingUpdates.current.get(obj.id) ?? 0;
            if (pending > 0) {
              const next = pending - 1;
              if (next === 0) {
                localPendingUpdates.current.delete(obj.id);
              } else {
                localPendingUpdates.current.set(obj.id, next);
              }
              return;
            }
            // Skip if user is currently editing this object (optimistic lock)
            if (editingObjectIds.current.has(obj.id)) return;

            setObjects((prev) => {
              const next = new Map(prev);
              next.set(obj.id, obj);
              return next;
            });
          },
          // On remove
          (objectId) => {
            setObjects((prev) => {
              const next = new Map(prev);
              next.delete(objectId);
              return next;
            });
          }
        );
      } catch (error) {
        console.error('Failed to subscribe to objects:', error);
        setIsConnected(true);
      }
    };

    setup();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomId, odId]);

  // Create new object
  const createObject = useCallback(
    async (
      id: string,
      type: ShapeType,
      props: CanvasObjectProps,
      zIndex: number
    ) => {
      // Create local object immediately
      const now = Timestamp.now();
      const newObj: CanvasObject = {
        id,
        type,
        props,
        zIndex,
        createdBy: odId,
        createdAt: now,
        updatedBy: odId,
        updatedAt: now,
      };

      setObjects((prev) => {
        const next = new Map(prev);
        next.set(id, newObj);
        return next;
      });

      // Sync to Firebase if configured, or broadcast in demo mode
      if (isFirebaseConfigured) {
        localPendingUpdates.current.set(id, (localPendingUpdates.current.get(id) ?? 0) + 1);
        try {
          await syncObject(roomId, id, type, props, zIndex, odId, true);
        } catch (error) {
          console.error('Failed to sync object:', error);
        }
      } else if (broadcastChannel.current) {
        // Demo mode: broadcast to other tabs
        broadcastChannel.current.postMessage({
          type: 'create',
          object: newObj,
        } as SyncMessage);
      }
    },
    [roomId, odId]
  );

  // Update existing object (debounced)
  // Uses objectsRef instead of objects state to avoid recreating the debounce
  // on every state change (which would discard pending position updates)
  const updateObject = useCallback(
    debounce(async (id: string, props: CanvasObjectProps) => {
      const existingObj = objectsRef.current.get(id);
      if (!existingObj) return;

      // Update local state immediately
      setObjects((prev) => {
        const next = new Map(prev);
        const obj = next.get(id);
        if (obj) {
          next.set(id, {
            ...obj,
            props: { ...obj.props, ...props },
            updatedBy: odId,
            updatedAt: Timestamp.now(),
          });
        }
        return next;
      });

      // Sync to Firebase if configured, or broadcast in demo mode
      if (isFirebaseConfigured) {
        localPendingUpdates.current.set(id, (localPendingUpdates.current.get(id) ?? 0) + 1);
        try {
          // Use partial update (dot notation) so only the changed fields
          // are written — prevents text being overwritten by a move, etc.
          await syncObjectPartial(roomId, id, props, odId);
        } catch (error) {
          console.error('Failed to update object:', error);
        }
      } else if (broadcastChannel.current) {
        // Demo mode: broadcast to other tabs
        broadcastChannel.current.postMessage({
          type: 'update',
          id,
          props,
        } as SyncMessage);
      }
    }, 100),
    [roomId, odId]
  );

  // Delete object
  const removeObject = useCallback(
    async (id: string) => {
      // Remove from local state immediately
      setObjects((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Sync to Firebase if configured, or broadcast in demo mode
      if (isFirebaseConfigured) {
        try {
          await deleteObject(roomId, id);
        } catch (error) {
          console.error('Failed to delete object:', error);
        }
      } else if (broadcastChannel.current) {
        // Demo mode: broadcast to other tabs
        broadcastChannel.current.postMessage({
          type: 'delete',
          id,
        } as SyncMessage);
      }
    },
    [roomId]
  );

  // Clear all objects
  const clearAllObjects = useCallback(() => {
    // Use objectsRef to get the current state (avoids stale closure issues)
    const objectIds = Array.from(objectsRef.current.keys());
    const count = objectIds.length;

    // Delete each object
    objectIds.forEach(id => {
      // Remove from local state immediately
      setObjects((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Sync deletion
      if (isFirebaseConfigured) {
        deleteObject(roomId, id).catch(err => console.error('Failed to delete:', err));
      } else if (broadcastChannel.current) {
        broadcastChannel.current.postMessage({
          type: 'delete',
          id,
        } as SyncMessage);
      }
    });

    return count;
  }, [roomId]);

  // Flush any pending debounced update immediately (e.g. when text editing exits)
  const flushPendingUpdate = useCallback(() => {
    (updateObject as unknown as { flush?: () => void }).flush?.();
  }, [updateObject]);

  // Mark/unmark an object as being actively text-edited (optimistic lock).
  // While locked, incoming remote/sync updates for this object are ignored.
  // On unlock, a 2-second grace period keeps the lock active to absorb
  // late-arriving Firestore echoes that would otherwise overwrite the text.
  const editingLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setEditingObjectId = useCallback((id: string | null) => {
    if (editingLockTimer.current) {
      clearTimeout(editingLockTimer.current);
      editingLockTimer.current = null;
    }
    if (id) {
      editingObjectIds.current.add(id);
    } else {
      // Grace period: keep lock for 2s after blur to absorb stale echoes
      editingLockTimer.current = setTimeout(() => {
        editingObjectIds.current.clear();
        editingLockTimer.current = null;
      }, 2000);
    }
  }, []);

  return {
    objects,
    isConnected,
    createObject,
    updateObject,
    flushPendingUpdate,
    removeObject,
    clearAllObjects,
    setEditingObjectId,
  };
}
