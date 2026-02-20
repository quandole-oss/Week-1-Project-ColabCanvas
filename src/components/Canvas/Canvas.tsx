import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { Rect, Circle, Line, Polygon, Triangle, Textbox, FabricObject, ActiveSelection } from 'fabric';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { useCanvas, sendGridToBack } from '../../hooks/useCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { CanvasToolbar } from './CanvasToolbar';
import { CursorOverlay } from './CursorOverlay';
import type { CanvasObjectProps, ShapeType, CursorState, CanvasObject } from '../../types';
import { getAbsolutePosition } from '../../utils/canvasPosition';
import { computeBatchZIndex, computeNewZIndex, type ZIndexAction } from '../../utils/zIndex';

// History entry for undo (supports single or batch operations)
export interface HistoryEntry {
  type: 'create' | 'delete' | 'modify' | 'batch';
  objectId: string;
  objectType?: ShapeType;
  props?: CanvasObjectProps;
  previousProps?: CanvasObjectProps; // For modify: the state before the change
  zIndex?: number;
  // For batch operations (multiple objects at once)
  batchEntries?: HistoryEntry[];
}

interface CanvasProps {
  roomId: string;
  userId: string;
  onObjectCreated?: (id: string, type: ShapeType, props: CanvasObjectProps, zIndex: number) => void;
  onObjectsCreated?: (objects: { id: string; type: ShapeType; props: CanvasObjectProps; zIndex: number }[]) => void;
  onObjectModified?: (id: string, props: CanvasObjectProps) => void;
  onObjectsBatchModified?: (entries: Array<{ id: string; props: CanvasObjectProps }>) => void;
  onFlushSync?: () => void;
  onEditingObjectChange?: (id: string | null) => void;
  onObjectDeleted?: (id: string) => void;
  onCursorMove?: (x: number, y: number, selectedObjectIds?: string[] | null, isMoving?: boolean) => void;
  onViewportCenterChange?: (getCenter: () => { x: number; y: number }) => void;
  onHistoryAddChange?: (addHistory: (entry: HistoryEntry) => void) => void;
  onObjectZIndexChanged?: (id: string, zIndex: number) => void;
  onObjectsZIndexChanged?: (entries: Array<{ id: string; zIndex: number }>) => void;
  onSelectObjectsReady?: (fn: (ids: string[]) => void) => void;
  onActiveObjectsChange?: (ids: Set<string> | null) => void;
  remoteCursors?: Map<string, CursorState>;
  remoteObjects?: Map<string, CanvasObject>;
}

