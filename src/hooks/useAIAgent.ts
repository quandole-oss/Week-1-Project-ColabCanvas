import { useState, useCallback } from 'react';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { executeAIAction } from '../services/aiService';
import type { AIAction } from '../services/aiService';
import { isGeminiConfigured, processGeminiCommand } from '../services/geminiService';
import type { ZIndexAction } from '../utils/zIndex';

interface UseAIAgentOptions {
  canvasObjects: Map<string, CanvasObject>;
  createObject: (type: ShapeType, props: CanvasObjectProps) => string;
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void;
  deleteObject: (id: string) => void;
  clearAllObjects?: () => number; // Returns count of deleted objects
  getViewportCenter?: () => { x: number; y: number };
  startHistoryBatch?: () => void;
  endHistoryBatch?: () => void;
  reorderObject?: (id: string, action: ZIndexAction) => void;
  getSelectedObjectIds?: () => string[];
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useAIAgent({
  canvasObjects,
  createObject,
  updateObject,
  deleteObject,
  clearAllObjects,
  getViewportCenter,
  startHistoryBatch,
  endHistoryBatch,
  reorderObject,
  getSelectedObjectIds,
}: UseAIAgentOptions) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processCommand = useCallback(
    async (command: string) => {
      console.log('[AI] Processing command:', command);
      setIsProcessing(true);
      setError(null);

      // Add user message
      setMessages((prev) => [...prev, { role: 'user', content: command }]);

      try {
        // Start batching so multiple objects created by AI undo together
        startHistoryBatch?.();

        const viewportCenter = getViewportCenter?.() || { x: 400, y: 300 };
        let result: string;

        // Try local parser first for instant response on commands it can handle
        const selectedIds = getSelectedObjectIds?.() ?? [];
        const localResult = tryLocalCommand(
          command,
          canvasObjects,
          createObject,
          updateObject,
          deleteObject,
          clearAllObjects,
          getViewportCenter,
          selectedIds
        );

        if (localResult !== null) {
          result = localResult;
        } else if (isGeminiConfigured()) {
          try {
            const selectedIds = getSelectedObjectIds?.() ?? [];
            result = await processGeminiCommand(
              command,
              canvasObjects,
              createObject,
              updateObject,
              deleteObject,
              viewportCenter,
              reorderObject,
              selectedIds
            );
          } catch (cloudErr) {
            const errMsg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
            console.error('[AI] Cloud AI error:', errMsg);
            throw new Error(
              errMsg.includes('timed out')
                ? 'AI is taking longer than expected. Please try again in a moment.'
                : `AI request failed: ${errMsg}`
            );
          }
        } else {
          result = processLocalCommand(
            command,
            canvasObjects,
            createObject,
            updateObject,
            deleteObject,
            clearAllObjects,
            getViewportCenter
          );
        }

        // End batching - commits all entries as single undo action
        endHistoryBatch?.();

        console.log('[AI] Processing result:', result);
        setMessages((prev) => [...prev, { role: 'assistant', content: result }]);
      } catch (err) {
        // End batching even on error
        endHistoryBatch?.();
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
      } finally {
        setIsProcessing(false);
      }
    },
    [canvasObjects, createObject, updateObject, deleteObject, clearAllObjects, getViewportCenter, startHistoryBatch, endHistoryBatch, reorderObject, getSelectedObjectIds]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isProcessing,
    error,
    processCommand,
    clearMessages,
  };
}

// Color name to hex mapping
const COLOR_MAP: Record<string, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#10B981',
  yellow: '#F59E0B',
  purple: '#8B5CF6',
  orange: '#F97316',
  pink: '#EC4899',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#6B7280',
  grey: '#6B7280',
  cyan: '#06B6D4',
  teal: '#14B8A6',
  indigo: '#6366F1',
  lime: '#84CC16',
  amber: '#F59E0B',
  rose: '#F43F5E',
  sky: '#0EA5E9',
  violet: '#8B5CF6',
  fuchsia: '#D946EF',
  emerald: '#10B981',
  slate: '#64748B',
  navy: '#1E3A5F',
  maroon: '#800000',
  olive: '#808000',
  aqua: '#00FFFF',
  coral: '#FF7F50',
  salmon: '#FA8072',
  gold: '#FFD700',
  silver: '#C0C0C0',
  brown: '#A52A2A',
  tan: '#D2B48C',
  beige: '#F5F5DC',
  magenta: '#FF00FF',
  turquoise: '#40E0D0',
};

