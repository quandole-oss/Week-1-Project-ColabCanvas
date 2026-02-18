import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, FabricObject, Line, Point, Textbox } from 'fabric';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import type { Tool, CanvasObjectProps, ShapeType } from '../types';
import { getTopLeftPosition } from '../utils/canvasPosition';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

interface UseCanvasOptions {
  onObjectCreated?: (id: string, type: ShapeType, props: CanvasObjectProps) => void;
  onObjectModified?: (id: string, props: CanvasObjectProps) => void;
  onObjectDeleted?: (id: string) => void;
}

export function useCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseCanvasOptions = {}
) {
  const fabricRef = useRef<Canvas | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [fillColor, setFillColor] = useState('#3B82F6');
  const [strokeColor, setStrokeColor] = useState('#1E40AF');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [textColor, setTextColor] = useState('#000000');
  const [zoomLevel, setZoomLevel] = useState(100);
  const isPanning = useRef(false);
  const lastPosX = useRef(0);
  const lastPosY = useRef(0);
  const isSpacePressed = useRef(false);
  // Refs to keep handlers stable (avoids constant re-registration)
  const toolRef = useRef<Tool>(tool);
  const optionsRef = useRef(options);
  toolRef.current = tool;
  optionsRef.current = options;

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#f0f4f8',
      selection: true,
    });

    fabricRef.current = canvas;

    // Set up virtual canvas size
    canvas.setDimensions(
      { width: window.innerWidth, height: window.innerHeight },
      { backstoreOnly: false }
    );

    // Draw initial grid (deferred to ensure canvas is fully initialized)
    requestAnimationFrame(() => {
      updateGrid(canvas);
      canvas.renderAll();
    });

    // Handle window resize
    const handleResize = () => {
      canvas.setDimensions(
        { width: window.innerWidth, height: window.innerHeight },
        { backstoreOnly: false }
      );
      updateGrid(canvas);
      canvas.renderAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
    };
  }, [canvasRef]);

  // Set up event handlers
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Keyboard handlers for spacebar panning
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable;

      if (e.code === 'Space' && !isSpacePressed.current && !isTyping) {
        isSpacePressed.current = true;
        canvas.defaultCursor = 'grab';
        canvas.selection = false;
      }
      // Note: Delete key handling is done in Canvas.tsx to support undo history
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        canvas.defaultCursor = 'default';
        canvas.selection = true;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Mouse handlers for panning
    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      if (!e.clientX) return; // Touch event

      // Pan with spacebar + left click, middle mouse, or when pan tool is active
      const currentTool = toolRef.current;
      const isPanToolActive = currentTool === 'pan' && e.button === 0;
      const isSpacePan = isSpacePressed.current && e.button === 0;
      if (isSpacePan || e.button === 1 || isPanToolActive) {
        isPanning.current = true;
        canvas.defaultCursor = 'grabbing';
        lastPosX.current = e.clientX;
        lastPosY.current = e.clientY;
      }
    };

    const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      if (isPanning.current) {
        const e = opt.e as MouseEvent;
        if (!e.clientX) return; // Touch event
        const vpt = canvas.viewportTransform;
        if (!vpt) return;

        vpt[4] += e.clientX - lastPosX.current;
        vpt[5] += e.clientY - lastPosY.current;

        updateGrid(canvas);
        canvas.renderAll();
        lastPosX.current = e.clientX;
        lastPosY.current = e.clientY;
      }
    };

    const handleMouseUp = () => {
      isPanning.current = false;
      if (isSpacePressed.current || toolRef.current === 'pan') {
        canvas.defaultCursor = 'grab';
      } else {
        canvas.defaultCursor = 'default';
      }
    };

    // Zoom with mouse wheel
    const handleWheel = (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();

      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(MIN_ZOOM, zoom), MAX_ZOOM);

      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      updateGrid(canvas);
      setZoomLevel(Math.round(zoom * 100));
    };

    // Object modification handler (fires when drag/transform completes)
    const handleObjectModified = (opt: { target: FabricObject }) => {
      const obj = opt.target;

      const id = (obj as FabricObject & { id?: string }).id;
      if (id && optionsRef.current.onObjectModified) {
        // Normalize origin to left/top (Fabric changes origin during scale operations)
        const topLeft = getTopLeftPosition(obj);

        // Flatten scale into actual dimensions for consistent sync
        const actualWidth = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
        let actualHeight = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));
        // For sticky notes, use stored height (Fabric auto-recalculates Textbox height)
        if (obj instanceof Textbox) {
          const customType = (obj as FabricObject & { customType?: string }).customType;
          if (customType === 'sticky') {
            const storedH = (obj as any)._stickyHeight ?? 200;
            const wasResized = (obj.scaleY ?? 1) !== 1;
            actualHeight = wasResized
              ? Math.round(storedH * (obj.scaleY ?? 1))
              : storedH;
            (obj as any)._stickyHeight = actualHeight;
            // Update minWidth so Fabric won't re-expand the sticky
            (obj as any).minWidth = Math.max(actualWidth, 40);
          }
        }
        const rawRadius = (obj as unknown as { radius?: number }).radius;
        const actualRadius = rawRadius !== undefined
          ? Math.round(rawRadius * (obj.scaleX ?? 1))
          : undefined;

        // Update fabric object to normalized state
        if (actualRadius !== undefined) {
          (obj as unknown as { radius: number }).radius = actualRadius;
        }
        obj.set({
          left: topLeft.left,
          top: topLeft.top,
          originX: 'left',
          originY: 'top',
          width: actualWidth,
          height: actualHeight,
          scaleX: 1,
          scaleY: 1,
        });
        // Defer setCoords + render to next frame so Fabric's internal cache
        // is cleared after the browser has processed the layout change
        requestAnimationFrame(() => {
          obj.setCoords();
          canvas.requestRenderAll();
        });

        const isSticky = obj instanceof Textbox;
        const props: CanvasObjectProps = {
          left: topLeft.left,
          top: topLeft.top,
          width: actualWidth,
          height: actualHeight,
          ...(actualRadius !== undefined ? { radius: actualRadius } : {}),
          fill: isSticky ? (obj as Textbox).backgroundColor as string : obj.fill as string,
          stroke: obj.stroke as string,
          strokeWidth: obj.strokeWidth ?? 2,
          angle: obj.angle ?? 0,
          scaleX: 1,
          scaleY: 1,
          ...(isSticky ? {
            textColor: obj.fill as string,
            text: (obj as Textbox).text || '',
            fontSize: (obj as Textbox).fontSize,
            fontFamily: (obj as Textbox).fontFamily,
          } : {}),
        };
        optionsRef.current.onObjectModified(id, props);
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('mouse:wheel', handleWheel);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('mouse:wheel', handleWheel);
      canvas.off('object:modified', handleObjectModified);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get canvas center in world coordinates
  const getCanvasCenter = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const vpt = canvas.viewportTransform;
    if (!vpt) return { x: 0, y: 0 };

    const zoom = canvas.getZoom();
    const centerX = (canvas.width! / 2 - vpt[4]) / zoom;
    const centerY = (canvas.height! / 2 - vpt[5]) / zoom;

    return { x: centerX, y: centerY };
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = new Point(canvas.width! / 2, canvas.height! / 2);
    let zoom = canvas.getZoom() * 1.2;
    zoom = Math.min(MAX_ZOOM, zoom);
    canvas.zoomToPoint(center, zoom);
    updateGrid(canvas);
    setZoomLevel(Math.round(zoom * 100));
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = new Point(canvas.width! / 2, canvas.height! / 2);
    let zoom = canvas.getZoom() / 1.2;
    zoom = Math.max(MIN_ZOOM, zoom);
    canvas.zoomToPoint(center, zoom);
    updateGrid(canvas);
    setZoomLevel(Math.round(zoom * 100));
  }, []);

  const resetZoom = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    updateGrid(canvas);
    setZoomLevel(100);
  }, []);

  return {
    canvas: fabricRef.current,
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
  };
}