export function Canvas({
  onObjectCreated,
  onObjectsCreated,
  onObjectModified,
  onObjectsBatchModified,
  onFlushSync,
  onEditingObjectChange,
  onObjectDeleted,
  onCursorMove,
  onViewportCenterChange,
  onHistoryAddChange,
  onObjectZIndexChanged,
  onObjectsZIndexChanged,
  onSelectObjectsReady,
  onActiveObjectsChange,
  remoteCursors = new Map(),
  remoteObjects,
}: CanvasProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const objectCountRef = useRef(0);
  const isDrawingRef = useRef(false);
  const isErasingRef = useRef(false);
  // Track object positions to detect when they stop moving (for showing selection outline)
  const objectPositionsRef = useRef<Map<string, { left: number; top: number; timestamp: number }>>(new Map());
  const [stableObjects, setStableObjects] = useState<Set<string>>(() => new Set());
  const drawStartRef = useRef({ x: 0, y: 0 });
  const currentShapeRef = useRef<FabricObject | null>(null);
  const remoteObjectsRef = useRef<Map<string, FabricObject>>(new Map());
  // Track objects with remote selection highlights and their original strokes
  const remoteHighlightsRef = useRef<Map<string, { stroke: string | null; strokeWidth: number }>>(new Map());
  // Track objects pending deletion (to prevent sync from re-creating them)
  const pendingDeletionRef = useRef<Set<string>>(new Set());
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoHistoryRef = useRef<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [, setViewportVersion] = useState(0);
  const [contextMenuPos, setContextMenuPos] = useState<{ left: number; top: number } | null>(null);
  // Store object state before modification for undo
  const objectStateBeforeModifyRef = useRef<Map<string, CanvasObjectProps>>(new Map());
  // Ref-based text persistence: survives Fabric object recreation by sync effect.
  // Key = object ID, Value = latest text typed by the user.
  const textBufferRef = useRef<Map<string, string>>(new Map());
  // Track the Fabric Textbox currently being edited (getActiveObject is unreliable in exit event)
  const editingTextboxRef = useRef<{ id: string; obj: Textbox } | null>(null);
  // Pending AI-created object IDs to auto-select after sync
  const pendingSelectionIdsRef = useRef<string[]>([]);
  // Suppress object:modified events during programmatic auto-select
  const suppressModifiedRef = useRef(false);
  // Track zIndex signature to avoid restacking on every remoteObjects change
  const zIndexSignatureRef = useRef<string>('');

  const {
    fabricRef,
    tool,
    setTool,
    fillColor,
    setFillColor,
    strokeColor,
    setStrokeColor,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    textColor,
    setTextColor,
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    getCanvasCenter,
  } = useCanvas(canvasElRef, {
    onObjectModified,
    onObjectDeleted,
  });

  // Provide viewport center getter to parent
  useEffect(() => {
    if (onViewportCenterChange) {
      onViewportCenterChange(getCanvasCenter);
    }
  }, [onViewportCenterChange, getCanvasCenter]);

  // Refs for tracking color changes (must be after useCanvas to access fillColor/strokeColor)
  const prevFillColorRef = useRef(fillColor);
  const prevStrokeColorRef = useRef(strokeColor);
  const prevFontSizeRef = useRef(fontSize);
  const prevFontFamilyRef = useRef(fontFamily);
  const prevTextColorRef = useRef(textColor);
  const [isStickySelected, setIsStickySelected] = useState(false);
  const [isTextboxSelected, setIsTextboxSelected] = useState(false);

  // Track color drag for batching undo: capture props before the first change,
  // then commit a single history entry when changes stop.
  const colorDragStartRef = useRef<{ objectId: string; props: CanvasObjectProps } | null>(null);
  const colorHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restack Fabric objects by zIndex with deterministic tie-breaking
  const restackCanvasObjects = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !remoteObjects) return;

    const userObjects = canvas.getObjects().filter(
      (o) => (o as FabricObject & { id?: string }).id
    );
    if (userObjects.length <= 1) {
      sendGridToBack(canvas);
      return;
    }

    // Sort by zIndex, tie-break by updatedAt then id for determinism
    const sorted = userObjects
      .map((fabricObj) => {
        const id = (fabricObj as FabricObject & { id?: string }).id!;
        const remote = remoteObjects.get(id);
        return {
          fabricObj,
          zIndex: remote?.zIndex ?? 0,
          updatedAt: remote?.updatedAt?.toMillis?.() ?? 0,
          id,
        };
      })
      .sort((a, b) =>
        a.zIndex - b.zIndex
        || a.updatedAt - b.updatedAt
        || a.id.localeCompare(b.id)
      );

    // Count non-user objects (grid lines) to offset indices
    const gridCount = canvas.getObjects().length - userObjects.length;
    for (let i = 0; i < sorted.length; i++) {
      canvas.moveObjectTo(sorted[i].fabricObj, gridCount + i);
    }
    sendGridToBack(canvas);
  }, [fabricRef, remoteObjects]);

  // Add to history (defined early so effects can use it)
  const addToHistory = useCallback((entry: HistoryEntry) => {
    console.log('[Canvas] addToHistory called:', entry.type, entry.objectId);
    historyRef.current.push(entry);
    console.log('[Canvas] History length now:', historyRef.current.length);
    // Limit history to 50 entries
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    // Clear redo history when new action is performed
    redoHistoryRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // Expose addToHistory to parent for AI operations
  useEffect(() => {
    console.log('[Canvas] Exposing addToHistory to parent, onHistoryAddChange:', !!onHistoryAddChange);
    if (onHistoryAddChange) {
      onHistoryAddChange(addToHistory);
    }
  }, [onHistoryAddChange, addToHistory]);

  // Expose selectObjects function to parent for AI auto-selection
  useEffect(() => {
    if (onSelectObjectsReady) {
      onSelectObjectsReady((ids: string[]) => {
        pendingSelectionIdsRef.current = ids;
      });
    }
  }, [onSelectObjectsReady]);

  // Report active selection changes to parent (for LWW guard)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !onActiveObjectsChange) return;

    const collectIds = () => {
      const active = canvas.getActiveObject();
      if (!active) {
        onActiveObjectsChange(null);
        return;
      }
      const ids = new Set<string>();
      if (active instanceof ActiveSelection) {
        active.getObjects().forEach((o) => {
          const id = (o as FabricObject & { id?: string }).id;
          if (id) ids.add(id);
        });
      } else {
        const id = (active as FabricObject & { id?: string }).id;
        if (id) ids.add(id);
      }
      onActiveObjectsChange(ids.size > 0 ? ids : null);
    };

    canvas.on('selection:created', collectIds);
    canvas.on('selection:updated', collectIds);
    canvas.on('selection:cleared', collectIds);

    return () => {
      canvas.off('selection:created', collectIds);
      canvas.off('selection:updated', collectIds);
      canvas.off('selection:cleared', collectIds);
    };
  }, [fabricRef, onActiveObjectsChange]);

  // Change cursor and selection based on tool
  const isDrawingTool = tool === 'rect' || tool === 'circle' || tool === 'triangle' ||
    tool === 'hexagon' || tool === 'star' || tool === 'line' || tool === 'sticky' || tool === 'textbox';

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (tool === 'pan') {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
    } else if (tool === 'eraser') {
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor = 'crosshair';
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
      });
    } else if (isDrawingTool) {
      // Drawing tools: disable selection so clicks create shapes, not select objects
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor = 'crosshair';
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
    } else {
      // Select tool
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        const hasId = (obj as FabricObject & { id?: string }).id;
        if (hasId) {
          obj.selectable = true;
          obj.evented = true;
        }
      });
    }
  }, [fabricRef, tool, isDrawingTool]);

  // Update selected object colors only when color picker changes (not on selection)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Check if colors actually changed from user interaction
    const fillChanged = fillColor !== prevFillColorRef.current;
    const strokeChanged = strokeColor !== prevStrokeColorRef.current;

    // Update refs
    prevFillColorRef.current = fillColor;
    prevStrokeColorRef.current = strokeColor;

    // Only update if a color actually changed
    if (!fillChanged && !strokeChanged) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    const id = (activeObject as FabricObject & { id?: string }).id;
    if (!id) return;

    // Check if the object's color is already the same (e.g., when selecting an object)
    const currentFill = activeObject.fill as string;
    const currentStroke = activeObject.stroke as string;
    const fillActuallyChanging = fillChanged && !(activeObject instanceof Line) && !(activeObject instanceof Textbox) && currentFill !== fillColor;
    const strokeActuallyChanging = strokeChanged && !(activeObject instanceof Textbox) && currentStroke !== strokeColor;

    // Don't do anything if the object already has these colors
    if (!fillActuallyChanging && !strokeActuallyChanging) return;

    // Capture "before" props on the first change of a drag sequence
    if (!colorDragStartRef.current || colorDragStartRef.current.objectId !== id) {
      colorDragStartRef.current = { objectId: id, props: getObjectProps(activeObject) };
    }

    // Update fill color (not for lines) only if fill changed
    if (fillActuallyChanging) {
      activeObject.set('fill', fillColor);
    }
    // Update stroke color only if stroke changed
    if (strokeActuallyChanging) {
      activeObject.set('stroke', strokeColor);
    }
    canvas.renderAll();

    // Get new props and sync
    const newProps = getObjectProps(activeObject);
    onObjectModified?.(id, newProps);

    // Debounce: commit a single history entry when changes settle
    if (colorHistoryTimerRef.current) clearTimeout(colorHistoryTimerRef.current);
    colorHistoryTimerRef.current = setTimeout(() => {
      if (colorDragStartRef.current) {
        addToHistory({
          type: 'modify',
          objectId: colorDragStartRef.current.objectId,
          objectType: getObjectType(activeObject),
          props: getObjectProps(activeObject),
          previousProps: colorDragStartRef.current.props,
        });
        colorDragStartRef.current = null;
      }
    }, 300);
  }, [fabricRef, fillColor, strokeColor, onObjectModified, addToHistory]);

  // Undo last action
  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    console.log('[Canvas] handleUndo called, history length:', historyRef.current.length);
    if (!canvas || historyRef.current.length === 0) {
      console.log('[Canvas] Undo aborted - no canvas or empty history');
      return;
    }

    const entry = historyRef.current.pop();
    console.log('[Canvas] Undoing entry:', entry?.type, entry?.objectId);
    if (!entry) return;

    // Push to redo stack before undoing
    redoHistoryRef.current.push(entry);

    if (entry.type === 'batch' && entry.batchEntries) {
      // Undo all entries in the batch (in reverse order)
      for (let i = entry.batchEntries.length - 1; i >= 0; i--) {
        const subEntry = entry.batchEntries[i];
        if (subEntry.type === 'create') {
          pendingDeletionRef.current.add(subEntry.objectId);
          const obj = canvas.getObjects().find(
            (o) => (o as FabricObject & { id?: string }).id === subEntry.objectId
          );
          if (obj) {
            canvas.remove(obj);
            remoteObjectsRef.current.delete(subEntry.objectId);
            onObjectDeleted?.(subEntry.objectId);
          }
        } else if (subEntry.type === 'delete' && subEntry.props && subEntry.objectType) {
          pendingDeletionRef.current.delete(subEntry.objectId);
          const fabricObj = createFabricObject({
            id: subEntry.objectId,
            type: subEntry.objectType,
            props: subEntry.props,
            zIndex: subEntry.zIndex ?? 0,
          } as CanvasObject);
          if (fabricObj) {
            (fabricObj as FabricObject & { id: string }).id = subEntry.objectId;
            canvas.add(fabricObj);
            onObjectCreated?.(subEntry.objectId, subEntry.objectType, subEntry.props, subEntry.zIndex ?? 0);
          }
        } else if (subEntry.type === 'modify' && subEntry.previousProps) {
          const obj = canvas.getObjects().find(
            (o) => (o as FabricObject & { id?: string }).id === subEntry.objectId
          );
          if (obj) {
            obj.set({
              left: subEntry.previousProps.left,
              top: subEntry.previousProps.top,
              fill: subEntry.previousProps.fill,
              stroke: subEntry.previousProps.stroke,
              strokeWidth: subEntry.previousProps.strokeWidth,
              angle: subEntry.previousProps.angle,
              scaleX: subEntry.previousProps.scaleX,
              scaleY: subEntry.previousProps.scaleY,
            });
            if (obj instanceof Rect || obj instanceof Triangle || obj instanceof Polygon) {
              obj.set({ width: subEntry.previousProps.width, height: subEntry.previousProps.height });
            } else if (obj instanceof Circle) {
              obj.set({ radius: subEntry.previousProps.radius });
            } else if (obj instanceof Line) {
              obj.set({ x1: subEntry.previousProps.x1, y1: subEntry.previousProps.y1, x2: subEntry.previousProps.x2, y2: subEntry.previousProps.y2 });
            } else if (obj instanceof Textbox) {
              obj.set({ width: subEntry.previousProps.width, height: subEntry.previousProps.height, text: subEntry.previousProps.text ?? '', fontSize: subEntry.previousProps.fontSize, fontFamily: subEntry.previousProps.fontFamily });
            }
            obj.setCoords();
            onObjectModified?.(subEntry.objectId, subEntry.previousProps);
          }
        }
      }
    } else if (entry.type === 'create') {
      // Undo create = delete the object
      // Mark as pending deletion to prevent sync from re-creating it
      pendingDeletionRef.current.add(entry.objectId);
      const obj = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === entry.objectId
      );
      if (obj) {
        canvas.remove(obj);
        remoteObjectsRef.current.delete(entry.objectId);
        onObjectDeleted?.(entry.objectId);
      }
    } else if (entry.type === 'delete' && entry.props && entry.objectType) {
      // Undo delete = recreate the object
      // Clear pending deletion flag since we're re-creating
      pendingDeletionRef.current.delete(entry.objectId);
      const fabricObj = createFabricObject({
        id: entry.objectId,
        type: entry.objectType,
        props: entry.props,
        zIndex: entry.zIndex ?? 0,
      } as CanvasObject);
      if (fabricObj) {
        (fabricObj as FabricObject & { id: string }).id = entry.objectId;
        canvas.add(fabricObj);
        onObjectCreated?.(entry.objectId, entry.objectType, entry.props, entry.zIndex ?? 0);
      }
    } else if (entry.type === 'modify' && entry.previousProps) {
      // Undo modify = restore previous props
      const obj = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === entry.objectId
      );
      if (obj) {
        // Restore previous properties
        obj.set({
          left: entry.previousProps.left,
          top: entry.previousProps.top,
          fill: entry.previousProps.fill,
          stroke: entry.previousProps.stroke,
          strokeWidth: entry.previousProps.strokeWidth,
          angle: entry.previousProps.angle,
          scaleX: entry.previousProps.scaleX,
          scaleY: entry.previousProps.scaleY,
        });

        if (obj instanceof Rect) {
          obj.set({
            width: entry.previousProps.width,
            height: entry.previousProps.height,
          });
        } else if (obj instanceof Circle) {
          obj.set({
            radius: entry.previousProps.radius,
          });
        } else if (obj instanceof Triangle) {
          obj.set({
            width: entry.previousProps.width,
            height: entry.previousProps.height,
          });
        } else if (obj instanceof Polygon) {
          obj.set({
            width: entry.previousProps.width,
            height: entry.previousProps.height,
          });
        } else if (obj instanceof Line) {
          obj.set({
            x1: entry.previousProps.x1,
            y1: entry.previousProps.y1,
            x2: entry.previousProps.x2,
            y2: entry.previousProps.y2,
          });
        } else if (obj instanceof Textbox) {
          obj.set({
            width: entry.previousProps.width,
            height: entry.previousProps.height,
            text: entry.previousProps.text ?? '',
            fontSize: entry.previousProps.fontSize,
            fontFamily: entry.previousProps.fontFamily,
          });
        }

        obj.setCoords();
        onObjectModified?.(entry.objectId, entry.previousProps);
      }
    }

    canvas.renderAll();
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, [fabricRef, onObjectDeleted, onObjectCreated, onObjectModified]);

  // Redo last undone action
  const handleRedo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || redoHistoryRef.current.length === 0) return;

    const entry = redoHistoryRef.current.pop();
    if (!entry) return;

    // Push back to undo history
    historyRef.current.push(entry);

    if (entry.type === 'batch' && entry.batchEntries) {
      // Redo all entries in the batch (in original order)
      for (const subEntry of entry.batchEntries) {
        if (subEntry.type === 'create' && subEntry.props && subEntry.objectType) {
          pendingDeletionRef.current.delete(subEntry.objectId);
          const fabricObj = createFabricObject({
            id: subEntry.objectId,
            type: subEntry.objectType,
            props: subEntry.props,
            zIndex: subEntry.zIndex ?? 0,
          } as CanvasObject);
          if (fabricObj) {
            (fabricObj as FabricObject & { id: string }).id = subEntry.objectId;
            canvas.add(fabricObj);
            onObjectCreated?.(subEntry.objectId, subEntry.objectType, subEntry.props, subEntry.zIndex ?? 0);
          }
        } else if (subEntry.type === 'delete') {
          pendingDeletionRef.current.add(subEntry.objectId);
          const obj = canvas.getObjects().find(
            (o) => (o as FabricObject & { id?: string }).id === subEntry.objectId
          );
          if (obj) {
            canvas.remove(obj);
            remoteObjectsRef.current.delete(subEntry.objectId);
            onObjectDeleted?.(subEntry.objectId);
          }
        } else if (subEntry.type === 'modify' && subEntry.props) {
          const obj = canvas.getObjects().find(
            (o) => (o as FabricObject & { id?: string }).id === subEntry.objectId
          );
          if (obj) {
            obj.set({
              left: subEntry.props.left,
              top: subEntry.props.top,
              fill: subEntry.props.fill,
              stroke: subEntry.props.stroke,
              strokeWidth: subEntry.props.strokeWidth,
              angle: subEntry.props.angle,
              scaleX: subEntry.props.scaleX,
              scaleY: subEntry.props.scaleY,
            });
            if (obj instanceof Rect || obj instanceof Triangle || obj instanceof Polygon) {
              obj.set({ width: subEntry.props.width, height: subEntry.props.height });
            } else if (obj instanceof Circle) {
              obj.set({ radius: subEntry.props.radius });
            } else if (obj instanceof Line) {
              obj.set({ x1: subEntry.props.x1, y1: subEntry.props.y1, x2: subEntry.props.x2, y2: subEntry.props.y2 });
            } else if (obj instanceof Textbox) {
              obj.set({ width: subEntry.props.width, height: subEntry.props.height, text: subEntry.props.text ?? '', fontSize: subEntry.props.fontSize, fontFamily: subEntry.props.fontFamily });
            }
            obj.setCoords();
            onObjectModified?.(subEntry.objectId, subEntry.props);
          }
        }
      }
    } else if (entry.type === 'create' && entry.props && entry.objectType) {
      // Redo create = recreate the object
      // Clear pending deletion flag since we're re-creating
      pendingDeletionRef.current.delete(entry.objectId);
      const fabricObj = createFabricObject({
        id: entry.objectId,
        type: entry.objectType,
        props: entry.props,
        zIndex: entry.zIndex ?? 0,
      } as CanvasObject);
      if (fabricObj) {
        (fabricObj as FabricObject & { id: string }).id = entry.objectId;
        canvas.add(fabricObj);
        onObjectCreated?.(entry.objectId, entry.objectType, entry.props, entry.zIndex ?? 0);
      }
    } else if (entry.type === 'delete') {
      // Redo delete = delete the object again
      // Mark as pending deletion to prevent sync from re-creating it
      pendingDeletionRef.current.add(entry.objectId);
      const obj = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === entry.objectId
      );
      if (obj) {
        canvas.remove(obj);
        remoteObjectsRef.current.delete(entry.objectId);
        onObjectDeleted?.(entry.objectId);
      }
    } else if (entry.type === 'modify' && entry.props) {
      // Redo modify = apply the new props (not previous)
      const obj = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === entry.objectId
      );
      if (obj) {
        obj.set({
          left: entry.props.left,
          top: entry.props.top,
          fill: entry.props.fill,
          stroke: entry.props.stroke,
          strokeWidth: entry.props.strokeWidth,
          angle: entry.props.angle,
          scaleX: entry.props.scaleX,
          scaleY: entry.props.scaleY,
        });

        if (obj instanceof Rect) {
          obj.set({
            width: entry.props.width,
            height: entry.props.height,
          });
        } else if (obj instanceof Circle) {
          obj.set({
            radius: entry.props.radius,
          });
        } else if (obj instanceof Triangle) {
          obj.set({
            width: entry.props.width,
            height: entry.props.height,
          });
        } else if (obj instanceof Polygon) {
          obj.set({
            width: entry.props.width,
            height: entry.props.height,
          });
        } else if (obj instanceof Line) {
          obj.set({
            x1: entry.props.x1,
            y1: entry.props.y1,
            x2: entry.props.x2,
            y2: entry.props.y2,
          });
        } else if (obj instanceof Textbox) {
          obj.set({
            width: entry.props.width,
            height: entry.props.height,
            text: entry.props.text ?? '',
            fontSize: entry.props.fontSize,
            fontFamily: entry.props.fontFamily,
          });
        }

        obj.setCoords();
        onObjectModified?.(entry.objectId, entry.props);
      }
    }

    canvas.renderAll();
    setCanUndo(true);
    setCanRedo(redoHistoryRef.current.length > 0);
  }, [fabricRef, onObjectDeleted, onObjectCreated, onObjectModified]);

  // Delete selected objects (used by floating context menu and keyboard shortcut)
  const handleDeleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach((obj) => {
      const id = (obj as FabricObject & { id?: string }).id;
      if (id) {
        addToHistory({
          type: 'delete',
          objectId: id,
          objectType: getObjectType(obj),
          props: getObjectProps(obj),
          zIndex: objectCountRef.current,
        });
        onObjectDeleted?.(id);
      }
      canvas.remove(obj);
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    setContextMenuPos(null);
  }, [fabricRef, addToHistory, onObjectDeleted]);

  // Clipboard ref for copy/paste
  const clipboardRef = useRef<{ type: ShapeType; props: CanvasObjectProps }[] | null>(null);
  const isPastingRef = useRef(false);
  const pasteCountRef = useRef(0);

  // Copy selected objects to internal clipboard
  const handleCopy = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;
    clipboardRef.current = activeObjects.map((obj) => ({
      type: getObjectType(obj),
      props: getObjectProps(obj),
    }));
    pasteCountRef.current = 0;
  }, [fabricRef]);

  // Paste objects from internal clipboard with offset
  const handlePaste = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !clipboardRef.current) return;
    if (isPastingRef.current) return;
    isPastingRef.current = true;

    // --- Selection Isolation ---
    // Flush any pending sync updates for the current selection's objects
    // so remoteObjects has their latest positions before we discard the selection.
    if (onFlushSync) onFlushSync();

    // Discard the current selection and fire selection:cleared so all listeners
    // (undo tracking, cursor broadcast, etc.) properly process the deselection.
    // This prevents previous objects from being carried over into the new group.
    const previousActive = canvas.getActiveObject();
    if (previousActive instanceof ActiveSelection) {
      // Clear stale before-modify state for old selection children
      previousActive.getObjects().forEach((child) => {
        const childId = (child as FabricObject & { id?: string }).id;
        if (childId) objectStateBeforeModifyRef.current.delete(childId);
      });
    }
    canvas.discardActiveObject();
    canvas.fire('selection:cleared');

    pasteCountRef.current++;
    const offset = 20 * pasteCountRef.current;

    const batchObjects: { id: string; type: ShapeType; props: CanvasObjectProps; zIndex: number }[] = [];
    const historyEntries: HistoryEntry[] = [];
    const pastedFabricObjs: FabricObject[] = [];

    clipboardRef.current.forEach((item) => {
      const id = uuidv4();
      objectCountRef.current++;
      const newProps = { ...item.props, left: item.props.left + offset, top: item.props.top + offset };
      const fabricObj = createFabricObject({
        id,
        type: item.type,
        props: newProps,
        zIndex: objectCountRef.current,
      } as CanvasObject);
      if (fabricObj) {
        (fabricObj as FabricObject & { id: string }).id = id;
        canvas.add(fabricObj);
        pastedFabricObjs.push(fabricObj);
        batchObjects.push({ id, type: item.type, props: newProps, zIndex: objectCountRef.current });
        historyEntries.push({
          type: 'create',
          objectId: id,
          objectType: item.type,
          props: newProps,
          zIndex: objectCountRef.current,
        });
      }
    });

    // Batch sync all pasted objects at once
    if (batchObjects.length > 0) {
      if (onObjectsCreated) {
        onObjectsCreated(batchObjects);
      } else {
        // Fallback to individual calls
        batchObjects.forEach((o) => onObjectCreated?.(o.id, o.type, o.props, o.zIndex));
      }
    }

    // Add history as a single batch entry for clean undo
    if (historyEntries.length === 1) {
      addToHistory(historyEntries[0]);
    } else if (historyEntries.length > 1) {
      addToHistory({
        type: 'batch',
        objectId: 'paste',
        batchEntries: historyEntries,
      });
    }

    // --- Coordinate Finalization ---
    // setCoords() on every pasted child BEFORE grouping into ActiveSelection
    pastedFabricObjs.forEach((obj) => obj.setCoords());

    // Select pasted objects so user can immediately reposition them
    if (pastedFabricObjs.length === 1) {
      canvas.setActiveObject(pastedFabricObjs[0]);
    } else if (pastedFabricObjs.length > 1) {
      const selection = new ActiveSelection(pastedFabricObjs, { canvas });
      canvas.setActiveObject(selection);
    }

    canvas.renderAll();
    isPastingRef.current = false;
  }, [fabricRef, onObjectCreated, onObjectsCreated, addToHistory, onFlushSync]);

  // Layer management callbacks — shared helper for ActiveSelection batch reorder
  const handleLayerBatch = useCallback((action: ZIndexAction, fabricAction: (obj: FabricObject) => void) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    if (activeObj instanceof ActiveSelection) {
      // Batch: compute new z-indices from React state, apply to Fabric canvas, sync
      if (!remoteObjects) return;
      const allObjects = Array.from(remoteObjects.values()).map((o) => ({ id: o.id, zIndex: o.zIndex }));
      const childIds = activeObj.getObjects()
        .map((c) => (c as FabricObject & { id?: string }).id)
        .filter((id): id is string => !!id);
      if (childIds.length === 0) return;
      const entries = computeBatchZIndex(allObjects, childIds, action);
      if (entries.length === 0) return;
      // Apply Fabric visual reorder: move each child individually (sorted by new zIndex)
      const sorted = [...entries].sort((a, b) => a.zIndex - b.zIndex);
      for (const entry of sorted) {
        const fabricObj = canvas.getObjects().find(
          (o) => (o as FabricObject & { id?: string }).id === entry.id
        );
        if (fabricObj) fabricAction(fabricObj);
      }
      sendGridToBack(canvas);
      canvas.renderAll();
      onObjectsZIndexChanged?.(entries);
    } else {
      if (!remoteObjects) return;
      const id = (activeObj as FabricObject & { id?: string }).id;
      if (!id) return;
      fabricAction(activeObj);
      sendGridToBack(canvas);
      const allObjects = Array.from(remoteObjects.values()).map((o) => ({ id: o.id, zIndex: o.zIndex }));
      const newZIndex = computeNewZIndex(allObjects, id, action);
      onObjectZIndexChanged?.(id, newZIndex);
    }
  }, [fabricRef, remoteObjects, onObjectZIndexChanged, onObjectsZIndexChanged]);

  const handleLayerForward = useCallback(() => {
    handleLayerBatch('bringForward', (obj) => fabricRef.current?.bringObjectForward(obj));
  }, [handleLayerBatch, fabricRef]);

  const handleLayerBackward = useCallback(() => {
    handleLayerBatch('sendBackward', (obj) => fabricRef.current?.sendObjectBackwards(obj));
  }, [handleLayerBatch, fabricRef]);

  const handleLayerToFront = useCallback(() => {
    handleLayerBatch('bringToFront', (obj) => fabricRef.current?.bringObjectToFront(obj));
  }, [handleLayerBatch, fabricRef]);

  const handleLayerToBack = useCallback(() => {
    handleLayerBatch('sendToBack', (obj) => fabricRef.current?.sendObjectToBack(obj));
  }, [handleLayerBatch, fabricRef]);

  // Keyboard shortcuts (extracted from inline useEffect)
  useKeyboardShortcuts({
    fabricRef,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDeleteSelected: handleDeleteSelected,
    onLayerForward: handleLayerForward,
    onLayerBackward: handleLayerBackward,
    onLayerToFront: handleLayerToFront,
    onLayerToBack: handleLayerToBack,
    onCopy: handleCopy,
    onPaste: handlePaste,
  });

  // Track object modifications for undo
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Capture state when user starts interacting with an object
    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const target = opt.target;
      if (!target) return;
      // Handle ActiveSelection: capture before-state for all children
      if (target instanceof ActiveSelection) {
        target.getObjects().forEach((child) => {
          const childId = (child as FabricObject & { id?: string }).id;
          if (childId) {
            objectStateBeforeModifyRef.current.set(childId, getObjectProps(child));
          }
        });
        return;
      }
      const id = (target as FabricObject & { id?: string }).id;
      if (id) {
        // Store current state before any modification
        objectStateBeforeModifyRef.current.set(id, getObjectProps(target));
      }
    };

    // Record modification in history when interaction completes
    const handleObjectModified = (opt: { target: FabricObject }) => {
      if (suppressModifiedRef.current) return;
      const obj = opt.target;
      // Handle ActiveSelection: create a batch history entry for all children
      if (obj instanceof ActiveSelection) {
        const batchEntries: HistoryEntry[] = [];
        const fallbackSyncEntries: Array<{ id: string; props: CanvasObjectProps }> = [];

        // Post-process props for a child inside an ActiveSelection:
        // flatten group scale into dimensions and snap position to grid
        const postProcess = (child: FabricObject, props: CanvasObjectProps): CanvasObjectProps => {
          const matrix = child.calcTransformMatrix();
          const effScaleX = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
          const effScaleY = Math.sqrt(matrix[2] * matrix[2] + matrix[3] * matrix[3]);

          // Flatten effective scale into actual dimensions
          const actualWidth = Math.round((child.width ?? 0) * effScaleX);
          let actualHeight = Math.round((child.height ?? 0) * effScaleY);

          // Handle sticky note height
          if (child instanceof Textbox) {
            const customType = (child as FabricObject & { customType?: string }).customType;
            if (customType === 'sticky') {
              const storedH = (child as any)._stickyHeight ?? 200;
              const wasResized = effScaleY !== 1;
              actualHeight = wasResized ? Math.round(storedH * effScaleY) : storedH;
              (child as any)._stickyHeight = actualHeight;
              (child as any).minWidth = Math.max(actualWidth, 40);
            }
          }

          if (props.width !== undefined) props.width = actualWidth;
          if (props.height !== undefined) props.height = actualHeight;
          if (props.radius !== undefined) props.radius = Math.round(props.radius * effScaleX);
          props.scaleX = 1;
          props.scaleY = 1;

          return props;
        };

        obj.getObjects().forEach((child) => {
          const childId = (child as FabricObject & { id?: string }).id;
          if (childId) {
            const previousProps = objectStateBeforeModifyRef.current.get(childId);
            if (previousProps) {
              const currentProps = postProcess(child, getObjectProps(child));
              if (JSON.stringify(previousProps) !== JSON.stringify(currentProps)) {
                batchEntries.push({
                  type: 'modify',
                  objectId: childId,
                  objectType: getObjectType(child),
                  props: currentProps,
                  previousProps,
                });
              }
              objectStateBeforeModifyRef.current.delete(childId);
            } else {
              // Fallback: no previousProps captured — still sync current state
              const currentProps = postProcess(child, getObjectProps(child));
              fallbackSyncEntries.push({ id: childId, props: currentProps });
            }
          }
        });
        if (batchEntries.length === 1) {
          addToHistory(batchEntries[0]);
        } else if (batchEntries.length > 1) {
          addToHistory({ type: 'batch', objectId: 'multi-select', batchEntries });
        }
        // Batch-sync all modified children atomically (single Firestore WriteBatch)
        const syncEntries = batchEntries
          .filter((e) => e.props)
          .map((e) => ({ id: e.objectId, props: e.props! }));
        // Merge any fallback entries (children without previousProps)
        syncEntries.push(...fallbackSyncEntries);
        if (syncEntries.length > 0) {
          onObjectsBatchModified?.(syncEntries);
        }
        // Update Fabric's internal selection bounds for all children
        requestAnimationFrame(() => {
          obj.getObjects().forEach((child) => child.setCoords());
          canvas.requestRenderAll();
        });
        return;
      }
      const id = (obj as FabricObject & { id?: string }).id;
      if (id) {
        const previousProps = objectStateBeforeModifyRef.current.get(id);
        if (previousProps) {
          const currentProps = getObjectProps(obj);
          // Only add to history if something actually changed
          if (JSON.stringify(previousProps) !== JSON.stringify(currentProps)) {
            addToHistory({
              type: 'modify',
              objectId: id,
              objectType: getObjectType(obj),
              props: currentProps,
              previousProps,
            });
          }
          objectStateBeforeModifyRef.current.delete(id);
          // Sync to Firestore
          onObjectModified?.(id, currentProps);
        } else {
          // No previousProps (mouseDown not captured) — still sync
          const currentProps = getObjectProps(obj);
          onObjectModified?.(id, currentProps);
        }
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('object:modified', handleObjectModified);
    };
  }, [fabricRef, addToHistory, onObjectModified, onObjectsBatchModified]);

  // Text editing lifecycle: lock during editing, buffer keystrokes, sync only on blur.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // --- ENTER: lock this object, store a ref so exit handler can find it ---
    const handleEditingEntered = () => {
      const obj = canvas.getActiveObject();
      if (!obj || !(obj instanceof Textbox)) return;
      const id = (obj as FabricObject & { id?: string }).id;
      if (!id) return;
      editingTextboxRef.current = { id, obj };
      if (onEditingObjectChange) onEditingObjectChange(id);
    };

    // --- CHANGED: buffer the text in a ref (survives component recreation) ---
    // No remote sync here — we only sync on blur.
    const handleTextChanged = () => {
      const editing = editingTextboxRef.current;
      if (editing) {
        textBufferRef.current.set(editing.id, editing.obj.text || '');
      }
    };

    // --- EXIT: push final text and release lock ---
    // IMPORTANT: canvas.getActiveObject() is null here (Fabric deselects before
    // firing this event), so we use editingTextboxRef instead.
    const handleEditingExited = () => {
      const editing = editingTextboxRef.current;
      if (editing && onObjectModified) {
        // Read final text directly from the Fabric Textbox object
        onObjectModified(editing.id, getObjectProps(editing.obj));
      }
      // Flush the debounced update immediately (don't wait 100ms)
      if (onFlushSync) onFlushSync();
      // Clear the text buffer now that the final value has been synced
      if (editing) textBufferRef.current.delete(editing.id);
      // Release editing lock (2s grace period in useRealtimeSync)
      if (onEditingObjectChange) onEditingObjectChange(null);
      editingTextboxRef.current = null;
    };

    canvas.on('text:editing:entered', handleEditingEntered);
    canvas.on('text:changed', handleTextChanged);
    canvas.on('text:editing:exited', handleEditingExited);
    return () => {
      canvas.off('text:editing:entered', handleEditingEntered);
      canvas.off('text:changed', handleTextChanged);
      canvas.off('text:editing:exited', handleEditingExited);
    };
  }, [fabricRef, onObjectModified, onFlushSync, onEditingObjectChange]);

  // Handle cursor movement for broadcasting
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !onCursorMove) return;

    const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      // Use scenePoint from event options (Fabric.js v6)
      if (opt.scenePoint) {
        onCursorMove(opt.scenePoint.x, opt.scenePoint.y);
      }
    };

    canvas.on('mouse:move', handleMouseMove);
    return () => {
      canvas.off('mouse:move', handleMouseMove);
    };
  }, [fabricRef, onCursorMove]);

  // Handle selection changes and broadcast them
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !onCursorMove) return;

    const handleSelectionCreated = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        let ids: string[] = [];
        if (activeObject instanceof ActiveSelection) {
          ids = activeObject.getObjects()
            .map((o) => (o as FabricObject & { id?: string }).id)
            .filter((id): id is string => !!id);
        } else {
          const id = (activeObject as FabricObject & { id?: string }).id;
          if (id) ids = [id];
        }
        if (ids.length > 0 && activeObject.left !== undefined && activeObject.top !== undefined) {
          onCursorMove(activeObject.left, activeObject.top, ids, false);
        }
      }
    };

    const handleSelectionCleared = () => {
      // Broadcast that nothing is selected
      onCursorMove(0, 0, null, false);
    };

    // Helper to extract all selected IDs from active object
    const getActiveIds = (): string[] => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return [];
      if (activeObject instanceof ActiveSelection) {
        return activeObject.getObjects()
          .map((o) => (o as FabricObject & { id?: string }).id)
          .filter((id): id is string => !!id);
      }
      const id = (activeObject as FabricObject & { id?: string }).id;
      return id ? [id] : [];
    };

    // Broadcast when object starts moving (hide outline on remote)
    const handleObjectMoving = () => {
      const activeObject = canvas.getActiveObject();
      const ids = getActiveIds();
      if (ids.length > 0 && activeObject && activeObject.left !== undefined && activeObject.top !== undefined) {
        onCursorMove(activeObject.left, activeObject.top, ids, true);
      }
    };

    // Broadcast when object stops moving (show outline again)
    const handleMotionEnd = () => {
      const activeObject = canvas.getActiveObject();
      const ids = getActiveIds();
      if (ids.length > 0 && activeObject && activeObject.left !== undefined && activeObject.top !== undefined) {
        onCursorMove(activeObject.left, activeObject.top, ids, false);
      }
    };

    canvas.on('selection:created', handleSelectionCreated);
    canvas.on('selection:updated', handleSelectionCreated);
    canvas.on('selection:cleared', handleSelectionCleared);
    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:scaling', handleObjectMoving);
    canvas.on('object:rotating', handleObjectMoving);
    canvas.on('object:modified', handleMotionEnd);
    canvas.on('mouse:up', handleMotionEnd); // Backup to ensure immediate response

    return () => {
      canvas.off('selection:created', handleSelectionCreated);
      canvas.off('selection:updated', handleSelectionCreated);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:scaling', handleObjectMoving);
      canvas.off('object:rotating', handleObjectMoving);
      canvas.off('object:modified', handleMotionEnd);
      canvas.off('mouse:up', handleMotionEnd);
    };
  }, [fabricRef, onCursorMove]);

  // Track whether a sticky note is selected and load its font properties
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const updateStickySelection = () => {
      const active = canvas.getActiveObject();
      if (active instanceof Textbox && (active as FabricObject & { id?: string }).id) {
        const customType = (active as FabricObject & { customType?: string }).customType;
        if (customType === 'textbox') {
          setIsStickySelected(false);
          setIsTextboxSelected(true);
        } else {
          setIsStickySelected(true);
          setIsTextboxSelected(false);
        }
        // Load the text element's current font values into toolbar
        if (active.fontSize) setFontSize(active.fontSize);
        if (active.fontFamily) setFontFamily(active.fontFamily);
        if (active.fill) setTextColor(active.fill as string);
      } else {
        setIsStickySelected(false);
        setIsTextboxSelected(false);
      }
    };

    canvas.on('selection:created', updateStickySelection);
    canvas.on('selection:updated', updateStickySelection);
    canvas.on('selection:cleared', updateStickySelection);

    return () => {
      canvas.off('selection:created', updateStickySelection);
      canvas.off('selection:updated', updateStickySelection);
      canvas.off('selection:cleared', updateStickySelection);
    };
  }, [fabricRef, setFontSize, setFontFamily, setTextColor]);

  // Apply font/text-color changes to selected sticky note
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const fontSizeChanged = fontSize !== prevFontSizeRef.current;
    const fontFamilyChanged = fontFamily !== prevFontFamilyRef.current;
    const textColorChanged = textColor !== prevTextColorRef.current;

    prevFontSizeRef.current = fontSize;
    prevFontFamilyRef.current = fontFamily;
    prevTextColorRef.current = textColor;

    if (!fontSizeChanged && !fontFamilyChanged && !textColorChanged) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject || !(activeObject instanceof Textbox)) return;

    const id = (activeObject as FabricObject & { id?: string }).id;
    if (!id) return;

    // Capture "before" props on the first change of a drag sequence
    if (!colorDragStartRef.current || colorDragStartRef.current.objectId !== id) {
      colorDragStartRef.current = { objectId: id, props: getObjectProps(activeObject) };
    }

    if (fontSizeChanged) activeObject.set('fontSize', fontSize);
    if (fontFamilyChanged) activeObject.set('fontFamily', fontFamily);
    if (textColorChanged) activeObject.set('fill', textColor);
    canvas.renderAll();

    const newProps = getObjectProps(activeObject);
    onObjectModified?.(id, newProps);

    // Debounce: commit a single history entry when changes settle
    if (colorHistoryTimerRef.current) clearTimeout(colorHistoryTimerRef.current);
    colorHistoryTimerRef.current = setTimeout(() => {
      if (colorDragStartRef.current) {
        addToHistory({
          type: 'modify',
          objectId: colorDragStartRef.current.objectId,
          objectType: getObjectType(activeObject),
          props: getObjectProps(activeObject),
          previousProps: colorDragStartRef.current.props,
        });
        colorDragStartRef.current = null;
      }
    }, 300);
  }, [fabricRef, fontSize, fontFamily, textColor, onObjectModified, addToHistory]);

  // Track viewport changes to update selection overlays
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const updateViewport = () => {
      setViewportVersion((v) => v + 1);
    };

    canvas.on('mouse:wheel', updateViewport);
    canvas.on('mouse:up', updateViewport);

    return () => {
      canvas.off('mouse:wheel', updateViewport);
      canvas.off('mouse:up', updateViewport);
    };
  }, [fabricRef]);

  // Track floating context menu position for selected objects
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const updatePos = () => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) {
        setContextMenuPos(null);
        return;
      }
      // Allow both single objects (with .id) and ActiveSelection (multi-select)
      const isSingle = !!(activeObj as FabricObject & { id?: string }).id;
      const isMulti = activeObj instanceof ActiveSelection;
      if (!isSingle && !isMulti) {
        setContextMenuPos(null);
        return;
      }
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) {
        setContextMenuPos(null);
        return;
      }
      const bounds = activeObj.getBoundingRect();
      // Transform canvas-space bounds to screen-space using viewport transform
      const screenLeft = bounds.left * zoom + vpt[4];
      const screenTop = bounds.top * zoom + vpt[5];
      const screenWidth = bounds.width * zoom;
      const screenHeight = bounds.height * zoom;
      setContextMenuPos({
        left: screenLeft + screenWidth + 16,
        top: screenTop + screenHeight / 2,
      });
    };

    const hideMenu = () => setContextMenuPos(null);

    canvas.on('selection:created', updatePos);
    canvas.on('selection:updated', updatePos);
    canvas.on('selection:cleared', hideMenu);
    canvas.on('object:moving', hideMenu);
    canvas.on('object:scaling', hideMenu);
    canvas.on('object:rotating', updatePos);
    canvas.on('object:modified', updatePos);
    canvas.on('mouse:up', updatePos);
    canvas.on('mouse:wheel', updatePos);

    return () => {
      canvas.off('selection:created', updatePos);
      canvas.off('selection:updated', updatePos);
      canvas.off('selection:cleared', hideMenu);
      canvas.off('object:moving', hideMenu);
      canvas.off('object:scaling', hideMenu);
      canvas.off('object:rotating', updatePos);
      canvas.off('object:modified', updatePos);
      canvas.off('mouse:up', updatePos);
      canvas.off('mouse:wheel', updatePos);
    };
  }, [fabricRef]);

  // Handle shape drawing
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      if (tool === 'select' || tool === 'pan') return;
      if (!opt.scenePoint) return;

      // Handle eraser tool - start erasing mode
      if (tool === 'eraser') {
        isErasingRef.current = true;
        // Delete object under cursor immediately - use opt.target from Fabric.js v6
        const target = opt.target;
        if (target) {
          const id = (target as FabricObject & { id?: string }).id;
          if (id) {
            const objType = getObjectType(target);
            const props = getObjectProps(target);
            addToHistory({
              type: 'delete',
              objectId: id,
              objectType: objType,
              props,
              zIndex: objectCountRef.current,
            });
            onObjectDeleted?.(id);
            canvas.remove(target);
            canvas.renderAll();
          }
        }
        return;
      }

      // Disable selection while drawing
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });

      const pointer = { x: opt.scenePoint.x, y: opt.scenePoint.y };
      isDrawingRef.current = true;
      drawStartRef.current = { x: pointer.x, y: pointer.y };

      let shape: FabricObject | null = null;
      const id = uuidv4();

      switch (tool) {
        case 'rect':
          shape = new Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: 2,
          });
          break;
        case 'circle':
          shape = new Circle({
            left: pointer.x,
            top: pointer.y,
            radius: 0,
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: 2,
          });
          break;
        case 'triangle':
          shape = new Triangle({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: 2,
          });
          break;
        case 'hexagon':
          shape = new Polygon(
            createHexagonPoints(1),
            {
              left: pointer.x,
              top: pointer.y,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: 2,
              originX: 'left',
              originY: 'top',
            }
          );
          break;
        case 'star':
          shape = new Polygon(
            createStarPoints(1),
            {
              left: pointer.x,
              top: pointer.y,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: 2,
              originX: 'left',
              originY: 'top',
            }
          );
          break;
        case 'line':
          shape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: 2,
          });
          break;
        case 'sticky': {
          const tb = new Textbox('', {
            left: pointer.x,
            top: pointer.y,
            width: 200,
            minWidth: 40,
            fill: textColor,
            backgroundColor: '#FEF3C7',
            strokeWidth: 0,
            fontSize,
            fontFamily,
            padding: 12,
            editable: true,
          });
          (tb as FabricObject & { customType?: string }).customType = 'sticky';
          (tb as any)._stickyHeight = 200;
          applyStickyHeightOverride(tb);
          shape = tb;
          break;
        }
        case 'textbox': {
          const textbox = new Textbox('', {
            left: pointer.x,
            top: pointer.y,
            width: 200,
            minWidth: 50,
            fill: textColor,
            backgroundColor: 'transparent',
            strokeWidth: 0,
            fontSize,
            fontFamily,
            padding: 8,
            editable: true,
          });
          (textbox as FabricObject & { customType?: string }).customType = 'textbox';
          shape = textbox;
          break;
        }
      }

      if (shape) {
        (shape as FabricObject & { id: string }).id = id;
        currentShapeRef.current = shape;
        canvas.add(shape);
      }
    };

    const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      // Handle eraser - delete objects while dragging
      if (tool === 'eraser' && isErasingRef.current) {
        const target = opt.target;
        if (target) {
          const id = (target as FabricObject & { id?: string }).id;
          if (id) {
            const objType = getObjectType(target);
            const props = getObjectProps(target);
            addToHistory({
              type: 'delete',
              objectId: id,
              objectType: objType,
              props,
              zIndex: objectCountRef.current,
            });
            onObjectDeleted?.(id);
            canvas.remove(target);
            canvas.renderAll();
          }
        }
        return;
      }

      if (!isDrawingRef.current || !currentShapeRef.current) return;
      if (!opt.scenePoint) return;

      const pointer = opt.scenePoint;
      const startX = drawStartRef.current.x;
      const startY = drawStartRef.current.y;
      const shape = currentShapeRef.current;

      switch (tool) {
        case 'rect': {
          const width = Math.abs(pointer.x - startX);
          const height = Math.abs(pointer.y - startY);
          // Anchor at start point, grow towards cursor
          const originX = pointer.x >= startX ? 'left' : 'right';
          const originY = pointer.y >= startY ? 'top' : 'bottom';
          (shape as Rect).set({
            left: startX,
            top: startY,
            width,
            height,
            originX,
            originY,
          });
          break;
        }
        case 'circle': {
          const radius = Math.sqrt(
            Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2)
          );
          // Anchor at start point, grow towards cursor
          (shape as Circle).set({
            left: startX,
            top: startY,
            radius,
            originX: 'center',
            originY: 'center',
          });
          break;
        }
        case 'triangle': {
          const width = Math.abs(pointer.x - startX);
          const height = Math.abs(pointer.y - startY);
          // Anchor at start point, grow towards cursor
          const originX = pointer.x >= startX ? 'left' : 'right';
          const originY = pointer.y >= startY ? 'top' : 'bottom';
          (shape as Triangle).set({
            left: startX,
            top: startY,
            width,
            height,
            originX,
            originY,
          });
          break;
        }
        case 'hexagon': {
          const size = Math.max(
            Math.abs(pointer.x - startX),
            Math.abs(pointer.y - startY)
          );
          if (size > 2) {
            // Anchor at start point, grow towards cursor
            const originX = pointer.x >= startX ? 'left' : 'right';
            const originY = pointer.y >= startY ? 'top' : 'bottom';
            const id = (shape as FabricObject & { id?: string }).id;
            canvas.remove(shape);
            const newShape = new Polygon(createHexagonPoints(size), {
              left: startX,
              top: startY,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: 2,
              originX,
              originY,
            }) as FabricObject & { id?: string };
            newShape.id = id;
            canvas.add(newShape);
            currentShapeRef.current = newShape;
          }
          break;
        }
        case 'star': {
          const size = Math.max(
            Math.abs(pointer.x - startX),
            Math.abs(pointer.y - startY)
          );
          if (size > 2) {
            // Anchor at start point, grow towards cursor
            const originX = pointer.x >= startX ? 'left' : 'right';
            const originY = pointer.y >= startY ? 'top' : 'bottom';
            const id = (shape as FabricObject & { id?: string }).id;
            canvas.remove(shape);
            const newShape = new Polygon(createStarPoints(size), {
              left: startX,
              top: startY,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: 2,
              originX,
              originY,
            }) as FabricObject & { id?: string };
            newShape.id = id;
            canvas.add(newShape);
            currentShapeRef.current = newShape;
          }
          break;
        }
        case 'line': {
          (shape as Line).set({
            x2: pointer.x,
            y2: pointer.y,
          });
          break;
        }
        case 'sticky':
        case 'textbox':
          // No-op: click-to-place, not drag-to-size
          break;
      }

      canvas.renderAll();
    };

    const handleMouseUp = () => {
      // Stop erasing if we were erasing
      if (isErasingRef.current) {
        isErasingRef.current = false;
        return;
      }

      // Re-enable selection for all objects (except grid lines which have no id)
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        const hasId = (obj as FabricObject & { id?: string }).id;
        if (hasId) {
          obj.selectable = true;
          obj.evented = true;
        }
      });

      if (!isDrawingRef.current || !currentShapeRef.current) return;

      const shape = currentShapeRef.current;
      const id = (shape as FabricObject & { id: string }).id;

      // Make the new shape selectable
      shape.selectable = true;
      shape.evented = true;

      // Don't save shapes that are too small
      const minSize = 5;
      let isValidShape = true;

      if (tool === 'rect') {
        const rect = shape as Rect;
        isValidShape = (rect.width ?? 0) > minSize && (rect.height ?? 0) > minSize;
      } else if (tool === 'circle') {
        const circle = shape as Circle;
        isValidShape = (circle.radius ?? 0) > minSize;
      } else if (tool === 'triangle') {
        const tri = shape as Triangle;
        isValidShape = (tri.width ?? 0) > minSize && (tri.height ?? 0) > minSize;
      } else if (tool === 'hexagon' || tool === 'star') {
        const polygon = shape as Polygon;
        isValidShape = (polygon.width ?? 0) > minSize && (polygon.height ?? 0) > minSize;
      } else if (tool === 'line') {
        const line = shape as Line;
        const length = Math.sqrt(
          Math.pow((line.x2 ?? 0) - (line.x1 ?? 0), 2) +
          Math.pow((line.y2 ?? 0) - (line.y1 ?? 0), 2)
        );
        isValidShape = length > minSize;
      } else if (tool === 'sticky' || tool === 'textbox') {
        isValidShape = true; // Fixed size, always valid
      }

      if (isValidShape) {
        objectCountRef.current++;

        // Normalize the shape to top-left origin for consistency
        // Calculate actual top-left position based on current origin
        if (shape instanceof Rect || shape instanceof Triangle || shape instanceof Polygon) {
          const width = (shape.width ?? 0) * (shape.scaleX ?? 1);
          const height = (shape.height ?? 0) * (shape.scaleY ?? 1);
          let topLeftX = shape.left ?? 0;
          let topLeftY = shape.top ?? 0;

          // Adjust based on current origin
          if (shape.originX === 'right') {
            topLeftX -= width;
          } else if (shape.originX === 'center') {
            topLeftX -= width / 2;
          }
          if (shape.originY === 'bottom') {
            topLeftY -= height;
          } else if (shape.originY === 'center') {
            topLeftY -= height / 2;
          }

          shape.set({ left: topLeftX, top: topLeftY, originX: 'left', originY: 'top' });
        } else if (shape instanceof Circle) {
          const radius = (shape.radius ?? 0) * (shape.scaleX ?? 1);
          let topLeftX = shape.left ?? 0;
          let topLeftY = shape.top ?? 0;

          // Circle was drawn with center origin
          if (shape.originX === 'center') {
            topLeftX -= radius;
          }
          if (shape.originY === 'center') {
            topLeftY -= radius;
          }

          shape.set({ left: topLeftX, top: topLeftY, originX: 'left', originY: 'top' });
        } else if (shape instanceof Textbox) {
          const tbLeft = shape.left ?? 0;
          const tbTop = shape.top ?? 0;
          const halfW = (shape.width ?? 0) / 2;
          const halfH = (shape.height ?? 0) / 2;
          shape.set({
            left: shape.originX === 'center' ? tbLeft - halfW : tbLeft,
            top: shape.originY === 'center' ? tbTop - halfH : tbTop,
            originX: 'left',
            originY: 'top',
          });
        }
        shape.setCoords();

        const finalLeft = shape.left ?? 0;
        const finalTop = shape.top ?? 0;

        // Get props based on shape type (use rounded values for sync consistency)
        const props: CanvasObjectProps = {
          left: Math.round(finalLeft),
          top: Math.round(finalTop),
          fill: shape.fill as string,
          stroke: shape.stroke as string,
          strokeWidth: shape.strokeWidth,
          scaleX: 1, // Reset scale since we're using actual dimensions
          scaleY: 1,
          angle: shape.angle,
        };

        // Add shape-specific properties (round dimensions for consistency)
        if (shape instanceof Rect || shape instanceof Triangle) {
          props.width = Math.round(shape.width ?? 0);
          props.height = Math.round(shape.height ?? 0);
        } else if (shape instanceof Circle) {
          props.radius = Math.round(shape.radius ?? 0);
        } else if (shape instanceof Polygon) {
          props.width = Math.round(shape.width ?? 0);
          props.height = Math.round(shape.height ?? 0);
        } else if (shape instanceof Line) {
          props.x1 = Math.round(shape.x1 ?? 0);
          props.y1 = Math.round(shape.y1 ?? 0);
          props.x2 = Math.round(shape.x2 ?? 0);
          props.y2 = Math.round(shape.y2 ?? 0);
        } else if (shape instanceof Textbox) {
          props.width = Math.round(shape.width ?? 0);
          props.height = Math.round(shape.height ?? 0);
          props.text = shape.text || '';
          props.fontSize = shape.fontSize;
          props.fontFamily = shape.fontFamily;
          props.textColor = shape.fill as string;
          props.fill = shape.backgroundColor as string;
        }

        onObjectCreated?.(id, tool as ShapeType, props, objectCountRef.current);

        // Add to history for undo
        addToHistory({
          type: 'create',
          objectId: id,
          objectType: tool as ShapeType,
          props,
          zIndex: objectCountRef.current,
        });

        // Auto-select the newly created shape and switch to select tool
        canvas.setActiveObject(shape);
        setTool('select');
        canvas.renderAll();
      } else {
        canvas.remove(shape);
      }

      isDrawingRef.current = false;
      currentShapeRef.current = null;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [fabricRef, tool, fillColor, strokeColor, fontSize, fontFamily, textColor, onObjectCreated, onObjectDeleted, setTool, addToHistory]);

  // Sync remote objects to canvas
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !remoteObjects) return;

    remoteObjects.forEach((obj, id) => {
      // Skip objects that are pending deletion (prevents undo race condition)
      if (pendingDeletionRef.current.has(id)) {
        return;
      }

      const existingLocal = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === id
      );

      if (existingLocal) {
        // Skip if user is currently interacting with or editing this object,
        // UNLESS a programmatic transform (angle/scale) differs from the Fabric state.
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as FabricObject & { id?: string }).id === id) {
          const angleChanged = obj.props.angle !== undefined && Math.abs((obj.props.angle ?? 0) - (existingLocal.angle ?? 0)) > 0.5;
          const scaleChanged = (obj.props.scaleX !== undefined && Math.abs((obj.props.scaleX ?? 1) - (existingLocal.scaleX ?? 1)) > 0.01)
            || (obj.props.scaleY !== undefined && Math.abs((obj.props.scaleY ?? 1) - (existingLocal.scaleY ?? 1)) > 0.01);
          if (!angleChanged && !scaleChanged) {
            return;
          }
        }
        // Also skip objects inside an ActiveSelection (multi-select group)
        if (activeObj instanceof ActiveSelection) {
          const isInSelection = activeObj.getObjects().some(
            (o) => (o as FabricObject & { id?: string }).id === id
          );
          if (isInSelection) {
            return;
          }
        }
        // Also skip if a Textbox is in editing mode (optimistic lock — secondary guard)
        if (existingLocal instanceof Textbox && (existingLocal as any).isEditing) {
          return;
        }
        // Update existing object — but preserve buffered text if it exists
        const buffered = textBufferRef.current.get(id);
        if (buffered !== undefined && (obj.type === 'sticky' || obj.type === 'textbox')) {
          updateFabricObject(existingLocal, { ...obj, props: { ...obj.props, text: buffered } });
        } else {
          updateFabricObject(existingLocal, obj);
        }
        return;
      }

      // Create new remote object
      const bufferedText = textBufferRef.current.get(id);
      const objToCreate = bufferedText !== undefined
        ? { ...obj, props: { ...obj.props, text: bufferedText } }
        : obj;
      const fabricObj = createFabricObject(objToCreate);
      if (fabricObj) {
        (fabricObj as FabricObject & { id: string }).id = id;
        canvas.add(fabricObj);
        remoteObjectsRef.current.set(id, fabricObj);
      }
    });

    // Remove objects that no longer exist remotely
    remoteObjectsRef.current.forEach((fabricObj, id) => {
      if (!remoteObjects.has(id)) {
        canvas.remove(fabricObj);
        remoteObjectsRef.current.delete(id);
      }
    });

    // Clear pending deletion flags for objects that are now gone from remote
    pendingDeletionRef.current.forEach((id) => {
      if (!remoteObjects.has(id)) {
        pendingDeletionRef.current.delete(id);
      }
    });

    // Process pending AI auto-selection
    if (pendingSelectionIdsRef.current.length > 0) {
      const ids = pendingSelectionIdsRef.current;
      const fabricObjs = ids
        .map((id) =>
          canvas.getObjects().find((o) => (o as FabricObject & { id?: string }).id === id)
        )
        .filter(Boolean) as FabricObject[];

      if (fabricObjs.length === ids.length) {
        // All objects found on canvas — select them
        pendingSelectionIdsRef.current = [];
        fabricObjs.forEach((obj) => obj.setCoords());
        suppressModifiedRef.current = true;
        if (fabricObjs.length === 1) {
          canvas.setActiveObject(fabricObjs[0]);
        } else {
          const selection = new ActiveSelection(fabricObjs, { canvas });
          canvas.setActiveObject(selection);
        }
        suppressModifiedRef.current = false;
        setTool('select');
      }
    }

    canvas.renderAll();
  }, [fabricRef, remoteObjects, setTool]);

  // Restack Fabric objects by zIndex — only when zIndex values actually change
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !remoteObjects) return;

    // Derive a stable signature from zIndex values (sorted by id for consistency)
    const signature = Array.from(remoteObjects.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, obj]) => `${id}:${obj.zIndex ?? 0}`)
      .join(',');

    if (signature === zIndexSignatureRef.current) return;
    zIndexSignatureRef.current = signature;

    restackCanvasObjects();
  }, [fabricRef, remoteObjects, restackCanvasObjects]);


  // Detect when remote objects stop moving by tracking position changes
  useEffect(() => {
    if (!remoteObjects) return;

    const now = Date.now();
    let hasChanges = false;

    remoteObjects.forEach((obj, id) => {
      const prev = objectPositionsRef.current.get(id);
      const currentPos = { left: obj.props.left, top: obj.props.top };

      if (!prev || prev.left !== currentPos.left || prev.top !== currentPos.top) {
        // Position changed - update timestamp and mark as moving
        objectPositionsRef.current.set(id, { ...currentPos, timestamp: now });
        if (stableObjects.has(id)) {
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setStableObjects(new Set());
    }

    // Check for objects that have been stable for 80ms
    const checkStability = setTimeout(() => {
      const stableNow = Date.now();
      const newStable = new Set<string>();

      objectPositionsRef.current.forEach((pos, id) => {
        if (stableNow - pos.timestamp >= 80) {
          newStable.add(id);
        }
      });

      setStableObjects(newStable);
    }, 80);

    return () => clearTimeout(checkStability);
  }, [remoteObjects, stableObjects]);

  // Compute remote selections for overlay (hide when object is being moved)
  const remoteSelections = new Map<string, { color: string; userName: string; objectIds: string[] }>();
  remoteCursors.forEach((cursor) => {
    if (cursor.selectedObjectIds && cursor.selectedObjectIds.length > 0) {
      // Only include IDs whose positions are stable (not being moved)
      const stableIds = cursor.selectedObjectIds.filter((id) => stableObjects.has(id));
      if (stableIds.length > 0) {
        remoteSelections.set(cursor.userId, {
          color: cursor.color,
          userName: cursor.userName,
          objectIds: stableIds,
        });
      }
    }
  });

  // Get local selected object IDs for excluding from remote highlights
  const localSelectedIds = new Set<string>();
  const localActive = fabricRef.current?.getActiveObject();
  if (localActive) {
    if (localActive instanceof ActiveSelection) {
      localActive.getObjects().forEach((o) => {
        const id = (o as FabricObject & { id?: string }).id;
        if (id) localSelectedIds.add(id);
      });
    } else {
      const id = (localActive as FabricObject & { id?: string }).id;
      if (id) localSelectedIds.add(id);
    }
  }

  // Apply/remove stroke highlights for remote selections
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Build set of object IDs that should be highlighted
    const shouldHighlight = new Set<string>();
    remoteSelections.forEach((selection) => {
      for (const objectId of selection.objectIds) {
        // Don't highlight objects the local user has selected
        if (!localSelectedIds.has(objectId)) {
          shouldHighlight.add(objectId);
        }
      }
    });

    // Remove highlights from objects no longer selected by remote users
    remoteHighlightsRef.current.forEach((_original, objectId) => {
      if (!shouldHighlight.has(objectId)) {
        const obj = canvas.getObjects().find(
          (o) => (o as FabricObject & { id?: string }).id === objectId
        ) as FabricObject & { _remoteHighlightOriginal?: { stroke: string | null; strokeWidth: number } };
        if (obj && obj._remoteHighlightOriginal) {
          // Restore from the object's property (may have been updated while highlighted)
          obj.set({
            stroke: obj._remoteHighlightOriginal.stroke,
            strokeWidth: obj._remoteHighlightOriginal.strokeWidth,
          });
          // Clear the custom property
          delete obj._remoteHighlightOriginal;
        }
        remoteHighlightsRef.current.delete(objectId);
      }
    });

    // Apply highlights to newly selected objects
    remoteSelections.forEach((selection) => {
      for (const objectId of selection.objectIds) {
        // Skip if local user has this object selected
        if (localSelectedIds.has(objectId)) continue;
        // Skip if already highlighted
        if (remoteHighlightsRef.current.has(objectId)) {
          // Update highlight color if it changed
          const obj = canvas.getObjects().find(
            (o) => (o as FabricObject & { id?: string }).id === objectId
          );
          if (obj && obj.stroke !== selection.color) {
            obj.set({
              stroke: selection.color,
              strokeWidth: 4,
            });
          }
          continue;
        }

        const obj = canvas.getObjects().find(
          (o) => (o as FabricObject & { id?: string }).id === objectId
        ) as FabricObject & { _remoteHighlightOriginal?: { stroke: string | null; strokeWidth: number } };
        if (obj) {
          // Store original stroke on the object itself (so getObjectProps can access it)
          const originalStroke = obj.stroke as string | null;
          const originalStrokeWidth = obj.strokeWidth ?? 2;
          obj._remoteHighlightOriginal = {
            stroke: originalStroke,
            strokeWidth: originalStrokeWidth,
          };
          remoteHighlightsRef.current.set(objectId, {
            stroke: originalStroke,
            strokeWidth: originalStrokeWidth,
          });
          obj.set({
            stroke: selection.color,
            strokeWidth: 4,
          });
        }
      }
    });

    canvas.renderAll();
  }, [fabricRef, remoteSelections, localSelectedIds]);

  // Compute floating context menu for selected object(s)
  let floatingMenu: ReactNode = null;
  if (contextMenuPos) {
    const activeObj = fabricRef.current?.getActiveObject();
    const activeObjId = activeObj ? (activeObj as FabricObject & { id?: string }).id : null;
    const isMultiSelect = activeObj instanceof ActiveSelection;
    if (activeObj && (activeObjId || isMultiSelect)) {
      const isTextElement = !isMultiSelect && activeObj instanceof Textbox;
      const isLineElement = !isMultiSelect && activeObj instanceof Line;
      const currentFill = (activeObj.fill as string) || '#4F46E5';
      const currentStroke = (activeObj.stroke as string) || '#3b82f6';

      floatingMenu = (
        <div
          className="absolute z-30 flex flex-col gap-1.5 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-white/30 pointer-events-none"
          style={{ left: contextMenuPos.left, top: contextMenuPos.top }}
        >
          {/* Color pickers — single object only */}
          {!isMultiSelect && isTextElement ? (
            <label className="relative w-8 h-8 block cursor-pointer pointer-events-auto" title="Text color">
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: currentFill }} />
              <input type="color" value={currentFill} onChange={(e) => setTextColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
          ) : !isMultiSelect && !isLineElement ? (
            <label className="relative w-8 h-8 block cursor-pointer pointer-events-auto" title="Fill color">
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: currentFill }} />
              <input type="color" value={currentFill} onChange={(e) => setFillColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
          ) : null}

          {!isMultiSelect && !isTextElement && (
            <label className="relative w-8 h-8 block cursor-pointer pointer-events-auto" title="Border color">
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: currentStroke }} />
              <input type="color" value={currentStroke} onChange={(e) => setStrokeColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
          )}

          {/* Layer buttons */}
          <button
            className="w-8 h-8 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-md transition pointer-events-auto"
            title="Bring to front (})"
            onClick={handleLayerToFront}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="17 11 12 6 7 11" />
              <polyline points="17 18 12 13 7 18" />
            </svg>
          </button>
          <button
            className="w-8 h-8 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-md transition pointer-events-auto"
            title="Bring forward (])"
            onClick={handleLayerForward}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            className="w-8 h-8 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-md transition pointer-events-auto"
            title="Send backward ([)"
            onClick={handleLayerBackward}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            className="w-8 h-8 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-md transition pointer-events-auto"
            title="Send to back ({)"
            onClick={handleLayerToBack}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="7 13 12 18 17 13" />
              <polyline points="7 6 12 11 17 6" />
            </svg>
          </button>

          {/* Delete */}
          <button
            className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition pointer-events-auto"
            title="Delete"
            onClick={handleDeleteSelected}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      );
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasElRef} />

      {/* Floating context menu for selected object */}
      {floatingMenu}

      {/* Remote selection name badges - positioned above first selected object */}
      {Array.from(remoteSelections.entries()).map(([odId, selection]) => {
        const canvas = fabricRef.current;
        if (!canvas) return null;

        // Skip if all selected objects are also locally selected
        const nonLocalIds = selection.objectIds.filter((id) => !localSelectedIds.has(id));
        if (nonLocalIds.length === 0) return null;

        // Position badge above the first object in the selection
        const firstId = selection.objectIds[0];

        // Find the fabric object on the local canvas
        const obj = canvas.getObjects().find(
          (o) => (o as FabricObject & { id?: string }).id === firstId
        );

        if (obj) {
          const vpt = canvas.viewportTransform;
          const zoom = canvas.getZoom();
          if (!vpt) return null;

          // Get bounding rect for accurate top position (accounts for rotation)
          const bounds = obj.getBoundingRect();

          // Transform canvas-space bounds to screen-space
          const screenCenterX = bounds.left * zoom + vpt[4] + (bounds.width * zoom) / 2;
          const screenTop = bounds.top * zoom + vpt[5];

          return (
            <div
              key={odId}
              className="absolute px-2 py-0.5 rounded-full text-[11px] text-white whitespace-nowrap pointer-events-none z-20 font-medium shadow-md"
              style={{
                backgroundColor: selection.color,
                left: screenCenterX,
                top: screenTop - 24,
                transform: 'translateX(-50%)',
              }}
            >
              {selection.userName}
            </div>
          );
        }

        // Fallback: use synced remoteObjects data if fabric object not found
        const remoteObj = remoteObjects?.get(firstId);
        if (remoteObj) {
          const vpt = canvas.viewportTransform;
          const zoom = canvas.getZoom();
          if (!vpt) return null;

          // Calculate width for centering the badge horizontally
          let width: number;
          if (remoteObj.type === 'circle') {
            const radius = (remoteObj.props.radius || 50) * (remoteObj.props.scaleX || 1);
            width = radius * 2;
          } else {
            width = (remoteObj.props.width || 100) * (remoteObj.props.scaleX || 1);
          }

          // Calculate center position in screen coordinates
          const centerX = remoteObj.props.left + width / 2;
          const screenCenterX = centerX * zoom + vpt[4];
          const screenTop = remoteObj.props.top * zoom + vpt[5];

          return (
            <div
              key={odId}
              className="absolute px-2 py-0.5 rounded-full text-[11px] text-white whitespace-nowrap pointer-events-none z-20 font-medium shadow-md"
              style={{
                backgroundColor: selection.color,
                left: screenCenterX,
                top: screenTop - 24,
                transform: 'translateX(-50%)',
              }}
            >
              {selection.userName}
            </div>
          );
        }

        return null;
      })}

      <CanvasToolbar
        tool={tool}
        setTool={setTool}
        fontSize={fontSize}
        setFontSize={setFontSize}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        textColor={textColor}
        setTextColor={setTextColor}
        isStickySelected={isStickySelected}
        isTextboxSelected={isTextboxSelected}
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onUndo={handleUndo}
        canUndo={canUndo}
        onRedo={handleRedo}
        canRedo={canRedo}
      />

      <CursorOverlay
        cursors={remoteCursors}
        canvasRef={fabricRef}
      />
    </div>
  );
}

