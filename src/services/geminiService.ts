import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { executeAIAction } from './aiService';
import type { AIAction } from './aiService';
import { auth, db } from './firebase';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

const AI_REQUEST_TIMEOUT = 30000; // 30 seconds

export function isGeminiConfigured(): boolean {
  return true;
}

export async function processGeminiCommand(
  command: string,
  canvasObjects: Map<string, CanvasObject>,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void,
  deleteObject: (id: string) => void,
  viewportCenter: { x: number; y: number }
): Promise<string> {
  const currentUser = auth?.currentUser;
  if (!currentUser) throw new Error('You must be signed in to use AI features');
  if (!db) throw new Error('Firestore not initialized');

  // Get and sanitize the room ID from the URL
  const rawRoomId = window.location.pathname.split('/room/')[1];
  if (!rawRoomId) throw new Error('You must be in a room to use AI features');
  const roomId = rawRoomId.split('/')[0].split('?')[0].replace(/[^a-zA-Z0-9_-]/g, '');
  if (!roomId || roomId.length > 36) throw new Error('Invalid room ID');

  const objectSummary = Array.from(canvasObjects.entries()).map(([id, obj]) => ({
    id,
    type: obj.type,
    left: obj.props.left,
    top: obj.props.top,
  }));

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
      deleteObject
    );
    results.push(execResult.message);
  }

  const actionSummary = results.join('. ');
  return data.text ? `${data.text}\n${actionSummary}` : actionSummary;
}