// Parse color from command
function parseColor(command: string): string | null {
  const lowerCommand = command.toLowerCase();

  // Check for hex color
  const hexMatch = command.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}/);
  if (hexMatch) return hexMatch[0];

  // Check for color names
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (lowerCommand.includes(name)) return hex;
  }

  return null;
}

// Parse position from command
function parsePosition(command: string, defaultCenter?: { x: number; y: number }): { x: number; y: number } {
  const lowerCommand = command.toLowerCase();
  const center = defaultCenter || { x: 400, y: 300 };

  // Check for explicit coordinates: "at 200, 300" or "at 200 300" or "position 200,300"
  const coordMatch = command.match(/(?:at|position|pos)\s*[:\s]*(\d+)\s*[,\s]\s*(\d+)/i);
  if (coordMatch) {
    return { x: parseInt(coordMatch[1]), y: parseInt(coordMatch[2]) };
  }

  // Check for named positions (relative to viewport center)
  if (lowerCommand.includes('center') || lowerCommand.includes('middle')) {
    return center;
  }
  if (lowerCommand.includes('top left') || lowerCommand.includes('top-left')) {
    return { x: center.x - 200, y: center.y - 200 };
  }
  if (lowerCommand.includes('top right') || lowerCommand.includes('top-right')) {
    return { x: center.x + 200, y: center.y - 200 };
  }
  if (lowerCommand.includes('bottom left') || lowerCommand.includes('bottom-left')) {
    return { x: center.x - 200, y: center.y + 200 };
  }
  if (lowerCommand.includes('bottom right') || lowerCommand.includes('bottom-right')) {
    return { x: center.x + 200, y: center.y + 200 };
  }
  if (lowerCommand.includes('top')) {
    return { x: center.x, y: center.y - 200 };
  }
  if (lowerCommand.includes('bottom')) {
    return { x: center.x, y: center.y + 200 };
  }
  if (lowerCommand.includes('left')) {
    return { x: center.x - 200, y: center.y };
  }
  if (lowerCommand.includes('right')) {
    return { x: center.x + 200, y: center.y };
  }

  // Default to current viewport center
  return center;
}

// Parse size from command
function parseSize(command: string): { width: number; height: number } {
  const lowerCommand = command.toLowerCase();

  // Check for explicit size: "100x200" or "100 by 200" or "size 100x200"
  const sizeMatch = command.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (sizeMatch) {
    return { width: parseInt(sizeMatch[1]), height: parseInt(sizeMatch[2]) };
  }

  const byMatch = command.match(/(\d+)\s*by\s*(\d+)/i);
  if (byMatch) {
    return { width: parseInt(byMatch[1]), height: parseInt(byMatch[2]) };
  }

  // Check for size keywords
  if (lowerCommand.includes('tiny') || lowerCommand.includes('very small')) {
    return { width: 30, height: 30 };
  }
  if (lowerCommand.includes('small')) {
    return { width: 50, height: 50 };
  }
  if (lowerCommand.includes('large') || lowerCommand.includes('big')) {
    return { width: 200, height: 200 };
  }
  if (lowerCommand.includes('huge') || lowerCommand.includes('very large')) {
    return { width: 300, height: 300 };
  }
  if (lowerCommand.includes('medium')) {
    return { width: 100, height: 100 };
  }

  // Default size
  return { width: 100, height: 100 };
}

// Parse count from command
function parseCount(command: string): number {
  const lowerCommand = command.toLowerCase();

  // Check for numbers followed by optional words then shape name
  // Matches: "3 circles", "3 green circles", "5 small blue rectangles"
  const numMatch = command.match(/(\d+)\s+(?:\w+\s+)*(?:rectangles?|rects?|circles?|squares?|shapes?|objects?|boxes?|ovals?|dots?|lines?|triangles?|hexagons?|stars?)/i);
  if (numMatch) return parseInt(numMatch[1]);

  // Check for word numbers followed by optional words then shape name
  const wordNumbers: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };

  for (const [word, num] of Object.entries(wordNumbers)) {
    // Match "three green circles", "two small rectangles", etc.
    const wordPattern = new RegExp(`${word}\\s+(?:\\w+\\s+)*(?:rectangles?|rects?|circles?|squares?|shapes?|objects?|boxes?|ovals?|dots?|lines?|triangles?|hexagons?|stars?)`, 'i');
    if (wordPattern.test(lowerCommand)) return num;
  }

  return 1;
}

