import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
} from '@google/generative-ai';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { executeAIAction } from './aiService';
import type { AIAction } from './aiService';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Canvas tool declarations for Gemini function calling
const canvasTools = [
  {
    name: 'createShape',
    description: 'Create a shape on the canvas',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description: 'The type of shape: rect, circle, line, triangle, hexagon, star, or sticky',
        },
        x: { type: SchemaType.NUMBER, description: 'X position (left)' },
        y: { type: SchemaType.NUMBER, description: 'Y position (top)' },
        width: { type: SchemaType.NUMBER, description: 'Width of the shape' },
        height: { type: SchemaType.NUMBER, description: 'Height of the shape' },
        radius: { type: SchemaType.NUMBER, description: 'Radius (for circles)' },
        color: { type: SchemaType.STRING, description: 'Fill color as hex code (e.g. #FF0000)' },
        text: { type: SchemaType.STRING, description: 'Text content (for sticky notes)' },
      },
      required: ['type', 'x', 'y'],
    },
  },
  {
    name: 'moveObject',
    description: 'Move an existing object to a new position',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: { type: SchemaType.STRING, description: 'Object ID to move' },
        x: { type: SchemaType.NUMBER, description: 'New X position' },
        y: { type: SchemaType.NUMBER, description: 'New Y position' },
      },
      required: ['objectId', 'x', 'y'],
    },
  },
  {
    name: 'resizeObject',
    description: 'Resize an existing object',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: { type: SchemaType.STRING, description: 'Object ID to resize' },
        width: { type: SchemaType.NUMBER, description: 'New width' },
        height: { type: SchemaType.NUMBER, description: 'New height' },
        scale: { type: SchemaType.NUMBER, description: 'Scale factor' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'deleteObject',
    description: 'Delete an object from the canvas',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: { type: SchemaType.STRING, description: 'Object ID to delete' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'arrangeObjects',
    description: 'Arrange multiple objects in a layout (row, column, or grid)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectIds: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Object IDs to arrange',
        },
        layout: { type: SchemaType.STRING, description: 'Layout: row, column, or grid' },
        spacing: { type: SchemaType.NUMBER, description: 'Spacing in pixels' },
        startX: { type: SchemaType.NUMBER, description: 'Starting X' },
        startY: { type: SchemaType.NUMBER, description: 'Starting Y' },
      },
      required: ['objectIds', 'layout'],
    },
  },
  {
    name: 'createLoginForm',
    description: 'Create a login form mockup',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        x: { type: SchemaType.NUMBER, description: 'X position' },
        y: { type: SchemaType.NUMBER, description: 'Y position' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'createNavigationBar',
    description: 'Create a horizontal navigation bar with menu items',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Menu item labels',
        },
        x: { type: SchemaType.NUMBER, description: 'X position' },
        y: { type: SchemaType.NUMBER, description: 'Y position' },
      },
      required: ['items', 'x', 'y'],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI assistant for a collaborative design canvas. You help users create and manipulate shapes.

You can create shapes: rectangles, circles, triangles, hexagons, stars, lines, and sticky notes.
You can move, resize, and delete existing objects.
You can arrange objects in rows, columns, or grids.
You can create UI mockups like login forms and navigation bars.

The canvas coordinate system:
- The visible area center is provided as context
- Positive X goes right, positive Y goes down
- Grid snaps to 25px increments
- Default shape size is 100x100

When creating shapes, always use the function calls. Pick appropriate colors and sizes based on the user's request.
For sticky notes, use type "sticky" and include text content if the user specifies any.
Use hex color codes (e.g. #EF4444 for red, #3B82F6 for blue, #10B981 for green).`;

export function isGeminiConfigured(): boolean {
  return Boolean(API_KEY && API_KEY !== 'undefined');
}

export async function processGeminiCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  viewportCenter: { x: number; y: number }
): Promise<string> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ functionDeclarations: canvasTools as any }],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingMode.AUTO },
    },
    systemInstruction: SYSTEM_PROMPT,
  });

  // Build canvas state summary
  const objectSummary = Array.from(canvasObjects.entries()).map(([id, obj]) => ({
    id,
    type: obj.type,
    left: obj.props.left,
    top: obj.props.top,
  }));

  const objectList = objectSummary
    .map((obj) => `- ${obj.type} (id: ${obj.id}) at (${obj.left}, ${obj.top})`)
    .join('\n');

  const center = viewportCenter || { x: 400, y: 300 };
  const contextMessage = `Viewport center: (${Math.round(center.x)}, ${Math.round(center.y)})
Current objects on canvas:
${objectList || '(empty canvas)'}

User command: ${command}`;

  const result = await model.generateContent(contextMessage);
  const response = result.response;

  const parts = response.candidates?.[0]?.content?.parts || [];
  const functionCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => ({
      name: p.functionCall!.name,
      args: p.functionCall!.args,
    }));
  const text = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('');

  if (!functionCalls || functionCalls.length === 0) {
    return text || "I couldn't understand that command. Try something like 'create a red circle' or 'make a sticky note'.";
  }

  // Execute each function call locally
  const results: string[] = [];
  for (const fc of functionCalls) {
    const action: AIAction = {
      type: fc.name,
      params: fc.args as Record<string, unknown>,
    };
    const execResult = executeAIAction(
      action,
      canvasObjects,
      createObject,
      updateObject,
      deleteObject
    );
    results.push(execResult.message);
  }

  const actionSummary = results.join('. ');
  return text ? `${text}\n${actionSummary}` : actionSummary;
}
