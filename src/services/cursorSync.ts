import {
  ref,
  set,
  onValue,
  onDisconnect,
  remove,
} from 'firebase/database';
import type { DataSnapshot, Database } from 'firebase/database';
import { rtdb } from './firebase';
import type { CursorState } from '../types';

// Get cursor reference for a user in a room
const getCursorRef = (roomId: string, odId: string) => {
  if (!rtdb) throw new Error('Realtime Database not initialized');
  return ref(rtdb as Database, `cursors/${roomId}/${odId}`);
};

// Get all cursors reference for a room
const getRoomCursorsRef = (roomId: string) => {
  if (!rtdb) throw new Error('Realtime Database not initialized');
  return ref(rtdb as Database, `cursors/${roomId}`);
};

// Update cursor position
export async function updateCursor(
  roomId: string,
  cursorState: CursorState
): Promise<void> {
  const cursorRef = getCursorRef(roomId, cursorState.userId);
  await set(cursorRef, {
    ...cursorState,
    lastActive: Date.now(),
  });
}

// Remove cursor on disconnect
export function setupCursorCleanup(
  roomId: string,
  userId: string
): void {
  const cursorRef = getCursorRef(roomId, userId);
  onDisconnect(cursorRef).remove();
}

// Remove cursor manually
export async function removeCursor(
  roomId: string,
  userId: string
): Promise<void> {
  const cursorRef = getCursorRef(roomId, userId);
  await remove(cursorRef);
}

// Subscribe to all cursors in a room
export function subscribeToCursors(
  roomId: string,
  currentUserId: string,
  onChange: (cursors: Map<string, CursorState>) => void
): () => void {
  const cursorsRef = getRoomCursorsRef(roomId);

  const unsubscribe = onValue(cursorsRef, (snapshot: DataSnapshot) => {
    const cursors = new Map<string, CursorState>();
    const data = snapshot.val();

    if (data) {
      Object.entries(data).forEach(([userId, cursor]) => {
        // Don't include current user's cursor
        if (userId !== currentUserId) {
          const cursorState = cursor as CursorState;
          // Only include cursors active in last 5 seconds
          if (Date.now() - cursorState.lastActive < 5000) {
            cursors.set(userId, cursorState);
          }
        }
      });
    }

    onChange(cursors);
  });

  return unsubscribe;
}
