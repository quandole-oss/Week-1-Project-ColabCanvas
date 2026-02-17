import { useState, useRef, useEffect } from 'react';
import type { Tool } from '../../types';

interface CanvasToolbarProps {
  tool: Tool;
  setTool: (tool: Tool) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: string;
  setFontFamily: (family: string) => void;
  textColor: string;
  setTextColor: (color: string) => void;
  isStickySelected: boolean;
  isTextboxSelected: boolean;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
}

const basicTools: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: '↖', label: 'Select' },
  { id: 'pan', icon: '✋', label: 'Hand' },
];

const shapes: { id: Tool; icon: string; label: string }[] = [
  { id: 'rect', icon: '▢', label: 'Rectangle' },
  { id: 'circle', icon: '○', label: 'Circle' },
  { id: 'triangle', icon: '△', label: 'Triangle' },
  { id: 'hexagon', icon: '⬡', label: 'Hexagon' },
  { id: 'star', icon: '☆', label: 'Star' },
  { id: 'line', icon: '╱', label: 'Line' },
];

const otherTools: { id: Tool; icon: string; label: string }[] = [
  { id: 'eraser', icon: '🧽', label: 'Eraser' },
];

const FONT_FAMILIES = [
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times' },
  { value: 'Verdana', label: 'Verdana' },
];

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export function CanvasToolbar({
  tool,
  setTool,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
  textColor,
  setTextColor,
  isStickySelected,
  isTextboxSelected,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
}: CanvasToolbarProps) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<Tool>('rect');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShapesOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if current tool is a shape
  const isShapeTool = shapes.some(s => s.id === tool);
  const currentShapeIcon = shapes.find(s => s.id === selectedShape)?.icon || '▢';

  const handleShapeSelect = (shapeId: Tool) => {
    setSelectedShape(shapeId);
    setTool(shapeId);
    setShapesOpen(false);
  };

  // Show font controls when sticky/textbox tool is active or a text element is selected
  const showFontControls = tool === 'sticky' || tool === 'textbox' || isStickySelected || isTextboxSelected;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50">
      {/* Tool buttons */}
      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-1 flex items-center gap-0.5 shadow-lg border border-white/20">
        {/* Basic tools */}
        {basicTools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition ${
              tool === t.id
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white/50 text-gray-700 hover:bg-white/80'
            }`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}

        {/* Shapes dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShapesOpen(!shapesOpen)}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition relative ${
              isShapeTool
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white/50 text-gray-700 hover:bg-white/80'
            }`}
            title="Shapes"
          >
            {currentShapeIcon}
            <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none">▾</span>
          </button>

          {/* Dropdown menu */}
          {shapesOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white/90 backdrop-blur-md rounded-lg p-1 shadow-lg border border-white/30 flex flex-col gap-0.5 min-w-[120px]">
              {shapes.map((shape) => (
                <button
                  key={shape.id}
                  onClick={() => handleShapeSelect(shape.id)}
                  className={`w-full px-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition ${
                    selectedShape === shape.id
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">{shape.icon}</span>
                  <span>{shape.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Note - standalone button */}
        <button
          onClick={() => setTool('sticky')}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition ${
            tool === 'sticky'
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white/50 text-gray-700 hover:bg-white/80'
          }`}
          title="Sticky Note"
        >
          🗒
        </button>

        {/* Textbox - standalone button */}
        <button
          onClick={() => setTool('textbox')}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-base font-bold transition ${
            tool === 'textbox'
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white/50 text-gray-700 hover:bg-white/80'
          }`}
          title="Text Box"
        >
          T
        </button>

        {/* Other tools */}
        {otherTools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition ${
              tool === t.id
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white/50 text-gray-700 hover:bg-white/80'
            }`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Font controls - visible when sticky tool active or sticky selected */}
      {showFontControls && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <div className="bg-white/50 backdrop-blur-sm rounded-lg p-1.5 shadow-lg border border-white/20 flex items-center gap-2">
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="h-6 rounded border border-gray-300 bg-white text-[11px] text-gray-700 px-1 cursor-pointer shadow-sm"
              title="Font family"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="h-6 w-14 rounded border border-gray-300 bg-white text-[11px] text-gray-700 px-1 cursor-pointer shadow-sm"
              title="Font size"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-gray-300 shadow-sm"
                title="Text color"
              />
              <span className="text-[10px] text-gray-500 font-medium">Text</span>
            </div>
          </div>
        </>
      )}

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300" />

      {/* Undo/Redo */}
      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-1 flex items-center gap-0.5 shadow-lg border border-white/20">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition ${
            canUndo
              ? 'bg-white/50 text-gray-700 hover:bg-white/80'
              : 'bg-white/20 text-gray-400 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-base transition ${
            canRedo
              ? 'bg-white/50 text-gray-700 hover:bg-white/80'
              : 'bg-white/20 text-gray-400 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300" />

      {/* Zoom controls */}
      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-1 flex items-center gap-0.5 shadow-lg border border-white/20">
        <button
          onClick={onZoomOut}
          className="w-8 h-8 rounded-md bg-white/50 text-gray-700 hover:bg-white/80 flex items-center justify-center text-base transition"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={onResetZoom}
          className="w-10 h-8 rounded-md bg-white/50 text-gray-700 hover:bg-white/80 flex items-center justify-center text-[11px] transition"
          title="Reset Zoom"
        >
          {zoomLevel}%
        </button>
        <button
          onClick={onZoomIn}
          className="w-8 h-8 rounded-md bg-white/50 text-gray-700 hover:bg-white/80 flex items-center justify-center text-base transition"
          title="Zoom In"
        >
          +
        </button>
      </div>

      {/* Help text */}
      <div className="bg-white/50 backdrop-blur-sm rounded-lg px-2 py-1.5 text-[10px] text-gray-500 shadow-lg border border-white/20 flex items-center gap-3">
        <span>Space+drag: pan</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  );
}