// Returns true if the local parser can confidently handle this command
function canHandleLocally(command: string): boolean {
  const lc = command.toLowerCase();

  // Templates
  if (/swot/i.test(lc)) return true;
  if (lc.includes('login') && /form|page|screen/.test(lc)) return true;
  if (/\bnav\b|menu bar|header/.test(lc)) return true;

  // Arrange / layout
  if (/arrange|align|line up/.test(lc) && !/and\s+(create|make|add|draw)/.test(lc)) return true;

  // Rotate / resize (works on selected or recently created objects)
  if (/\brotate\b/.test(lc)) return true;
  if (/\bresize\b|\bscale\b/.test(lc)) return true;

  // Delete / clear
  if (/delete all|clear all|remove all|clear canvas|clear everything/.test(lc)) return true;

  // Grid creation
  if (lc.includes('grid') && !/(arrange|align)/.test(lc)) return true;

  // Textbox / sticky
  if (/textbox|text\s*box|text\s*field/.test(lc)) return true;
  if (/sticky|(?<!\w)note(?!\w)/.test(lc)) return true;

  // Basic shape creation (not complex compositions like "dog", "house")
  const hasCompositionNoun = /\b(dog|cat|horse|bird|fish|animal|person|human|man|woman|boy|girl|people|house|building|castle|car|truck|bus|robot|flower|tree|garden|park|town|village|farm|zoo|scene|composition|landscape|smiley|face|snowman)(?:e?s)?\b/i;
  if (hasCompositionNoun.test(lc)) return false;

  if (/\b(rect|rectangle|square|box|circle|oval|dot|triangle|hexagon|star|line)s?\b/i.test(lc)) return true;

  return false;
}

// Shared context passed between multi-step sub-commands so later steps
// can reference objects created by earlier steps.
interface StepContext {
  lastCreatedIds: string[];
  pendingAngle?: number;
  pendingScale?: number;
}

// Try local command — returns null if the command needs cloud AI
function tryLocalCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  clearAllObjects?: () => number,
  getViewportCenter?: () => { x: number; y: number },
  selectedIds?: string[]
): string | null {
  // Multi-step: split on "and then", "then", semicolons, or "and" before an action verb
  const ACTION_VERBS = '(?:create|make|add|draw|place|rotate|resize|scale|arrange|align|delete|clear|remove|move)';
  const splitRe = new RegExp(
    `\\s*(?:;\\s*|,?\\s+and then\\s+|,?\\s+then\\s+|\\s+and\\s+(?=${ACTION_VERBS}\\b))`,
    'i'
  );
  const steps = command.split(splitRe).filter(Boolean);
  if (steps.length > 1) {
    const allLocal = steps.every(s => canHandleLocally(s));
    if (!allLocal) return null;
    const ctx: StepContext = { lastCreatedIds: [] };
    const results: string[] = [];
    for (const step of steps) {
      const r = processLocalCommand(step, canvasObjects, createObject, updateObject, deleteObject, clearAllObjects, getViewportCenter, ctx, selectedIds);
      results.push(r);
    }
    // Apply deferred transforms — updateObject can't work here because React
    // state hasn't re-rendered. Instead, directly update each created object's
    // props via updateObject which synchronously writes to objectsRef.
    if (ctx.lastCreatedIds.length && (ctx.pendingAngle !== undefined || ctx.pendingScale !== undefined)) {
      for (const id of ctx.lastCreatedIds) {
        const updates: Partial<CanvasObjectProps> = {};
        if (ctx.pendingAngle !== undefined) updates.angle = ctx.pendingAngle;
        if (ctx.pendingScale !== undefined) { updates.scaleX = ctx.pendingScale; updates.scaleY = ctx.pendingScale; }
        updateObject(id, updates);
      }
    }
    return results.join('\n');
  }

  if (!canHandleLocally(command)) return null;
  return processLocalCommand(command, canvasObjects, createObject, updateObject, deleteObject, clearAllObjects, getViewportCenter, undefined, selectedIds);
}

