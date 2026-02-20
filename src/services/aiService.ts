import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import type { ZIndexAction } from '../utils/zIndex';

// AI Tool definitions for OpenAI function calling
export const AI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'createShape',
      description: 'Create a shape on the canvas',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rect', 'circle', 'line', 'triangle', 'hexagon', 'star', 'sticky', 'textbox'],
            description: 'The type of shape to create',
          },
          x: {
            type: 'number',
            description: 'X position (left) of the shape',
          },
          y: {
            type: 'number',
            description: 'Y position (top) of the shape',
          },
          width: {
            type: 'number',
            description: 'Width of the shape (for rectangles)',
          },
          height: {
            type: 'number',
            description: 'Height of the shape (for rectangles)',
          },
          radius: {
            type: 'number',
            description: 'Radius of the shape (for circles)',
          },
          color: {
            type: 'string',
            description: 'Fill color of the shape (hex code like #FF0000)',
          },
          stroke: {
            type: 'string',
            description: 'Stroke/border color (hex code like #FF0000, or "none" for no border)',
          },
          strokeWidth: {
            type: 'number',
            description: 'Stroke width in pixels (default 2, use 0 for no border)',
          },
          text: {
            type: 'string',
            description: 'Text content for sticky notes',
          },
        },
        required: ['type', 'x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'moveObject',
      description: 'Move an object to a new position',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to move',
          },
          x: {
            type: 'number',
            description: 'New X position',
          },
          y: {
            type: 'number',
            description: 'New Y position',
          },
        },
        required: ['objectId', 'x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resizeObject',
      description: 'Resize an object',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to resize',
          },
          width: {
            type: 'number',
            description: 'New width',
          },
          height: {
            type: 'number',
            description: 'New height',
          },
          scale: {
            type: 'number',
            description: 'Scale factor (e.g., 2 for double size)',
          },
        },
        required: ['objectId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rotateObject',
      description: 'Rotate an object by a specified angle',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to rotate',
          },
          degrees: {
            type: 'number',
            description: 'Rotation angle in degrees',
          },
        },
        required: ['objectId', 'degrees'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateObject',
      description: 'Update visual properties of an existing object (color, stroke, text, opacity)',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to update',
          },
          fill: {
            type: 'string',
            description: 'New fill color (hex code)',
          },
          stroke: {
            type: 'string',
            description: 'New stroke/border color (hex code)',
          },
          strokeWidth: {
            type: 'number',
            description: 'New stroke width in pixels',
          },
          opacity: {
            type: 'number',
            description: 'Opacity from 0 to 1',
          },
          text: {
            type: 'string',
            description: 'New text content (for sticky/textbox)',
          },
        },
        required: ['objectId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteObject',
      description: 'Delete an object from the canvas',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to delete',
          },
        },
        required: ['objectId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'arrangeObjects',
      description: 'Arrange multiple objects in a layout pattern',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to arrange',
          },
          layout: {
            type: 'string',
            enum: ['row', 'column', 'grid'],
            description: 'Layout pattern',
          },
          spacing: {
            type: 'number',
            description: 'Spacing between objects in pixels',
          },
          startX: {
            type: 'number',
            description: 'Starting X position',
          },
          startY: {
            type: 'number',
            description: 'Starting Y position',
          },
          columns: {
            type: 'number',
            description: 'Number of columns (for grid layout)',
          },
        },
        required: ['objectIds', 'layout'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'createLoginForm',
      description: 'Create a login form with username field, password field, and submit button',
      parameters: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'X position for the form',
          },
          y: {
            type: 'number',
            description: 'Y position for the form',
          },
          width: {
            type: 'number',
            description: 'Width of form elements',
          },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'createNavigationBar',
      description: 'Create a horizontal navigation bar with menu items',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Menu item labels',
          },
          x: {
            type: 'number',
            description: 'X position',
          },
          y: {
            type: 'number',
            description: 'Y position',
          },
          backgroundColor: {
            type: 'string',
            description: 'Background color of the nav bar',
          },
        },
        required: ['items', 'x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCanvasState',
      description: 'Get the current state of all objects on the canvas',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicateObject',
      description: 'Duplicate an existing object with a slight offset',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to duplicate',
          },
          offsetX: {
            type: 'number',
            description: 'Horizontal offset for the duplicate (default 20)',
          },
          offsetY: {
            type: 'number',
            description: 'Vertical offset for the duplicate (default 20)',
          },
        },
        required: ['objectId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reorderObject',
      description: 'Change the layer order of an object (bring to front, send to back, etc.)',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'The ID of the object to reorder',
          },
          action: {
            type: 'string',
            enum: ['bringToFront', 'sendToBack', 'bringForward', 'sendBackward'],
            description: 'The reorder action to perform',
          },
        },
        required: ['objectId', 'action'],
      },
    },
  },
];