// Grid lines stored for efficient removal
let gridLines: Line[] = [];

/** Re-send all grid lines to the back of the canvas stack. Call after z-index reorders. */
export function sendGridToBack(canvas: Canvas) {
  for (const line of gridLines) {
    canvas.sendObjectToBack(line);
  }
}
let lastGridUpdate = 0;

// Draw grid lines only within the visible viewport (+ 1 line padding)
function updateGrid(canvas: Canvas) {
  const now = Date.now();
  if (now - lastGridUpdate < 16) return; // throttle ~60fps
  lastGridUpdate = now;

  const gridSize = 50;
  const gridColor = '#d1d5db';

  // Remove old grid lines
  for (const line of gridLines) {
    canvas.remove(line);
  }
  gridLines = [];

  const vpt = canvas.viewportTransform;
  if (!vpt) return;
  const zoom = canvas.getZoom();
  const w = canvas.width!;
  const h = canvas.height!;

  // Visible area in world coordinates
  const left = -vpt[4] / zoom;
  const top = -vpt[5] / zoom;
  const right = left + w / zoom;
  const bottom = top + h / zoom;

  // Snap to grid with 1-line padding
  const startX = Math.floor(left / gridSize) * gridSize - gridSize;
  const endX = Math.ceil(right / gridSize) * gridSize + gridSize;
  const startY = Math.floor(top / gridSize) * gridSize - gridSize;
  const endY = Math.ceil(bottom / gridSize) * gridSize + gridSize;

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    const line = new Line([x, startY, x, endY], {
      stroke: gridColor,
      selectable: false,
      evented: false,
    });
    gridLines.push(line);
    canvas.add(line);
    canvas.sendObjectToBack(line);
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    const line = new Line([startX, y, endX, y], {
      stroke: gridColor,
      selectable: false,
      evented: false,
    });
    gridLines.push(line);
    canvas.add(line);
    canvas.sendObjectToBack(line);
  }
}
