import { Timestamp } from 'firebase/firestore';

export type ShapeType = 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'hexagon' | 'sticky' | 'textbox';

export interface CanvasObjectProps {
  left: number;
  top: number;
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  // Line specific
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface CanvasObject {
  id: string;
  type: ShapeType;
  props: CanvasObjectProps;
  zIndex: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface CursorState {
  x: number;
  y: number;
  userId: string;
  userName: string;
  color: string;
  lastActive: number;
  selectedObjectId?: string | null;
  isMoving?: boolean;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  members: string[];  // Array of user UIDs who can access this room
  isPublic?: boolean; // Optional: if true, any authenticated user can join
}

export type Tool = 'select' | 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'hexagon' | 'sticky' | 'textbox' | 'pan' | 'eraser';