export interface AIAction {
  type: string;
  params: Record<string, unknown>;
}

export interface AIResponse {
  message: string;
  actions: AIAction[];
}

// Parse AI function calls into actions
export function parseFunctionCalls(functionCalls: Array<{
  name: string;
  arguments: string;
}>): AIAction[] {
  return functionCalls
    .map((call) => {
      try {
        return {
          type: call.name,
          params: JSON.parse(call.arguments),
        };
      } catch {
        return null;
      }
    })
    .filter((action): action is AIAction => action !== null);
}

const VALID_ACTION_TYPES = new Set([
  'createShape', 'moveObject', 'resizeObject', 'rotateObject',
  'updateObject', 'deleteObject', 'arrangeObjects', 'createLoginForm',
  'createNavigationBar', 'getCanvasState',
  'duplicateObject', 'reorderObject',
]);

const VALID_SHAPE_TYPES = new Set([
  'rect', 'circle', 'line', 'triangle', 'hexagon', 'star', 'sticky', 'textbox',
]);

// Execute AI actions on the canvas
export function executeAIAction(
  action: AIAction,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  reorderObject?: (id: string, action: ZIndexAction) => void
): { success: boolean; message: string; createdIds?: string[] } {
  const { type, params } = action;

  if (!VALID_ACTION_TYPES.has(type)) {
    return { success: false, message: `Unknown action type: ${type}` };
  }

  switch (type) {
    case 'createShape': {
      const { type: shapeType, x: rawX, y: rawY, width, height, radius, color, text, stroke, strokeWidth } = params as {
        type: ShapeType;
        x: number;
        y: number;
        width?: number;
        height?: number;
        radius?: number;
        color?: string;
        text?: string;
        stroke?: string;
        strokeWidth?: number;
      };

      if (typeof shapeType !== 'string' || !VALID_SHAPE_TYPES.has(shapeType)) {
        return { success: false, message: `Invalid shape type: ${shapeType}` };
      }

      const x = Number(rawX);
      const y = Number(rawY);
      if (isNaN(x) || isNaN(y)) {
        return { success: false, message: 'Invalid coordinates: x and y must be numbers' };
      }

      const isSticky = shapeType === 'sticky';
      const isTextbox = shapeType === 'textbox';
      const isTextElement = isSticky || isTextbox;
      const isLine = shapeType === 'line';
      const props: CanvasObjectProps = {
        left: x,
        top: y,
        width: isTextElement ? (width ?? 200) : (width ?? 100),
        height: isSticky ? (height ?? 200) : isTextbox ? (height ?? 40) : isLine ? (height ?? 0) : (height ?? 100),
        radius: radius ?? 50,
        fill: isSticky ? (color ?? '#FEF3C7') : isTextbox ? '' : isLine ? 'transparent' : (color ?? '#3B82F6'),
        stroke: isTextElement ? 'transparent' : (
          stroke === 'none' || stroke === 'transparent' ? 'transparent' : (stroke ?? (isLine ? (color ?? '#1E40AF') : '#1E40AF'))
        ),
        strokeWidth: isTextElement ? 0 : (
          stroke === 'none' || stroke === 'transparent' ? 0 : (strokeWidth ?? 2)
        ),
        ...(isTextElement ? { text: text ?? '', fontSize: 16, fontFamily: 'sans-serif', textColor: isTextbox ? (color ?? '#000000') : '#000000' } : {}),
      };

      console.log('[AI] Creating shape with props:', props);
      const id = createObject(shapeType, props);
      console.log('[AI] Shape created with ID:', id);
      return { success: true, message: `Created ${shapeType} at (${x}, ${y})`, createdIds: [id] };
    }


    case 'moveObject': {
      const { objectId, x, y } = params as { objectId: string; x: number; y: number };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      updateObject(objectId, { left: x, top: y });
      return { success: true, message: `Moved object to (${x}, ${y})` };
    }

    case 'resizeObject': {
      const { objectId, width, height, scale } = params as {
        objectId: string;
        width?: number;
        height?: number;
        scale?: number;
      };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      const updates: Partial<CanvasObjectProps> = {};
      if (width) updates.width = width;
      if (height) updates.height = height;
      if (scale) {
        updates.scaleX = scale;
        updates.scaleY = scale;
      }

      updateObject(objectId, updates);
      return { success: true, message: `Resized object ${objectId}` };
    }

    case 'rotateObject': {
      const { objectId, degrees } = params as { objectId: string; degrees: number };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      updateObject(objectId, { angle: degrees });
      return { success: true, message: `Rotated object to ${degrees} degrees` };
    }

    case 'updateObject': {
      const { objectId, fill, stroke, strokeWidth, opacity, text } = params as {
        objectId: string;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        opacity?: number;
        text?: string;
      };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      const updates: Partial<CanvasObjectProps> = {};
      if (fill !== undefined) updates.fill = fill;
      if (stroke !== undefined) updates.stroke = stroke;
      if (strokeWidth !== undefined) updates.strokeWidth = strokeWidth;
      if (opacity !== undefined) updates.opacity = opacity;
      if (text !== undefined) updates.text = text;

      updateObject(objectId, updates);
      return { success: true, message: `Updated object ${objectId}` };
    }

    case 'deleteObject': {
      const { objectId } = params as { objectId: string };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      deleteObject(objectId);
      return { success: true, message: `Deleted object ${objectId}` };
    }

    case 'arrangeObjects': {
      const { objectIds, layout, spacing = 20, startX = 100, startY = 100, columns = 3 } = params as {
        objectIds: string[];
        layout: 'row' | 'column' | 'grid';
        spacing?: number;
        startX?: number;
        startY?: number;
        columns?: number;
      };

      let x = startX;
      let y = startY;
      let col = 0;

      for (const objectId of objectIds) {
        if (!canvasObjects.has(objectId)) continue;

        updateObject(objectId, { left: x, top: y });

        switch (layout) {
          case 'row':
            x += spacing + 100; // Assume 100px width
            break;
          case 'column':
            y += spacing + 100;
            break;
          case 'grid':
            col++;
            if (col >= columns) {
              col = 0;
              x = startX;
              y += spacing + 100;
            } else {
              x += spacing + 100;
            }
            break;
        }
      }

      return { success: true, message: `Arranged ${objectIds.length} objects in ${layout} layout` };
    }

    case 'createLoginForm': {
      const { x, y, width = 200 } = params as { x: number; y: number; width?: number };
      const createdIds: string[] = [];

      // Create form container (background)
      const bgId = createObject('rect', {
        left: x - 20,
        top: y - 20,
        width: width + 40,
        height: 220,
        fill: '#374151',
        stroke: '#4B5563',
        strokeWidth: 2,
      });
      createdIds.push(bgId);

      // Create username field background
      const usernameFieldId = createObject('rect', {
        left: x,
        top: y + 50,
        width,
        height: 35,
        fill: '#1F2937',
        stroke: '#6B7280',
        strokeWidth: 1,
      });
      createdIds.push(usernameFieldId);

      // Create password field background
      const passwordFieldId = createObject('rect', {
        left: x,
        top: y + 100,
        width,
        height: 35,
        fill: '#1F2937',
        stroke: '#6B7280',
        strokeWidth: 1,
      });
      createdIds.push(passwordFieldId);

      // Create submit button
      const submitButtonId = createObject('rect', {
        left: x,
        top: y + 150,
        width,
        height: 40,
        fill: '#3B82F6',
        stroke: '#2563EB',
        strokeWidth: 1,
      });
      createdIds.push(submitButtonId);

      return { success: true, message: 'Created login form', createdIds };
    }

    case 'createNavigationBar': {
      const { items, x, y, backgroundColor = '#1F2937' } = params as {
        items: string[];
        x: number;
        y: number;
        backgroundColor?: string;
      };
      const createdIds: string[] = [];
      const itemWidth = 100;
      const totalWidth = items.length * itemWidth;

      // Create nav bar background
      const bgId = createObject('rect', {
        left: x,
        top: y,
        width: totalWidth,
        height: 50,
        fill: backgroundColor,
        stroke: '#374151',
        strokeWidth: 1,
      });
      createdIds.push(bgId);

      // Create colored indicators for menu items
      items.forEach((_item, index) => {
        const indicatorId = createObject('rect', {
          left: x + index * itemWidth + 10,
          top: y + 10,
          width: 80,
          height: 30,
          fill: '#374151',
          stroke: '#4B5563',
          strokeWidth: 1,
        });
        createdIds.push(indicatorId);
      });

      return { success: true, message: `Created navigation bar with ${items.length} items`, createdIds };
    }

    case 'getCanvasState': {
      const objects = Array.from(canvasObjects.entries()).map(([id, obj]) => ({
        id,
        type: obj.type,
        position: { x: obj.props.left, y: obj.props.top },
      }));
      return { success: true, message: JSON.stringify(objects, null, 2) };
    }

    case 'duplicateObject': {
      const { objectId, offsetX = 20, offsetY = 20 } = params as {
        objectId: string;
        offsetX?: number;
        offsetY?: number;
      };

      const original = canvasObjects.get(objectId);
      if (!original) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      const newProps: CanvasObjectProps = {
        ...original.props,
        left: original.props.left + offsetX,
        top: original.props.top + offsetY,
      };

      const newId = createObject(original.type, newProps);
      return { success: true, message: `Duplicated object ${objectId}`, createdIds: [newId] };
    }

    case 'reorderObject': {
      const { objectId, action: reorderAction } = params as {
        objectId: string;
        action: ZIndexAction;
      };

      if (!canvasObjects.has(objectId)) {
        return { success: false, message: `Object ${objectId} not found` };
      }

      if (reorderObject) {
        reorderObject(objectId, reorderAction);
      }
      return { success: true, message: `Reordered object ${objectId}: ${reorderAction}` };
    }

    default:
      return { success: false, message: `Unknown action type: ${type}` };
  }
}