// Helper to create hexagon points (centered at origin, fits in size x size box)
function createHexagonPoints(size: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const radius = size / 2;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push({
      x: radius + radius * Math.cos(angle),
      y: radius + radius * Math.sin(angle),
    });
  }
  return points;
}

// Helper to create star points (5-pointed star, fits in size x size box)
function createStarPoints(size: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const outerRadius = size / 2;
  const innerRadius = outerRadius * 0.4;
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push({
      x: outerRadius + radius * Math.cos(angle),
      y: outerRadius + radius * Math.sin(angle),
    });
  }
  return points;
}

// Apply sticky note height enforcement by overriding Fabric's initDimensions.
// Fabric.js Textbox auto-recalculates height based on text content whenever
// text changes, properties update, or the object re-renders. This override
// ensures the sticky never shrinks below its intended height.
function applyStickyHeightOverride(tb: Textbox) {
  const original = tb.initDimensions.bind(tb);
  tb.initDimensions = function () {
    original();
    // Don't fight Fabric during active scaling (user is resizing)
    if ((this.scaleX ?? 1) !== 1 || (this.scaleY ?? 1) !== 1) return;
    const minH = Math.max((this as any)._stickyHeight ?? 200, 40);
    if (this.height < minH) {
      this.height = minH;
    }
  };
  (tb as any)._stickyHeightOverrideApplied = true;
  // Run it once to enforce immediately
  tb.initDimensions();
}

