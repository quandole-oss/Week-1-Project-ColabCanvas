import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { executeAIAction } from './aiService';
import type { AIAction } from './aiService';
import type { ZIndexAction } from '../utils/zIndex';
import { auth, db } from './firebase';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

const AI_REQUEST_TIMEOUT = 30000; // 30 seconds

// Only read the API key in dev mode — in production builds this is always undefined,
// forcing the secure Firebase Cloud Function path.
const ANTHROPIC_API_KEY = import.meta.env.DEV
  ? (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)
  : undefined;

// Enhanced system prompt that teaches Claude to decompose complex requests
const ENHANCED_SYSTEM_PROMPT = `You are an AI architect for a collaborative design canvas. Before responding, plan the full blueprint of what you'll create — think about every sub-element, its position, size, and color.

Available shapes: rect, circle, line, triangle, hexagon, star, sticky, textbox.

CRITICAL COORDINATE SYSTEM:
- x and y are the TOP-LEFT corner of the shape's bounding box, NOT the center.
- For a circle with radius R at position (x, y): its visual center is at (x + R, y + R).
- For a rect with width W, height H at (x, y): its visual center is at (x + W/2, y + H/2).
- Triangles and other polygons: bounding box is (width × height), top-left at (x, y).
- To CENTER a circle with radius R at visual point (cx, cy): set x = cx - R, y = cy - R.
- To CENTER a rect (W × H) at visual point (cx, cy): set x = cx - W/2, y = cy - H/2.

IMPORTANT RULES:
1. For ANY request, always use createShape tool calls. Never just respond with text.
2. For complex objects, decompose into multiple shapes positioned relative to each other.
3. Keep elements proportional — sub-elements should be noticeably smaller than the main shape.
4. Use the coordinate math above to align elements by their visual centers.

WORKED EXAMPLE — Smiley face centered at viewport center (400, 300):
- Face: circle, radius=80. To center at (400,300): x=320, y=220, radius=80, color=#FFD93D
- Left eye: circle, radius=8. Center at (375, 275): x=367, y=267, radius=8, color=#000000
- Right eye: circle, radius=8. Center at (425, 275): x=417, y=267, radius=8, color=#000000
- Mouth: circle, radius=12. Center at (400, 330): x=388, y=318, radius=12, color=#000000

WORKED EXAMPLE — Cat face centered at (400, 300):
- Head: circle, radius=70. Center at (400,300): x=330, y=230, radius=70, color=#808080
- Left ear: triangle, 30×30. Center at (355, 240): x=340, y=225, width=30, height=30, color=#808080
- Right ear: triangle, 30×30. Center at (445, 240): x=430, y=225, width=30, height=30, color=#808080
- Left eye: circle, radius=8. Center at (380, 285): x=372, y=277, radius=8, color=#10B981
- Right eye: circle, radius=8. Center at (420, 285): x=412, y=277, radius=8, color=#10B981
- Nose: triangle, 12×10. Center at (400, 305): x=394, y=300, width=12, height=10, color=#FFB6C1
- Left whisker 1: line at x=310, y=290, width=50, height=2, color=#333333
- Left whisker 2: line at x=310, y=305, width=50, height=2, color=#333333
- Right whisker 1: line at x=440, y=290, width=50, height=2, color=#333333
- Right whisker 2: line at x=440, y=305, width=50, height=2, color=#333333

WORKED EXAMPLE — Dog centered at (400, 300):
- Head: circle, radius=60. Center at (400,270): x=340, y=210, radius=60, color=#C4863C
- Body: circle, radius=50. Center at (400,370): x=350, y=320, radius=50, color=#C4863C
- Left ear: circle, radius=20. Center at (345,240): x=325, y=220, radius=20, color=#8B5E2B (floppy ears = circles on SIDES of head, not on top)
- Right ear: circle, radius=20. Center at (455,240): x=435, y=220, radius=20, color=#8B5E2B
- Left eye: circle, radius=6. Center at (382,260): x=376, y=254, radius=6, color=#000000
- Right eye: circle, radius=6. Center at (418,260): x=412, y=254, radius=6, color=#000000
- Snout: circle, radius=18. Center at (400,290): x=382, y=272, radius=18, color=#DEB887 (lighter muzzle area)
- Nose: circle, radius=6. Center at (400,282): x=394, y=276, radius=6, color=#000000
- Tail: triangle, 20×30. Center at (455,355): x=445, y=340, width=20, height=30, color=#C4863C
NOTE: For dogs, ears go on the SIDES of the head (floppy). Body should be SMALLER or same size as head for cartoon style.

MORE DECOMPOSITION PATTERNS:
- "house" = large rect (body) + triangle (roof, above body, same width) + small rect (door, centered bottom) + small rects (windows)
- "tree" = narrow tall rect (trunk, brown) + large circle (foliage, green, centered above trunk)
- "flower" = circle (center, yellow) + circles (petals around center) + rect (stem, narrow green, below)
- "car" = large rect (body) + 2 circles (wheels, below body edges) + rect (cabin, on top)

PROPORTIONING RULES:
- For cartoon animals: head is the LARGEST element. Body should be similar size or slightly smaller.
- Ears, eyes, nose are much smaller than the head (ears ~1/3 head radius, eyes ~1/8).
- Always include a snout/muzzle for dogs (lighter colored circle on lower face).

COLOR GUIDANCE:
- Use appealing colors. Hex codes only.
- Defaults — blue: #3B82F6, red: #EF4444, green: #10B981, yellow: #F59E0B
- Skin/face: #FFD93D, eyes: #000000, grass: #10B981, sky: #87CEEB, wood: #8B4513

MOVING GROUPS OF OBJECTS:
When asked to move a composition (e.g. "move the cat"), you must:
1. Identify all objects that belong to the composition by looking at their positions, colors, and types (they will be clustered together spatially).
2. Calculate a SINGLE offset (deltaX, deltaY) from the current group center to the target position.
3. Apply that SAME offset to EVERY object in the group: newLeft = oldLeft + deltaX, newTop = oldTop + deltaY.
This preserves the relative arrangement. NEVER calculate positions independently per object.

COMMAND CATEGORIES YOU MUST HANDLE:

1. CREATION: "Create a red circle at position 100, 200" / "Add a text layer that says 'Hello World'" / "Make a 200x300 rectangle"
   - Use createShape with explicit type, position, size, color, and text as requested.
   - For text layers, use type "textbox" with the text parameter.

2. MANIPULATION: "Move the blue rectangle to the center" / "Resize the circle to be twice as big" / "Rotate the text 45 degrees"
   - Use moveObject, resizeObject (with scale parameter for "twice as big"), rotateObject.
   - Identify objects by matching type + color + position from the canvas objects list.

3. LAYOUT: "Arrange these shapes in a horizontal row" / "Create a grid of 3x3 squares" / "Space these elements evenly"
   - Use arrangeObjects for existing objects, or create grids with multiple createShape calls.

4. COMPLEX: "Create a login form" / "Build a navigation bar with 4 menu items" / "Make a card layout with title, image, and description"
   - Use createLoginForm / createNavigationBar for those specific items.
   - For card layouts: compose with rect (card bg) + textbox (title) + rect (image placeholder) + textbox (description), all positioned relative to the card.

Always respond with tool calls. Include a brief text description of what you created or modified.`;

