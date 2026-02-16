import { useRef, useEffect, useState, useCallback } from 'react';
import { Rect, Circle, Line, Polygon, Triangle, Textbox, FabricObject } from 'fabric';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { useCanvas } from '../../hooks/useCanvas';
import { CanvasToolbar } from './CanvasToolbar';
import { CursorOverlay } from './CursorOverlay';
import type { CanvasObjectProps, ShapeType, CursorState, CanvasObject } from '../../types';

// Grid snap size (half of the visual grid for finer placement)
const SNAP_SIZE = 25;

// Snap a value to the nearest grid increment
function snapToGrid(value: number): number {
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}

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
  onObjectModified?: (id: string, props: CanvasObjectProps) => void;
  onObjectDeleted?: (id: string) => void;
  onCursorMove?: (x: number, y: number, selectedObjectId?: string | null, isMoving?: boolean) => void;
  onViewportCenterChange?: (getCenter: () => { x: number; y: number }) => void;
  onHistoryAddChange?: (addHistory: (entry: HistoryEntry) => void) => void;
  remoteCursors?: Map<string, CursorState>;
  remoteObjects?: Map<string, CanvasObject>;
}

export function Canvas({
  onObjectCreated,
  onObjectModified,
  onObjectDeleted,
  onCursorMove,
  onViewportCenterChange,
  onHistoryAddChange,
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
  // Store object state before modification for undo
  const objectStateBeforeModifyRef = useRef<Map<string, CanvasObjectProps>>(new Map());

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

  // Change cursor and selection based on tool
  const isDrawingTool = tool === 'rect' || tool === 'circle' || tool === 'triangle' ||
    tool === 'hexagon' || tool === 'star' || tool === 'line' || tool === 'sticky';

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
    const fillActuallyChanging = fillChanged && !(activeObject instanceof Line) && currentFill !== fillColor;
    const strokeActuallyChanging = strokeChanged && currentStroke !== strokeColor;

    // Don't do anything if the object already has these colors
    if (!fillActuallyChanging && !strokeActuallyChanging) return;

    // Capture previous props for undo (before changing the object)
    const previousProps = getObjectProps(activeObject);

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

    // Add to history for undo
    addToHistory({
      type: 'modify',
      objectId: id,
      objectType: getObjectType(activeObject),
      props: newProps,
      previousProps,
    });
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

  // Keyboard shortcuts: undo (Ctrl+Z), redo (Ctrl+Shift+Z/Ctrl+Y), and delete (Delete/Backspace)
  useEffect(() => {
    const canvas = fabricRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input fields
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable;

      // Undo: Ctrl+Z (without shift)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !isTyping) {
        e.preventDefault();
        handleUndo();
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isTyping) {
        e.preventDefault();
        handleRedo();
      }

      // Delete key - delete selected objects with history support
      if ((e.code === 'Delete' || e.code === 'Backspace') && !isTyping && canvas) {
        const activeObjects = canvas.getActiveObjects();
        activeObjects.forEach((obj) => {
          const id = (obj as FabricObject & { id?: string }).id;
          if (id) {
            // Add to history before deleting
            const objType = getObjectType(obj);
            const props = getObjectProps(obj);
            addToHistory({
              type: 'delete',
              objectId: id,
              objectType: objType,
              props,
              zIndex: objectCountRef.current,
            });
            onObjectDeleted?.(id);
          }
          canvas.remove(obj);
        });
        canvas.discardActiveObject();
        canvas.renderAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fabricRef, handleUndo, handleRedo, addToHistory, onObjectDeleted]);

  // Track object modifications for undo
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Capture state when user starts interacting with an object
    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const target = opt.target;
      if (!target) return;
      const id = (target as FabricObject & { id?: string }).id;
      if (id) {
        // Store current state before any modification
        objectStateBeforeModifyRef.current.set(id, getObjectProps(target));
      }
    };

    // Record modification in history when interaction completes
    const handleObjectModified = (opt: { target: FabricObject }) => {
      const obj = opt.target;
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
        }
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('object:modified', handleObjectModified);
    };
  }, [fabricRef, addToHistory]);

  // Sync sticky note text changes to remote users
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleTextChanged = () => {
      const obj = canvas.getActiveObject();
      if (!obj || !(obj instanceof Textbox)) return;
      const id = (obj as FabricObject & { id?: string }).id;
      if (id && onObjectModified) {
        onObjectModified(id, getObjectProps(obj));
      }
    };

    canvas.on('text:changed', handleTextChanged);
    return () => {
      canvas.off('text:changed', handleTextChanged);
    };
  }, [fabricRef, onObjectModified]);

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
        const id = (activeObject as FabricObject & { id?: string }).id;
        if (id) {
          // Broadcast selection with current position (not moving)
          if (activeObject.left !== undefined && activeObject.top !== undefined) {
            onCursorMove(activeObject.left, activeObject.top, id, false);
          }
        }
      }
    };

    const handleSelectionCleared = () => {
      // Broadcast that nothing is selected
      onCursorMove(0, 0, null, false);
    };

    // Broadcast when object starts moving (hide outline on remote)
    const handleObjectMoving = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        const id = (activeObject as FabricObject & { id?: string }).id;
        if (id && activeObject.left !== undefined && activeObject.top !== undefined) {
          onCursorMove(activeObject.left, activeObject.top, id, true);
        }
      }
    };

    // Broadcast when object stops moving (show outline again)
    const handleMotionEnd = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        const id = (activeObject as FabricObject & { id?: string }).id;
        if (id && activeObject.left !== undefined && activeObject.top !== undefined) {
          onCursorMove(activeObject.left, activeObject.top, id, false);
        }
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
        setIsStickySelected(true);
        // Load the sticky's current font values into toolbar
        if (active.fontSize) setFontSize(active.fontSize);
        if (active.fontFamily) setFontFamily(active.fontFamily);
        if (active.fill) setTextColor(active.fill as string);
      } else {
        setIsStickySelected(false);
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

    // Capture previous props for undo
    const previousProps = getObjectProps(activeObject);

    if (fontSizeChanged) activeObject.set('fontSize', fontSize);
    if (fontFamilyChanged) activeObject.set('fontFamily', fontFamily);
    if (textColorChanged) activeObject.set('fill', textColor);
    canvas.renderAll();

    const newProps = getObjectProps(activeObject);
    onObjectModified?.(id, newProps);

    addToHistory({
      type: 'modify',
      objectId: id,
      objectType: 'sticky',
      props: newProps,
      previousProps,
    });
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

      const pointer = { x: snapToGrid(opt.scenePoint.x), y: snapToGrid(opt.scenePoint.y) };
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
            minWidth: 200,
            fill: textColor,
            backgroundColor: '#FEF3C7',
            strokeWidth: 0,
            fontSize,
            fontFamily,
            padding: 12,
            editable: true,
          });
          // Override auto-computed height to make it square initially
          tb.height = 200;
          tb.setCoords();
          shape = tb;
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
      } else if (tool === 'sticky') {
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

          // Snap to grid for consistent positioning across clients
          topLeftX = snapToGrid(topLeftX);
          topLeftY = snapToGrid(topLeftY);
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

          // Snap to grid for consistent positioning across clients
          topLeftX = snapToGrid(topLeftX);
          topLeftY = snapToGrid(topLeftY);
          shape.set({ left: topLeftX, top: topLeftY, originX: 'left', originY: 'top' });
        } else if (shape instanceof Textbox) {
          // Snap sticky notes to grid
          shape.set({
            left: snapToGrid(shape.left ?? 0),
            top: snapToGrid(shape.top ?? 0),
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

    console.log('[Canvas] Syncing remote objects, count:', remoteObjects.size);
    remoteObjects.forEach((obj, id) => {
      // Skip objects that are pending deletion (prevents undo race condition)
      if (pendingDeletionRef.current.has(id)) {
        return;
      }

      // Skip if this is our own object being echoed back
      const existingLocal = canvas.getObjects().find(
        (o) => (o as FabricObject & { id?: string }).id === id
      );

      if (existingLocal) {
        // Skip if user is currently interacting with this object (prevents position fighting)
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as FabricObject & { id?: string }).id === id) {
          return;
        }
        // Update existing object
        updateFabricObject(existingLocal, obj);
        return;
      }

      // Create new remote object
      console.log('[Canvas] Creating new remote object:', id, obj.type);
      const fabricObj = createFabricObject(obj);
      if (fabricObj) {
        (fabricObj as FabricObject & { id: string }).id = id;
        canvas.add(fabricObj);
        remoteObjectsRef.current.set(id, fabricObj);
        console.log('[Canvas] Added fabric object to canvas');
      } else {
        console.error('[Canvas] Failed to create fabric object for:', obj);
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

    canvas.renderAll();
  }, [fabricRef, remoteObjects]);


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
  const remoteSelections = new Map<string, { color: string; userName: string; objectId: string }>();
  remoteCursors.forEach((cursor) => {
    // Only show selection outline when object is stationary (stable position)
    if (cursor.selectedObjectId && stableObjects.has(cursor.selectedObjectId)) {
      remoteSelections.set(cursor.userId, {
        color: cursor.color,
        userName: cursor.userName,
        objectId: cursor.selectedObjectId,
      });
    }
  });

  // Get local selected object ID for excluding from remote highlights
  const localSelectedId = fabricRef.current?.getActiveObject()
    ? (fabricRef.current.getActiveObject() as FabricObject & { id?: string }).id
    : null;

  // Apply/remove stroke highlights for remote selections
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Build set of object IDs that should be highlighted
    const shouldHighlight = new Set<string>();
    remoteSelections.forEach((selection) => {
      // Don't highlight objects the local user has selected
      if (selection.objectId !== localSelectedId) {
        shouldHighlight.add(selection.objectId);
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
      const objectId = selection.objectId;
      // Skip if local user has this object selected
      if (objectId === localSelectedId) return;
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
        return;
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
    });

    canvas.renderAll();
  }, [fabricRef, remoteSelections, localSelectedId]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasElRef} />

      {/* Remote selection name badges - positioned above selected objects */}
      {Array.from(remoteSelections.entries()).map(([odId, selection]) => {
        const canvas = fabricRef.current;
        if (!canvas) return null;

        // Don't show badge on objects the current user has selected
        const activeObject = canvas.getActiveObject();
        const activeObjectId = activeObject ? (activeObject as FabricObject & { id?: string }).id : null;
        if (activeObjectId === selection.objectId) {
          return null;
        }

        // Find the fabric object on the local canvas
        const obj = canvas.getObjects().find(
          (o) => (o as FabricObject & { id?: string }).id === selection.objectId
        );

        if (obj) {
          const vpt = canvas.viewportTransform;
          const zoom = canvas.getZoom();
          if (!vpt) return null;

          // Get bounding rect for accurate top position (accounts for rotation)
          const bounds = obj.getBoundingRect();

          // Get center point for horizontal positioning
          const center = obj.getCenterPoint();
          const screenCenterX = center.x * zoom + vpt[4];

          return (
            <div
              key={odId}
              className="absolute px-2 py-0.5 rounded-full text-[11px] text-white whitespace-nowrap pointer-events-none z-20 font-medium shadow-md"
              style={{
                backgroundColor: selection.color,
                left: screenCenterX,
                top: bounds.top - 24,
                transform: 'translateX(-50%)',
              }}
            >
              {selection.userName}
            </div>
          );
        }

        // Fallback: use synced remoteObjects data if fabric object not found
        const remoteObj = remoteObjects?.get(selection.objectId);
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
        fillColor={fillColor}
        setFillColor={setFillColor}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        fontSize={fontSize}
        setFontSize={setFontSize}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        textColor={textColor}
        setTextColor={setTextColor}
        isStickySelected={isStickySelected}
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
        minWidth: 200,
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
      // Enforce minimum height for square appearance
      const minH = props.height ?? 200;
      if (stickyTb.height < minH) {
        stickyTb.height = minH;
        stickyTb.setCoords();
      }
      return stickyTb;
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
  const posChanged = fabricObj.left !== props.left || fabricObj.top !== props.top;
  if (posChanged && fabricObj.canvas) {
    fabricObj.animate(
      { left: props.left, top: props.top },
      {
        duration: 120,
        onChange: () => fabricObj.canvas?.requestRenderAll(),
        onComplete: () => fabricObj.setCoords(),
      }
    );
  } else {
    fabricObj.set({ left: props.left, top: props.top });
  }

  fabricObj.set({
    angle: props.angle ?? 0,
    scaleX: props.scaleX ?? 1,
    scaleY: props.scaleY ?? 1,
  });

  // Update fill/stroke for shapes that have them
  if (obj.type !== 'line' && obj.type !== 'sticky') {
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
  // Sticky notes: no stroke (it outlines text characters in Fabric.js)

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
      fontSize: props.fontSize,
      fontFamily: props.fontFamily,
      fill: props.textColor || '#000000',
      backgroundColor: props.fill || '#FEF3C7',
    });
    // Enforce minimum height for square appearance
    const minH = props.height ?? 200;
    if (tb.height < minH) tb.height = minH;
    // Only update text if changed (prevents interrupting active editing)
    if (props.text !== undefined && tb.text !== props.text) {
      tb.set({ text: props.text });
    }
  }

  fabricObj.setCoords();
}

// Helper to get object type from Fabric object
function getObjectType(obj: FabricObject): ShapeType {
  if (obj instanceof Textbox) return 'sticky';
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

  // Normalize origin to top-left for consistent coordinates
  const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
  let left = obj.left ?? 0;
  let top = obj.top ?? 0;

  if (obj.originX === 'right') left -= width;
  else if (obj.originX === 'center') left -= width / 2;

  if (obj.originY === 'bottom') top -= height;
  else if (obj.originY === 'center') top -= height / 2;

  const props: CanvasObjectProps = {
    left: Math.round(left),
    top: Math.round(top),
    fill: obj.fill as string,
    stroke: highlightOriginal ? (highlightOriginal.stroke as string) : (obj.stroke as string),
    strokeWidth: highlightOriginal ? highlightOriginal.strokeWidth : obj.strokeWidth,
    angle: obj.angle,
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
    props.width = obj.width;
    props.height = obj.height;
    props.text = obj.text || '';
    props.fontSize = obj.fontSize;
    props.fontFamily = obj.fontFamily;
    props.textColor = obj.fill as string;
    props.fill = (obj as Textbox).backgroundColor as string;
  }

  return props;
}