// Helper to create Fabric object from CanvasObject
function createFabricObject(obj: CanvasObject): FabricObject | null {
  const { type, props } = obj;
  // Default stroke color if not provided (ensures outline is visible)
  const strokeColor = props.stroke || '#3b82f6';
  const strokeWidth = props.strokeWidth ?? 2;

  switch (type) {
    case 'rect':
      return new Rect({
        left: props.left,
        top: props.top,
        width: props.width ?? 100,
        height: props.height ?? 100,
        fill: props.fill,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        angle: props.angle ?? 0,
        scaleX: props.scaleX ?? 1,
        scaleY: props.scaleY ?? 1,
        originX: 'left',
        originY: 'top',
      });
    case 'circle':
      return new Circle({
        left: props.left,
        top: props.top,
        radius: props.radius ?? 50,
        fill: props.fill,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        angle: props.angle ?? 0,
        scaleX: props.scaleX ?? 1,
        scaleY: props.scaleY ?? 1,
        originX: 'left',
        originY: 'top',
      });
    case 'triangle':
      return new Triangle({
        left: props.left,
        top: props.top,
        width: props.width ?? 100,
        height: props.height ?? 100,
        fill: props.fill,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        angle: props.angle ?? 0,
        scaleX: props.scaleX ?? 1,
        scaleY: props.scaleY ?? 1,
        originX: 'left',
        originY: 'top',
      });
    case 'hexagon':
      return new Polygon(
        createHexagonPoints(props.height ?? 100),
        {
          left: props.left,
          top: props.top,
          fill: props.fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          angle: props.angle ?? 0,
          scaleX: props.scaleX ?? 1,
          scaleY: props.scaleY ?? 1,
          originX: 'left',
          originY: 'top',
        }
      );
    case 'star':
      return new Polygon(
        createStarPoints(props.height ?? 100),
        {
          left: props.left,
          top: props.top,
          fill: props.fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          angle: props.angle ?? 0,
          scaleX: props.scaleX ?? 1,
          scaleY: props.scaleY ?? 1,
          originX: 'left',
          originY: 'top',
        }
      );
    case 'line':
      return new Line(
        [props.x1 ?? props.left, props.y1 ?? props.top,
         props.x2 ?? (props.left + 100), props.y2 ?? props.top],
        {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        }
      );
    case 'sticky': {
      const stickyTb = new Textbox(props.text ?? '', {
        left: props.left,
        top: props.top,
        width: props.width ?? 200,
        minWidth: 40,
        fill: props.textColor || '#000000',
        backgroundColor: props.fill || '#FEF3C7',
        strokeWidth: 0,
        fontSize: props.fontSize ?? 16,
        fontFamily: props.fontFamily ?? 'Times New Roman',
        padding: 12,
        editable: true,
        angle: props.angle ?? 0,
        scaleX: props.scaleX ?? 1,
        scaleY: props.scaleY ?? 1,
        originX: 'left',
        originY: 'top',
      });
      (stickyTb as FabricObject & { customType?: string }).customType = 'sticky';
      (stickyTb as any)._stickyHeight = props.height ?? 200;
      applyStickyHeightOverride(stickyTb);
      return stickyTb;
    }
    case 'textbox': {
      const textboxObj = new Textbox(props.text ?? '', {
        left: props.left,
        top: props.top,
        width: props.width ?? 200,
        minWidth: 50,
        fill: props.textColor || '#000000',
        backgroundColor: props.fill || 'transparent',
        strokeWidth: 0,
        fontSize: props.fontSize ?? 16,
        fontFamily: props.fontFamily ?? 'sans-serif',
        padding: 8,
        editable: true,
        angle: props.angle ?? 0,
        scaleX: props.scaleX ?? 1,
        scaleY: props.scaleY ?? 1,
        originX: 'left',
        originY: 'top',
      });
      (textboxObj as FabricObject & { customType?: string }).customType = 'textbox';
      return textboxObj;
    }
    default:
      return null;
  }
}

