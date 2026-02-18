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

        if (isGeminiConfigured()) {
          try {
            // Use cloud AI for intelligent command processing
            result = await processGeminiCommand(
              command,
              canvasObjects,
              createObject,
              updateObject,
              deleteObject,
              viewportCenter,
              reorderObject
            );
          } catch {
            // Cloud AI failed — fall back to local regex parser
            console.warn('[AI] Cloud AI unavailable, using local parser');
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
        } else {
          // Fall back to local regex parser (no API key needed)
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
    [canvasObjects, createObject, updateObject, deleteObject, clearAllObjects, getViewportCenter, startHistoryBatch, endHistoryBatch, reorderObject]
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

// Local command processing for demo without API key
function processLocalCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  clearAllObjects?: () => number,
  getViewportCenter?: () => { x: number; y: number }
): string {
  const lowerCommand = command.toLowerCase();
  const results: string[] = [];

  // Get viewport center for positioning
  const viewportCenter = getViewportCenter?.() || { x: 400, y: 300 };

  // Parse grid creation first (more specific)
  if (lowerCommand.includes('grid')) {
    const gridMatch = command.match(/(\d+)\s*[xX×]\s*(\d+)/);
    const rows = gridMatch ? parseInt(gridMatch[1]) : 3;
    const cols = gridMatch ? parseInt(gridMatch[2]) : 3;
    const color = parseColor(command) || '#3B82F6';
    const { width, height } = parseSize(command);
    const cellSize = Math.min(width, height, 60);
    const spacing = 20;

    // Calculate grid start position to center it on viewport
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

  // Parse arrange/align commands
  if (lowerCommand.includes('arrange') || lowerCommand.includes('align') || lowerCommand.includes('line up')) {
    const objectIds = Array.from(canvasObjects.keys());
    if (objectIds.length === 0) {
      return 'No objects to arrange. Create some objects first.';
    }

    const layout = (lowerCommand.includes('row') || lowerCommand.includes('horizontal'))
      ? 'row'
      : (lowerCommand.includes('column') || lowerCommand.includes('vertical'))
      ? 'column'
      : (lowerCommand.includes('grid'))
      ? 'grid'
      : 'row';

    const action: AIAction = {
      type: 'arrangeObjects',
      params: { objectIds, layout, spacing: 20, startX: 100, startY: 100 },
    };
    const result = executeAIAction(action, canvasObjects, createObject, updateObject, deleteObject);
    return result.message;
  }

  // Parse delete/clear commands
  if (lowerCommand.includes('delete all') || lowerCommand.includes('clear all') || lowerCommand.includes('remove all') || lowerCommand.includes('clear canvas') || lowerCommand.includes('clear everything')) {
    // Use clearAllObjects if available (more reliable)
    if (clearAllObjects) {
      const count = clearAllObjects();
      return count > 0 ? `Deleted ${count} objects` : 'No objects to delete.';
    }
    // Fallback to deleting from canvasObjects map
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
    // Extract quoted text: "saying 'Hello'" or 'with text "Hello"'
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
    // Also match "red rectangle", "blue circle" without create verb
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

      // Create multiple shapes if count > 1
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
      }

      if (results.length > 0) {
        return count > 1 ? `Created ${count} ${shapeType}s` : results[0];
      }
    }
  }

  // If we got here, we didn't understand the command
  return `I'll try to help! Here are some things I can do:
• "Create a red rectangle" or "blue circle"
• "Make 3 green triangles"
• "Create a yellow star" or "purple hexagon"
• "Create a sticky note" or "Create a note saying 'Hello'"
• "Create a textbox" or "Create a text box saying 'Hello'"
• "Create a 3x3 grid"
• "Create a large circle at center"
• "Create a small blue rectangle at top left"
• "Create a login form"
• "Create a navigation bar"
• "Arrange objects in a row"
• "Delete all objects"`;
}
