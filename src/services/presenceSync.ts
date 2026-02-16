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

// Set user as online
export async function setUserOnline(
  roomId: string,
  userId: string,
  userName: string,
  color: string
): Promise<void> {
  const presenceRef = getPresenceRef(roomId, userId);

  // Set up disconnect handler first
  onDisconnect(presenceRef).set({
    userId: userId,
    userName: userName,
    color,
    online: false,
    lastSeen: serverTimestamp(),
  });

  // Then set user as online
  await set(presenceRef, {
    userId: userId,
    userName: userName,
    color,
    online: true,
    lastSeen: serverTimestamp(),
  });
}

// Set user as offline
export async function setUserOffline(
  roomId: string,
  userId: string,
  userName: string,
  color: string
): Promise<void> {
  const presenceRef = getPresenceRef(roomId, userId);
  await set(presenceRef, {
    userId: userId,
    userName: userName,
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
      Object.values(data).forEach((user) => {
        const presence = user as PresenceData;
        if (presence.online) {
          users.push(presence);
        }
      });
    }

    onChange(users);
  });

  return unsubscribe;
}