// Local command processing — handles templates & simple shapes instantly
function processLocalCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  clearAllObjects?: () => number,
  getViewportCenter?: () => { x: number; y: number },
  ctx?: StepContext,
  selectedIds?: string[]
): string {
  const lowerCommand = command.toLowerCase();
  const results: string[] = [];

  const viewportCenter = getViewportCenter?.() || { x: 400, y: 300 };

  // Rotate command
  if (/\brotate\b/.test(lowerCommand)) {
    const degMatch = lowerCommand.match(/rotate\s+(?:(?:them|it|those|the[ms]e?|the\s+select\w*)\s+)?(?:by\s+)?(\d+)\s*(?:deg|°|degrees?)?/i);
    const degrees = degMatch ? parseInt(degMatch[1]) : 90;
    const mentionsSelection = /\bselect\w*\b/i.test(lowerCommand);
    const fromCtx = !!(ctx?.lastCreatedIds?.length);

    // Priority: 1) context from previous step, 2) user's selection, 3) all objects
    let targets: string[];
    if (fromCtx) {
      // Multi-step: don't call updateObject (React state not ready).
      // Instead, stash the angle so shape creation can apply it at creation time.
      ctx!.pendingAngle = degrees;
      return `Rotated ${ctx!.lastCreatedIds.length} object${ctx!.lastCreatedIds.length === 1 ? '' : 's'} to ${degrees} degrees`;
    } else if (mentionsSelection && selectedIds?.length) {
      targets = selectedIds;
    } else if (selectedIds?.length && !mentionsSelection) {
      targets = Array.from(canvasObjects.keys());
    } else {
      targets = selectedIds?.length ? selectedIds : Array.from(canvasObjects.keys());
    }

    if (targets.length === 0) return 'No objects to rotate.';
    let rotated = 0;
    for (const id of targets) {
      if (!canvasObjects.has(id)) continue;
      updateObject(id, { angle: degrees });
      rotated++;
    }
    return `Rotated ${rotated} object${rotated === 1 ? '' : 's'} to ${degrees} degrees`;
  }

  // Resize / scale command
  if (/\bresize\b|\bscale\b/.test(lowerCommand)) {
    const factorMatch = lowerCommand.match(/(?:resize|scale)\s+(?:(?:them|it|those|the[ms]e?|the\s+select\w*)\s+)?(?:by\s+)?(\d+(?:\.\d+)?)\s*x?\b/i);
    const scale = factorMatch ? parseFloat(factorMatch[1]) : 2;
    const mentionsSelection = /\bselect\w*\b/i.test(lowerCommand);

    let targets: string[];
    if (ctx?.lastCreatedIds?.length) {
      ctx!.pendingScale = scale;
      return `Scaled ${ctx!.lastCreatedIds.length} object${ctx!.lastCreatedIds.length === 1 ? '' : 's'} by ${scale}x`;
    } else if (mentionsSelection && selectedIds?.length) {
      targets = selectedIds;
    } else {
      targets = Array.from(canvasObjects.keys());
    }

    if (targets.length === 0) return 'No objects to resize.';
    let resized = 0;
    for (const id of targets) {
      if (!canvasObjects.has(id)) continue;
      updateObject(id, { scaleX: scale, scaleY: scale });
      resized++;
    }
    return `Scaled ${resized} object${resized === 1 ? '' : 's'} by ${scale}x`;
  }

  // SWOT analysis — 4 labeled quadrants
  if (/swot/i.test(lowerCommand)) {
    return createSWOTAnalysis(createObject, viewportCenter);
  }

  // Parse grid creation first (more specific)
  if (lowerCommand.includes('grid') && !/arrange|align/.test(lowerCommand)) {
    const gridMatch = command.match(/(\d+)\s*[xX×]\s*(\d+)/);
    const rows = gridMatch ? parseInt(gridMatch[1]) : 3;
    const cols = gridMatch ? parseInt(gridMatch[2]) : 3;
    const color = parseColor(command) || '#3B82F6';
    const { width, height } = parseSize(command);
    const cellSize = Math.min(width, height, 60);
    const spacing = 20;

    const gridWidth = cols * (cellSize + spacing) - spacing;
    const gridHeight = rows * (cellSize + spacing) - spacing;
    const startX = viewportCenter.x - gridWidth / 2;
    const startY = viewportCenter.y - gridHeight / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        createObject('rect', {
          left: startX + c * (cellSize + spacing),
          top: startY + r * (cellSize + spacing),
          width: cellSize,
          height: cellSize,
          fill: color,
          stroke: '#1E40AF',
          strokeWidth: 2,
        });
      }
    }
    return `Created a ${rows}×${cols} grid of ${color === '#3B82F6' ? 'blue' : 'colored'} squares`;
  }

  // Parse login form
  if (lowerCommand.includes('login') && (lowerCommand.includes('form') || lowerCommand.includes('page') || lowerCommand.includes('screen'))) {
    const pos = parsePosition(command, viewportCenter);
    const action: AIAction = {
      type: 'createLoginForm',
      params: { x: pos.x, y: pos.y },
    };
    const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
    return result.message;
  }

  // Parse navigation bar
  if (lowerCommand.includes('nav') || lowerCommand.includes('menu bar') || lowerCommand.includes('header')) {
    const items = ['Home', 'About', 'Services', 'Contact'];
    const pos = parsePosition(command, viewportCenter);
    const action: AIAction = {
      type: 'createNavigationBar',
      params: { items, x: pos.x, y: pos.y },
    };
    const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
    return result.message;
  }

  // Arrange in a grid / row / column — use actual object dimensions
  if (lowerCommand.includes('arrange') || lowerCommand.includes('align') || lowerCommand.includes('line up')) {
    const objectIds = Array.from(canvasObjects.keys());
    if (objectIds.length === 0) {
      return 'No objects to arrange. Create some objects first.';
    }

    const layout: 'row' | 'column' | 'grid' =
      (lowerCommand.includes('row') || lowerCommand.includes('horizontal')) ? 'row'
      : (lowerCommand.includes('column') || lowerCommand.includes('vertical')) ? 'column'
      : 'grid';

    const spacing = 20;
    const cols = Math.max(2, Math.ceil(Math.sqrt(objectIds.length)));
    let x = viewportCenter.x - 200;
    let y = viewportCenter.y - 200;
    let col = 0;
    let rowMaxH = 0;

    for (const id of objectIds) {
      const obj = canvasObjects.get(id);
      if (!obj) continue;
      const w = obj.props.width ?? 100;
      const h = obj.props.height ?? 100;

      updateObject(id, { left: x, top: y });

      if (layout === 'row') {
        x += w + spacing;
      } else if (layout === 'column') {
        y += h + spacing;
      } else {
        rowMaxH = Math.max(rowMaxH, h);
        col++;
        if (col >= cols) {
          col = 0;
          x = viewportCenter.x - 200;
          y += rowMaxH + spacing;
          rowMaxH = 0;
        } else {
          x += w + spacing;
        }
      }
    }
    return `Arranged ${objectIds.length} objects in a ${layout} layout`;
  }

  // Parse delete/clear commands
  if (lowerCommand.includes('delete all') || lowerCommand.includes('clear all') || lowerCommand.includes('remove all') || lowerCommand.includes('clear canvas') || lowerCommand.includes('clear everything')) {
    if (clearAllObjects) {
      const count = clearAllObjects();
      return count > 0 ? `Deleted ${count} objects` : 'No objects to delete.';
    }
    const objectIds = Array.from(canvasObjects.keys());
    if (objectIds.length === 0) {
      return 'No objects to delete.';
    }
    objectIds.forEach(id => deleteObject(id));
    return `Deleted ${objectIds.length} objects`;
  }

  // Parse textbox creation (check before sticky and general shape patterns)
  if (lowerCommand.includes('textbox') || lowerCommand.includes('text box') || lowerCommand.includes('text field')) {
    const pos = parsePosition(command, viewportCenter);
    const textMatch = command.match(/(?:saying|with text|text|:)\s*['"]([^'"]+)['"]/i);
    const text = textMatch ? textMatch[1] : '';
    const action: AIAction = {
      type: 'createShape',
      params: { type: 'textbox', x: pos.x, y: pos.y, text },
    };
    const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
    return result.message;
  }

  // Parse sticky note creation (check before general shape patterns)
  if (lowerCommand.includes('sticky') || lowerCommand.includes('note')) {
    const pos = parsePosition(command, viewportCenter);
    const textMatch = command.match(/(?:saying|with text|text|:)\s*['"]([^'"]+)['"]/i);
    const text = textMatch ? textMatch[1] : '';
    const action: AIAction = {
      type: 'createShape',
      params: { type: 'sticky', x: pos.x, y: pos.y, text },
    };
    const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
    return result.message;
  }

  // Parse shape creation - more flexible matching
  const shapePatterns = [
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(rectangle|rect|square|box)/i,
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(circle|oval|ellipse|dot)/i,
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(triangle)/i,
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(hexagon)/i,
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(star)/i,
    /(?:create|make|add|draw|place)\s+(?:a\s+)?(?:(\d+)\s+)?(\w+)?\s*(line)/i,
    /(?:a\s+)?(\d+)?\s*(\w+)?\s*(rectangle|rect|square|box|circle|oval|dot|triangle|hexagon|star|line)s?/i,
  ];

  for (const pattern of shapePatterns) {
    const match = lowerCommand.match(pattern);
    if (match) {
      const color = parseColor(command) || '#3B82F6';
      const pos = parsePosition(command, viewportCenter);
      const size = parseSize(command);
      const count = parseCount(command);

      let shapeType: ShapeType;
      const shapeWord = match[3]?.toLowerCase() || '';

      if (shapeWord.includes('circle') || shapeWord.includes('oval') || shapeWord.includes('ellipse') || shapeWord.includes('dot')) {
        shapeType = 'circle';
      } else if (shapeWord.includes('triangle')) {
        shapeType = 'triangle';
      } else if (shapeWord.includes('hexagon')) {
        shapeType = 'hexagon';
      } else if (shapeWord.includes('star')) {
        shapeType = 'star';
      } else if (shapeWord.includes('line')) {
        shapeType = 'line';
      } else {
        shapeType = 'rect';
      }

      const createdIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const offsetX = count > 1 ? i * (size.width + 20) : 0;

        const action: AIAction = {
          type: 'createShape',
          params: {
            type: shapeType,
            x: pos.x + offsetX,
            y: pos.y,
            width: size.width,
            height: size.height,
            radius: Math.min(size.width, size.height) / 2,
            color
          },
        };
        const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
        results.push(result.message);
        if (result.createdIds) createdIds.push(...result.createdIds);
      }

      if (ctx) ctx.lastCreatedIds = createdIds;

      if (results.length > 0) {
        return count > 1 ? `Created ${count} ${shapeType}s` : results[0];
      }
    }
  }

  return `I'll try to help! Here are some things I can do:
• "Create a red rectangle" or "blue circle"
• "Make 3 green triangles"
• "Create a SWOT analysis"
• "Create a sticky note saying 'Hello'"
• "Create a 3x3 grid"
• "Create a login form"
• "Create a navigation bar"
• "Arrange in a grid" or "Arrange in a row"
• "Delete all objects"
• Multi-step: "Create a circle and then arrange in a grid"`;
}

