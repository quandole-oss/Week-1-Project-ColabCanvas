import * as functions from "firebase-functions/v1";
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
} from "@google/generative-ai";

// Canvas tool declarations for Gemini function calling
const canvasTools = [
  {
    name: "createShape",
    description: "Create a shape on the canvas",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description:
            "The type of shape: rect, circle, line, triangle, hexagon, star, or sticky",
        },
        x: { type: SchemaType.NUMBER, description: "X position (left)" },
        y: { type: SchemaType.NUMBER, description: "Y position (top)" },
        width: { type: SchemaType.NUMBER, description: "Width of the shape" },
        height: { type: SchemaType.NUMBER, description: "Height of the shape" },
        radius: {
          type: SchemaType.NUMBER,
          description: "Radius (for circles)",
        },
        color: {
          type: SchemaType.STRING,
          description: "Fill color as hex code (e.g. #FF0000)",
        },
        text: {
          type: SchemaType.STRING,
          description: "Text content (for sticky notes)",
        },
      },
      required: ["type", "x", "y"],
    },
  },
  {
    name: "moveObject",
    description: "Move an existing object to a new position",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: {
          type: SchemaType.STRING,
          description: "Object ID to move",
        },
        x: { type: SchemaType.NUMBER, description: "New X position" },
        y: { type: SchemaType.NUMBER, description: "New Y position" },
      },
      required: ["objectId", "x", "y"],
    },
  },
  {
    name: "resizeObject",
    description: "Resize an existing object",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: {
          type: SchemaType.STRING,
          description: "Object ID to resize",
        },
        width: { type: SchemaType.NUMBER, description: "New width" },
        height: { type: SchemaType.NUMBER, description: "New height" },
        scale: { type: SchemaType.NUMBER, description: "Scale factor" },
      },
      required: ["objectId"],
    },
  },
  {
    name: "deleteObject",
    description: "Delete an object from the canvas",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectId: {
          type: SchemaType.STRING,
          description: "Object ID to delete",
        },
      },
      required: ["objectId"],
    },
  },
  {
    name: "arrangeObjects",
    description: "Arrange multiple objects in a layout (row, column, or grid)",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        objectIds: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Object IDs to arrange",
        },
        layout: {
          type: SchemaType.STRING,
          description: "Layout: row, column, or grid",
        },
        spacing: { type: SchemaType.NUMBER, description: "Spacing in pixels" },
        startX: { type: SchemaType.NUMBER, description: "Starting X" },
        startY: { type: SchemaType.NUMBER, description: "Starting Y" },
      },
      required: ["objectIds", "layout"],
    },
  },
  {
    name: "createLoginForm",
    description: "Create a login form mockup",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        x: { type: SchemaType.NUMBER, description: "X position" },
        y: { type: SchemaType.NUMBER, description: "Y position" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "createNavigationBar",
    description: "Create a horizontal navigation bar with menu items",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Menu item labels",
        },
        x: { type: SchemaType.NUMBER, description: "X position" },
        y: { type: SchemaType.NUMBER, description: "Y position" },
      },
      required: ["items", "x", "y"],
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

// 1st gen Cloud Function (avoids Cloud Build permission issues)
export const aiProxy = functions
  .runWith({
    secrets: ["GEMINI_API_KEY"],
    maxInstances: 10,
  })
  .https.onRequest(async (req, res) => {
    // CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { command, canvasObjects, viewportCenter } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: "Missing 'command' in request body" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Gemini API key not configured" });
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ functionDeclarations: canvasTools as any }],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.AUTO },
        },
        systemInstruction: SYSTEM_PROMPT,
      });

      const objects = canvasObjects || [];
      const objectList = objects
        .map(
          (obj: { id: string; type: string; left: number; top: number }) =>
            `- ${obj.type} (id: ${obj.id}) at (${obj.left}, ${obj.top})`
        )
        .join("\n");

      const center = viewportCenter || { x: 400, y: 300 };
      const contextMessage = `Viewport center: (${Math.round(center.x)}, ${Math.round(center.y)})
Current objects on canvas:
${objectList || "(empty canvas)"}

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
        .join("");

      res.json({ functionCalls, text });
    } catch (error) {
      console.error("Gemini API error:", error);
      const message =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