// Helper to update existing Fabric object
function updateFabricObject(fabricObj: FabricObject, obj: CanvasObject) {
  const { props } = obj;
  // Default stroke color if not provided (ensures outline is visible)
  const strokeColor = props.stroke || '#3b82f6';
  const strokeWidth = props.strokeWidth ?? 2;

  // Check if object has a remote highlight applied
  const highlightedObj = fabricObj as FabricObject & { _remoteHighlightOriginal?: { stroke: string | null; strokeWidth: number } };
  const hasHighlight = !!highlightedObj._remoteHighlightOriginal;

  // Animate position for smooth remote movement (avoids jumpy updates from latency)
  const dL = Math.abs((fabricObj.left ?? 0) - props.left);
  const dT = Math.abs((fabricObj.top ?? 0) - props.top);
  const posChanged = dL > 1 || dT > 1;
  if (posChanged && fabricObj.canvas) {
    fabricObj.animate(
      { left: props.left, top: props.top },
      {
        duration: 120,
        onChange: () => fabricObj.canvas?.renderAll(),
        onComplete: () => fabricObj.setCoords(),
      }
    );
  } else {
    // Snap directly for sub-pixel changes (no visible animation)
    fabricObj.set({ left: props.left, top: props.top });
  }

  fabricObj.set({
    angle: props.angle ?? 0,
    scaleX: props.scaleX ?? 1,
    scaleY: props.scaleY ?? 1,
  });

  // Update fill/stroke for shapes that have them
  if (obj.type !== 'line' && obj.type !== 'sticky' && obj.type !== 'textbox') {
    fabricObj.set({
      fill: props.fill,
    });
    // Only update stroke if not currently highlighted (preserve highlight visual)
    if (!hasHighlight) {
      fabricObj.set({
        stroke: strokeColor,
        strokeWidth: strokeWidth,
      });
    } else {
      // Update the stored original stroke values
      highlightedObj._remoteHighlightOriginal = {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
      };
    }
  } else if (obj.type === 'line') {
    // Lines only have stroke, not fill
    if (!hasHighlight) {
      fabricObj.set({
        stroke: strokeColor,
        strokeWidth: strokeWidth,
      });
    } else {
      highlightedObj._remoteHighlightOriginal = {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
      };
    }
  }
  // Sticky notes & textboxes: no stroke (it outlines text characters in Fabric.js)

  if (obj.type === 'rect') {
    (fabricObj as Rect).set({
      width: props.width,
      height: props.height,
    });
  }

  if (obj.type === 'triangle') {
    (fabricObj as Triangle).set({
      width: props.width,
      height: props.height,
    });
  }

  if (obj.type === 'circle') {
    (fabricObj as Circle).set({
      radius: props.radius,
    });
  }

  if (obj.type === 'sticky') {
    const tb = fabricObj as Textbox;
    tb.set({
      width: props.width,
      fontSize: props.fontSize ?? tb.fontSize ?? 16,
      fontFamily: props.fontFamily ?? tb.fontFamily ?? 'Times New Roman',
      fill: props.textColor || '#000000',
      backgroundColor: props.fill || '#FEF3C7',
    });
    (tb as FabricObject & { customType?: string }).customType = 'sticky';
    // Update stored height from synced data
    const stickyH = props.height ?? 200;
    (tb as any)._stickyHeight = stickyH;
    // Re-apply override if not already applied (e.g. object created before fix)
    if (!(tb as any)._stickyHeightOverrideApplied) {
      applyStickyHeightOverride(tb);
      (tb as any)._stickyHeightOverrideApplied = true;
    }
    tb.height = stickyH;
    // Only update text if changed AND not currently editing
    if (props.text !== undefined && tb.text !== props.text) {
      if (!(tb as any).isEditing) {
        // Watchdog: trace when text is being set to empty while it was non-empty
        if (!props.text && tb.text) {
          console.trace(`[Watchdog] Sticky text cleared: "${tb.text}" → ""`);
        }
        tb.set({ text: props.text });
      }
    }
  }

  if (obj.type === 'textbox') {
    const tb = fabricObj as Textbox;
    tb.set({
      width: props.width,
      fontSize: props.fontSize ?? tb.fontSize ?? 16,
      fontFamily: props.fontFamily ?? tb.fontFamily ?? 'sans-serif',
      fill: props.textColor || '#000000',
      backgroundColor: props.fill || 'transparent',
    });
    (tb as FabricObject & { customType?: string }).customType = 'textbox';
    // Only update text if changed AND not currently editing
    if (props.text !== undefined && tb.text !== props.text) {
      if (!(tb as any).isEditing) {
        // Watchdog: trace when text is being set to empty while it was non-empty
        if (!props.text && tb.text) {
          console.trace(`[Watchdog] Textbox text cleared: "${tb.text}" → ""`);
        }
        tb.set({ text: props.text });
      }
    }
  }

  fabricObj.setCoords();
}

