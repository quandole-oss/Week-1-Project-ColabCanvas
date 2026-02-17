import {
  ref,
  set,
  onValue,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import type { DataSnapshot, Database } from 'firebase/database';
import { rtdb } from './firebase';
import type { PresenceData } from '../types';

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
  console.error('[Presence] setUserOnline:', { roomId, userId, userName });
  const presenceRef = getPresenceRef(roomId, userId);

  // MUST await onDisconnect before writing online=true,
  // otherwise the server may not have the cleanup handler registered.
  console.error('[Presence] Registering onDisconnect...');
  await onDisconnect(presenceRef).set({
    userId,
    userName,
    color,
    online: false,
    lastSeen: serverTimestamp(),
  });
  console.error('[Presence] onDisconnect registered. Writing online=true...');

  await set(presenceRef, {
    userId,
    userName,
    color,
    online: true,
    lastSeen: serverTimestamp(),
  });
  console.error('[Presence] setUserOnline: DONE');
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
  console.error('[Presence] Subscribing to path: presence/' + roomId);
  const presenceRef = getRoomPresenceRef(roomId);

  const unsubscribe = onValue(presenceRef, (snapshot: DataSnapshot) => {
    const users: PresenceData[] = [];
    const data = snapshot.val();
    console.error('[Presence] Snapshot received, raw data:', data ? Object.keys(data).length + ' users' : 'null');

    if (data) {
      Object.values(data).forEach((user) => {
        const presence = user as PresenceData;
        console.error('[Presence] User entry:', presence.userName, 'online:', presence.online);
        if (presence.online) {
          users.push(presence);
        }
      });
    }

    console.error('[Presence] Online users:', users.length, users.map(u => u.userName));
    onChange(users);
  }, (error) => {
    console.error('[Presence] Subscription error:', error);
  });

  return unsubscribe;
}

// Create a room if it doesn't exist, or add user to existing room
export async function ensureRoom(
  roomId: string,
  userId: string,
  roomName?: string
): Promise<void> {
  // This is handled in canvasSync.ts — kept here for compatibility
}