function createSWOTAnalysis(
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  center: { x: number; y: number }
): string {
  const qW = 220;
  const qH = 180;
  const gap = 4;
  const baseX = center.x - qW - gap / 2;
  const baseY = center.y - qH - gap / 2;

  const quadrants: Array<{ label: string; fill: string; col: number; row: number }> = [
    { label: 'Strengths',     fill: '#22C55E', col: 0, row: 0 },
    { label: 'Weaknesses',    fill: '#EF4444', col: 1, row: 0 },
    { label: 'Opportunities', fill: '#3B82F6', col: 0, row: 1 },
    { label: 'Threats',       fill: '#F59E0B', col: 1, row: 1 },
  ];

  for (const q of quadrants) {
    const left = baseX + q.col * (qW + gap);
    const top = baseY + q.row * (qH + gap);

    createObject('rect', {
      left, top, width: qW, height: qH,
      fill: q.fill, stroke: '#1E293B', strokeWidth: 2,
    });

    createObject('textbox', {
      left: left + 10, top: top + 10, width: qW - 20, height: 30,
      fill: '', text: q.label, fontSize: 18, fontFamily: 'sans-serif', textColor: '#FFFFFF',
      stroke: 'transparent', strokeWidth: 0,
    });
  }

  return 'Created SWOT analysis with 4 labeled quadrants (Strengths, Weaknesses, Opportunities, Threats)';
}