// System prompt for the AI
export const AI_SYSTEM_PROMPT = `You are an AI assistant that helps users create and manipulate shapes on a collaborative design canvas.

You can:
- Create shapes (rectangles, circles, lines, triangles, hexagons, stars) with custom colors, sizes, and positions
- Create sticky notes with editable text
- Create text boxes for free-form text on the canvas
- Move, resize, and rotate existing objects
- Delete objects
- Arrange objects in layouts (rows, columns, grids)
- Duplicate existing objects
- Reorder object layers (bring to front, send to back, bring forward, send backward)
- Create UI mockups like login forms and navigation bars

IMPORTANT: Parse the user's request carefully. Look for:
- Color names (red, blue, green, etc.) or hex codes (#FF0000)
- Size descriptions (small, large, 100x200, etc.)
- Position descriptions (center, top-left, at 200,300, etc.)
- Quantity (3 circles, five rectangles, etc.)

When the user asks you to do something:
1. Identify what shapes to create and their properties
2. Use reasonable defaults if not specified (blue color, 100x100 size, center position)
3. Execute the appropriate function calls

Position reference:
- Canvas is approximately 800x600 visible area
- Center: (400, 300)
- Top-left: (100, 100)
- Top-right: (600, 100)
- Bottom-left: (100, 500)
- Bottom-right: (600, 500)

MODIFYING EXISTING OBJECTS:
When asked to change color, fill, stroke, opacity, or text of an existing object, ALWAYS use updateObject — never delete and recreate.
Example: "make this red" → updateObject(objectId, fill="#EF4444")

For complex requests like "create a login form", use the specialized createLoginForm function.
For arranging objects, use arrangeObjects with layout: row, column, or grid.`;
