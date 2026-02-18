import {
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import type { DataSnapshot, Database } from 'firebase/database';
import { rtdb } from './firebase';
import type { PresenceData } from '../types';

// Users with lastSeen older than this are considered stale (ghost sessions)
const STALE_THRESHOLD_MS = 8_000;

// Get presence reference for a user in a room
const getPresenceRef = (roomId: string, userId: string) => {
  if (!rtdb) throw new Error('Realtime Database not initialized');
  return ref(rtdb as Database, `presence/${roomId}/${userId}`);
};

// Get all presence reference for a room
const getRoomPresenceRef = (roomId: string) => {
  if (!rtdb) throw new Error('Realtime Database not initialized');
  return ref(rtdb as Database, `presence/${roomId}`);
};

// Get the .info/connected ref (true when RTDB is connected)
export function getConnectedRef() {
  if (!rtdb) throw new Error('Realtime Database not initialized');
  return ref(rtdb as Database, '.info/connected');
}

// Set user as online — awaits onDisconnect before writing
export async function setUserOnline(
  roomId: string,
  userId: string,
  userName: string,
  color: string
): Promise<void> {
  const presenceRef = getPresenceRef(roomId, userId);

  // MUST await onDisconnect before writing online=true,
  // otherwise the server may not have the cleanup handler registered.
  await onDisconnect(presenceRef).set({
    userId,
    userName,
    color,
    online: false,
    lastSeen: serverTimestamp(),
  });

  await set(presenceRef, {
    userId,
    userName,
    color,
    online: true,
    lastSeen: serverTimestamp(),
  });
}

// Lightweight heartbeat — only updates lastSeen timestamp
export async function heartbeatPresence(
  roomId: string,
  userId: string
): Promise<void> {
  const presenceRef = getPresenceRef(roomId, userId);
  await update(presenceRef, { lastSeen: serverTimestamp() });
}

// Set user as offline (only used for explicit page unload, NOT for effect cleanup)
export async function setUserOffline(
  roomId: string,
  userId: string,
  userName: string,
  color: string
): Promise<void> {
  const presenceRef = getPresenceRef(roomId, userId);
  await set(presenceRef, {
    userId,
    userName,
    color,
    online: false,
    lastSeen: serverTimestamp(),
  });
}

// Subscribe to presence changes
export function subscribeToPresence(
  roomId: string,
  onChange: (users: PresenceData[]) => void
): () => void {
  const presenceRef = getRoomPresenceRef(roomId);

  const unsubscribe = onValue(presenceRef, (snapshot: DataSnapshot) => {
    const users: PresenceData[] = [];
    const data = snapshot.val();

    if (data) {
      const now = Date.now();
      Object.values(data).forEach((user) => {
        const presence = user as PresenceData;
        const age = now - presence.lastSeen;
        if (presence.online && age < STALE_THRESHOLD_MS) {
          users.push(presence);
        }
      });
    }

    onChange(users);
  }, (error) => {
    console.error('[Presence] Subscription error:', error);
  });

  return unsubscribe;
}

// Create a room if it doesn't exist, or add user to existing room
export async function ensureRoom(
  _roomId: string,
  _userId: string,
  _roomName?: string
): Promise<void> {
  // This is handled in canvasSync.ts — kept here for compatibility
}
