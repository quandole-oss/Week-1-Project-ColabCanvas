import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Canvas } from '../Canvas';
import type { HistoryEntry } from '../Canvas';
import { OnlineUsers } from '../Presence';
import { AICommandInput } from '../AI';
import { useAuth } from '../../hooks/useAuth';
import { useCursorSync } from '../../hooks/useCursorSync';
import { usePresence } from '../../hooks/usePresence';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useAIAgent } from '../../hooks/useAIAgent';
import type { CanvasObjectProps, ShapeType } from '../../types';
import { computeNewZIndex, type ZIndexAction } from '../../utils/zIndex';

interface RoomProps {
  roomId: string;
}

// Sanitize user input to prevent XSS
function sanitizeDisplayName(name: string | null | undefined): string {
  if (!name) return 'Anonymous';
  // Remove potentially dangerous characters
  return name.replace(/[<>'"&]/g, '');
}

export function Room({ roomId }: RoomProps) {
  const { user, signOut } = useAuth();
  const objectCountRef = useRef(0);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const [getViewportCenter, setGetViewportCenter] = useState<(() => { x: number; y: number }) | null>(null);
  const addToHistoryRef = useRef<((entry: HistoryEntry) => void) | null>(null);
  // Batch history entries for AI operations (so multiple objects undo together)
  const batchEntriesRef = useRef<HistoryEntry[]>([]);
  const isBatchingRef = useRef(false);
  // Track AI-created object IDs for auto-selection after batch completes
  const aiCreatedIdsRef = useRef<string[]>([]);
  // Stored selectObjects function from Canvas
  const selectObjectsFnRef = useRef<((ids: string[]) => void) | null>(null);

  if (!user) return null;

  // Sanitize display name for security
  const safeDisplayName = sanitizeDisplayName(user.displayName);

  const { remoteCursors, broadcastCursor } = useCursorSync({
    roomId,
    odId: user.uid,
    userName: safeDisplayName,
    userColor: user.color,
  });

  const { onlineUsers, isConnected: presenceConnected } = usePresence({
    roomId,
    odId: user.uid,
    userName: safeDisplayName,
    userColor: user.color,
  });

  const { objects, isConnected, createObject, createObjects, updateObject, batchUpdateObjects, flushPendingUpdate, removeObject, clearAllObjects, setEditingObjectId, updateObjectZIndex, batchUpdateObjectZIndices, setActiveObjectIds } =
    useRealtimeSync({
      roomId,
      odId: user.uid,
    });

  // Helper to add history entry (supports batching for AI operations)
  const addHistoryEntry = useCallback((entry: HistoryEntry) => {
    if (isBatchingRef.current) {
      // Collect entries during batch
      batchEntriesRef.current.push(entry);
    } else if (addToHistoryRef.current) {
      // Add directly if not batching
      addToHistoryRef.current(entry);
    }
  }, []);

  // Start batching AI operations
  const startHistoryBatch = useCallback(() => {
    isBatchingRef.current = true;
    batchEntriesRef.current = [];
    aiCreatedIdsRef.current = [];
  }, []);

  // End batching and commit as single undo entry
  const endHistoryBatch = useCallback(() => {
    isBatchingRef.current = false;
    if (batchEntriesRef.current.length > 0 && addToHistoryRef.current) {
      if (batchEntriesRef.current.length === 1) {
        // Single entry, add directly
        addToHistoryRef.current(batchEntriesRef.current[0]);
      } else {
        // Multiple entries, wrap in batch
        addToHistoryRef.current({
          type: 'batch',
          objectId: 'batch',
          batchEntries: [...batchEntriesRef.current],
        });
      }
    }
    // Auto-select AI-created objects so the user can immediately reposition/scale
    if (aiCreatedIdsRef.current.length > 0 && selectObjectsFnRef.current) {
      selectObjectsFnRef.current(aiCreatedIdsRef.current);
    }
    aiCreatedIdsRef.current = [];
    batchEntriesRef.current = [];
  }, []);

  // AI agent integration
  const aiCreateObject = useCallback(
    (type: ShapeType, props: CanvasObjectProps): string => {
      const id = uuidv4();
      objectCountRef.current++;
      createObject(id, type, props, objectCountRef.current);
      aiCreatedIdsRef.current.push(id);
      // Add to history for undo support
      addHistoryEntry({
        type: 'create',
        objectId: id,
        objectType: type,
        props,
        zIndex: objectCountRef.current,
      });
      return id;
    },
    [createObject, addHistoryEntry]
  );

  const aiUpdateObject = useCallback(
    (id: string, props: Partial<CanvasObjectProps>) => {
      const existingObj = objects.get(id);
      if (existingObj) {
        const previousProps = { ...existingObj.props };
        const newProps = { ...existingObj.props, ...props };
        updateObject(id, newProps);
        // Add to history for undo support
        addHistoryEntry({
          type: 'modify',
          objectId: id,
          objectType: existingObj.type,
          props: newProps,
          previousProps,
        });
      }
    },
    [objects, updateObject, addHistoryEntry]
  );

  const aiDeleteObject = useCallback(
    (id: string) => {
      const existingObj = objects.get(id);
      if (existingObj) {
        // Add to history for undo support before deleting
        addHistoryEntry({
          type: 'delete',
          objectId: id,
          objectType: existingObj.type,
          props: existingObj.props,
          zIndex: existingObj.zIndex,
        });
        removeObject(id);
      }
    },
    [objects, removeObject, addHistoryEntry]
  );

  const aiReorderObject = useCallback(
    (id: string, action: ZIndexAction) => {
      const objectList = Array.from(objects.values()).map((o) => ({ id: o.id, zIndex: o.zIndex }));
      const newZIndex = computeNewZIndex(objectList, id, action);
      updateObjectZIndex(id, newZIndex);
    },
    [objects, updateObjectZIndex]
  );

  const { messages, isProcessing, processCommand } = useAIAgent({
    canvasObjects: objects,
    createObject: aiCreateObject,
    updateObject: aiUpdateObject,
    deleteObject: aiDeleteObject,
    clearAllObjects,
    getViewportCenter: getViewportCenter || undefined,
    startHistoryBatch,
    endHistoryBatch,
    reorderObject: aiReorderObject,
  });

  const handleObjectCreated = useCallback(
    (id: string, type: ShapeType, props: CanvasObjectProps, zIndex: number) => {
      createObject(id, type, props, zIndex);
    },
    [createObject]
  );

  const handleObjectsCreated = useCallback(
    (objects: { id: string; type: ShapeType; props: CanvasObjectProps; zIndex: number }[]) => {
      createObjects(objects);
    },
    [createObjects]
  );

  const handleObjectModified = useCallback(
    (id: string, props: CanvasObjectProps) => {
      updateObject(id, props);
    },
    [updateObject]
  );

  const handleObjectsBatchModified = useCallback(
    (entries: Array<{ id: string; props: CanvasObjectProps }>) => {
      batchUpdateObjects(entries);
    },
    [batchUpdateObjects]
  );

  const handleObjectDeleted = useCallback(
    (id: string) => {
      removeObject(id);
    },
    [removeObject]
  );

  const handleObjectZIndexChanged = useCallback(
    (id: string, zIndex: number) => {
      updateObjectZIndex(id, zIndex);
    },
    [updateObjectZIndex]
  );

  const handleObjectsZIndexChanged = useCallback(
    (entries: Array<{ id: string; zIndex: number }>) => {
      batchUpdateObjectZIndices(entries);
    },
    [batchUpdateObjectZIndices]
  );

  const handleCursorMove = useCallback(
    (x: number, y: number, selectedObjectIds?: string[] | null, isMoving?: boolean) => {
      broadcastCursor(x, y, selectedObjectIds, isMoving);
    },
    [broadcastCursor]
  );

  // CMD+K / Ctrl+K shortcut to focus AI input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        aiInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 relative">
      {/* Connection status */}
      {!isConnected && (
        <div className="absolute top-0 left-0 right-0 bg-amber-400/90 backdrop-blur-sm text-amber-900 text-center py-1 text-sm z-50 font-medium">
          Connecting to room...
        </div>
      )}

      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-white/70 backdrop-blur-md border-b border-white/20 shadow-sm flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-3">
          <h1 className="text-gray-800 font-semibold">Collaborative Canvas</h1>
          <span className="text-gray-500 text-sm">Room: {roomId}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-700 text-sm">
            {safeDisplayName}
          </span>
          <button
            onClick={signOut}
            className="px-3 py-1.5 text-sm bg-white/50 hover:bg-white/80 text-gray-700 rounded-lg border border-white/30 transition shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="pt-12 w-full h-full">
        <Canvas
          roomId={roomId}
          userId={user.uid}
          onObjectCreated={handleObjectCreated}
          onObjectsCreated={handleObjectsCreated}
          onObjectModified={handleObjectModified}
          onObjectsBatchModified={handleObjectsBatchModified}
          onFlushSync={flushPendingUpdate}
          onEditingObjectChange={setEditingObjectId}
          onObjectDeleted={handleObjectDeleted}
          onCursorMove={handleCursorMove}
          onViewportCenterChange={(fn) => setGetViewportCenter(() => fn)}
          onHistoryAddChange={(fn) => { addToHistoryRef.current = fn; }}
          onObjectZIndexChanged={handleObjectZIndexChanged}
          onObjectsZIndexChanged={handleObjectsZIndexChanged}
          onSelectObjectsReady={(fn) => { selectObjectsFnRef.current = fn; }}
          onActiveObjectsChange={setActiveObjectIds}
          remoteCursors={remoteCursors}
          remoteObjects={objects}
        />
      </div>

      {/* Online users */}
      <div className="absolute bottom-4 left-4 z-30">
        <OnlineUsers
          users={onlineUsers}
          currentUserId={user.uid}
          remoteCursors={remoteCursors}
          presenceConnected={presenceConnected}
        />
      </div>

      {/* AI Command Input */}
      <AICommandInput
        onSubmit={processCommand}
        isProcessing={isProcessing}
        messages={messages}
        inputRef={aiInputRef}
      />
    </div>
  );
}