// Anthropic tool schemas (same tools as the cloud function, in Anthropic format)
const ANTHROPIC_TOOLS = [
  {
    name: 'createShape',
    description: 'Create a shape on the canvas. Use this for every visual element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['rect', 'circle', 'line', 'triangle', 'hexagon', 'star', 'sticky', 'textbox'], description: 'Shape type' },
        x: { type: 'number', description: 'X position (left)' },
        y: { type: 'number', description: 'Y position (top)' },
        width: { type: 'number', description: 'Width (for rects, default 100)' },
        height: { type: 'number', description: 'Height (for rects, default 100)' },
        radius: { type: 'number', description: 'Radius (for circles, default 50)' },
        color: { type: 'string', description: 'Fill color as hex code (e.g. #FF0000)' },
        text: { type: 'string', description: 'Text content (for sticky/textbox)' },
      },
      required: ['type', 'x', 'y'],
    },
  },
  {
    name: 'moveObject',
    description: 'Move an existing object to a new position',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to move' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
      },
      required: ['objectId', 'x', 'y'],
    },
  },
  {
    name: 'resizeObject',
    description: 'Resize an existing object',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to resize' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
        scale: { type: 'number', description: 'Scale factor (e.g. 2 for double size)' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'rotateObject',
    description: 'Rotate an existing object by a specified angle in degrees',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to rotate' },
        degrees: { type: 'number', description: 'Rotation angle in degrees (e.g. 45, 90, 180)' },
      },
      required: ['objectId', 'degrees'],
    },
  },
  {
    name: 'deleteObject',
    description: 'Delete an object from the canvas',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to delete' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'arrangeObjects',
    description: 'Arrange multiple objects in a layout pattern',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectIds: { type: 'array', items: { type: 'string' }, description: 'Object IDs to arrange' },
        layout: { type: 'string', enum: ['row', 'column', 'grid'], description: 'Layout pattern' },
        spacing: { type: 'number', description: 'Spacing in pixels' },
        startX: { type: 'number', description: 'Starting X position' },
        startY: { type: 'number', description: 'Starting Y position' },
        columns: { type: 'number', description: 'Number of columns (grid only)' },
      },
      required: ['objectIds', 'layout'],
    },
  },
  {
    name: 'createLoginForm',
    description: 'Create a login form with username field, password field, and submit button',
    input_schema: {
      type: 'object' as const,
      properties: {
        x: { type: 'number', description: 'X position for the form' },
        y: { type: 'number', description: 'Y position for the form' },
        width: { type: 'number', description: 'Width of form elements' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'createNavigationBar',
    description: 'Create a horizontal navigation bar with menu items',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'Menu item labels' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        backgroundColor: { type: 'string', description: 'Background color' },
      },
      required: ['items', 'x', 'y'],
    },
  },
  {
    name: 'duplicateObject',
    description: 'Duplicate an existing object with a slight offset',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to duplicate' },
        offsetX: { type: 'number', description: 'Horizontal offset (default 20)' },
        offsetY: { type: 'number', description: 'Vertical offset (default 20)' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'reorderObject',
    description: 'Change the layer order of an object (bring to front, send to back, etc.)',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'The ID of the object to reorder' },
        action: { type: 'string', enum: ['bringToFront', 'sendToBack', 'bringForward', 'sendBackward'], description: 'The reorder action' },
      },
      required: ['objectId', 'action'],
    },
  },
];

interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicToolUse | AnthropicTextBlock;

// Call Anthropic API directly through Vite dev proxy
async function callAnthropicDirect(
  command: string,
  objectSummary: Array<Record<string, unknown>>,
  viewportCenter: { x: number; y: number }
): Promise<{ functionCalls: Array<{ name: string; args: Record<string, unknown> }>; text: string }> {
  const userMessage = `User command: "${command}"

Current viewport center: (${viewportCenter.x}, ${viewportCenter.y})
Existing canvas objects: ${JSON.stringify(objectSummary)}

Execute this command using tool calls. For complex objects, decompose into multiple shapes.`;

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: ENHANCED_SYSTEM_PROMPT,
      tools: ANTHROPIC_TOOLS,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.content as AnthropicContentBlock[];

  const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let text = '';

  for (const block of content) {
    if (block.type === 'tool_use') {
      functionCalls.push({ name: block.name, args: block.input });
    } else if (block.type === 'text') {
      text += block.text;
    }
  }

  return { functionCalls, text };
}

export function isGeminiConfigured(): boolean {
  return true;
}

export async function processGeminiCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  viewportCenter: { x: number; y: number },
  reorderObject?: (id: string, action: ZIndexAction) => void
): Promise<string> {
  const objectSummary = Array.from(canvasObjects.entries()).map(([id, obj]) => ({
    id,
    type: obj.type,
    left: obj.props.left,
    top: obj.props.top,
    ...(obj.props.width ? { width: obj.props.width } : {}),
    ...(obj.props.height ? { height: obj.props.height } : {}),
    ...(obj.props.radius ? { radius: obj.props.radius } : {}),
    ...(obj.props.fill ? { fill: obj.props.fill } : {}),
  }));

  // Tier 1: Try direct Anthropic API (if key is configured)
  if (ANTHROPIC_API_KEY) {
    const data = await callAnthropicDirect(command, objectSummary, viewportCenter);
    return processAPIResponse(data, canvasObjects, createObject, updateObject, deleteObject, reorderObject);
  }

  // Tier 2: Fall back to Firebase Cloud Function
  const currentUser = auth?.currentUser;
  if (!currentUser) throw new Error('You must be signed in to use AI features');
  if (!db) throw new Error('Firestore not initialized');

  // Get and sanitize the room ID from the URL
  const rawRoomId = window.location.pathname.split('/room/')[1];
  if (!rawRoomId) throw new Error('You must be in a room to use AI features');
  const roomId = rawRoomId.split('/')[0].split('?')[0].replace(/[^a-zA-Z0-9_-]/g, '');
  if (!roomId || roomId.length > 36) throw new Error('Invalid room ID');

  // Write request document to Firestore
  const aiRequestsRef = collection(db, 'rooms', roomId, 'aiRequests');
  const docRef = await addDoc(aiRequestsRef, {
    command,
    canvasObjects: objectSummary,
    viewportCenter,
    userId: currentUser.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  // Listen for the result
  const data = await new Promise<{ functionCalls: Array<{ name: string; args: Record<string, unknown> }>; text: string }>((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error('AI request timed out. Please try again.'));
    }, AI_REQUEST_TIMEOUT);

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (settled) return;
      const docData = snapshot.data();
      if (!docData) return;

      if (docData.status === 'completed') {
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(docData.result);
      } else if (docData.status === 'error') {
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        reject(new Error(docData.error || 'AI request failed'));
      }
    });
  });

  return processAPIResponse(data, canvasObjects, createObject, updateObject, deleteObject, reorderObject);
}

// Shared response processing for both direct API and Firebase paths
function processAPIResponse(
  data: { functionCalls: Array<{ name: string; args: Record<string, unknown> }>; text: string },
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  reorderObject?: (id: string, action: ZIndexAction) => void
): string {
  if (!data.functionCalls || data.functionCalls.length === 0) {
    return data.text || "I couldn't understand that command. Try something like 'create a red circle' or 'make a sticky note'.";
  }

  const results: string[] = [];
  for (const fc of data.functionCalls) {
    const action: AIAction = {
      type: fc.name,
      params: fc.args as Record<string, unknown>,
    };
    const execResult = executeAIAction(
      action,
      canvasObjects,
      createObject,
      updateObject,
      deleteObject,
      reorderObject
    );
    results.push(execResult.message);
  }

  const actionSummary = results.join('. ');
  return data.text ? `${data.text}\n${actionSummary}` : actionSummary;
}