// Helper to get object type from Fabric object
function getObjectType(obj: FabricObject): ShapeType {
  if (obj instanceof Textbox) {
    const customType = (obj as FabricObject & { customType?: string }).customType;
    return customType === 'textbox' ? 'textbox' : 'sticky';
  }
  if (obj instanceof Rect) return 'rect';
  if (obj instanceof Circle) return 'circle';
  if (obj instanceof Triangle) return 'triangle';
  if (obj instanceof Line) return 'line';
  if (obj instanceof Polygon) {
    const points = (obj as Polygon).points;
    if (points?.length === 6) return 'hexagon';
    if (points?.length === 10) return 'star';
  }
  return 'rect'; // Default
}

// Helper to get props from Fabric object
function getObjectProps(obj: FabricObject): CanvasObjectProps {
  // Check if object has a remote highlight - if so, use original stroke values
  const highlightOriginal = (obj as FabricObject & { _remoteHighlightOriginal?: { stroke: string | null; strokeWidth: number } })._remoteHighlightOriginal;

  // Get absolute top-left position and combined angle (handles grouped & standalone objects)
  const { left, top, angle: absAngle } = getAbsolutePosition(obj);

  const props: CanvasObjectProps = {
    left: left,
    top: top,
    fill: obj.fill as string,
    stroke: (highlightOriginal ? highlightOriginal.stroke : obj.stroke) as string ?? 'transparent',
    strokeWidth: highlightOriginal ? highlightOriginal.strokeWidth : obj.strokeWidth,
    angle: absAngle ?? obj.angle,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
  };

  if (obj instanceof Rect) {
    props.width = obj.width;
    props.height = obj.height;
  }

  if (obj instanceof Circle) {
    props.radius = obj.radius;
  }

  if (obj instanceof Triangle) {
    props.width = obj.width;
    props.height = obj.height;
  }

  if (obj instanceof Polygon) {
    props.width = obj.width;
    props.height = obj.height;
  }

  if (obj instanceof Line) {
    props.x1 = obj.x1;
    props.y1 = obj.y1;
    props.x2 = obj.x2;
    props.y2 = obj.y2;
  }

  if (obj instanceof Textbox) {
    const customType = (obj as FabricObject & { customType?: string }).customType;
    props.width = obj.width;
    props.height = (customType === 'sticky') ? ((obj as any)._stickyHeight ?? 200) : obj.height;
    props.text = obj.text || '';
    props.fontSize = obj.fontSize;
    props.fontFamily = obj.fontFamily;
    props.textColor = obj.fill as string;
    props.fill = (obj as Textbox).backgroundColor as string;
  }

  return props;
}
