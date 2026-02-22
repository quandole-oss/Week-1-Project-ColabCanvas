import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  arrayUnion,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe, Firestore } from 'firebase/firestore';
import { db } from './firebase';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';

/**
 * Conflict Resolution: Last-Write-Wins (LWW) with Active-User-Priority
 *
 * Firestore uses LWW by default — the most recent write wins. On top of this,
 * two additional guards prevent remote updates from overwriting objects the
 * local user is actively manipulating:
 *
 * 1. **Canvas layer** (Canvas.tsx): The remote sync effect skips visual updates
 *    for any object currently selected or inside an ActiveSelection.
 *
 * 2. **React state layer** (useRealtimeSync.ts): `activeObjectIds` ref holds
 *    the IDs of objects the local user has selected. Incoming Firestore
 *    `onModify` and BroadcastChannel `update` messages for those IDs are
 *    silently dropped, so local state remains authoritative until the user
 *    deselects.
 *
 * Together, these two layers ensure flicker-free manipulation while still
 * converging once the user releases the object.
 */

// Get reference to objects collection for a room
const getObjectsRef = (roomId: string) => {
  if (!db) throw new Error('Firestore not initialized');
  return collection(db as Firestore, 'rooms', roomId, 'objects');
};

// Create or update an object
export async function syncObject(
  roomId: string,
  objectId: string,
  type: ShapeType,
  props: CanvasObjectProps,
  zIndex: number,
  userId: string,
  isNew: boolean = false
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  const now = Timestamp.now();

  // Strip undefined values — Firestore rejects them
  const cleanProps = Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined)
  ) as CanvasObjectProps;

  const data: Partial<CanvasObject> = {
    id: objectId,
    type,
    props: cleanProps,
    zIndex,
    updatedBy: userId,
    updatedAt: now,
  };

  if (isNew) {
    data.createdBy = userId;
    data.createdAt = now;
  }

  await setDoc(objectRef, data, { merge: true });
}

// Partially update specific props fields using dot notation.
// Unlike syncObject (which replaces the entire props object),
// this only touches the fields you pass — preventing accidental
// overwrite of text when moving, or position when editing text.
export async function syncObjectPartial(
  roomId: string,
  objectId: string,
  partialProps: Partial<CanvasObjectProps>,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  const now = Timestamp.now();

  // Build dot-notation update: { "props.text": "Hello", "props.left": 100 }
  const update: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(partialProps)) {
    if (value !== undefined) {
      update[`props.${key}`] = value;
    }
  }

  await updateDoc(objectRef, update);
}

// Atomically update multiple objects' props in a single Firestore WriteBatch.
// All changes arrive to snapshot listeners in one callback, preventing
// split-second inconsistency when moving a multi-object selection.
export async function batchSyncObjectsPartial(
  roomId: string,
  entries: Array<{ id: string; props: Partial<CanvasObjectProps>; zIndex?: number }>,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const batch = writeBatch(db);
  const now = Timestamp.now();

  for (const entry of entries) {
    const objectRef = doc(db, 'rooms', roomId, 'objects', entry.id);
    const update: Record<string, unknown> = { updatedBy: userId, updatedAt: now };
    for (const [key, value] of Object.entries(entry.props)) {
      if (value !== undefined) {
        update[`props.${key}`] = value;
      }
    }
    if (entry.zIndex !== undefined) {
      update['zIndex'] = entry.zIndex;
    }
    batch.update(objectRef, update);
  }

  await batch.commit();
}

// Update only the zIndex of an object
export async function updateObjectZIndex(
  roomId: string,
  objectId: string,
  zIndex: number,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  const now = Timestamp.now();
  await updateDoc(objectRef, { zIndex, updatedBy: userId, updatedAt: now });
}

// Atomically update zIndex for multiple objects in a single WriteBatch.
export async function batchUpdateObjectZIndices(
  roomId: string,
  entries: Array<{ id: string; zIndex: number }>,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const batch = writeBatch(db);
  const now = Timestamp.now();

  for (const entry of entries) {
    const objectRef = doc(db, 'rooms', roomId, 'objects', entry.id);
    batch.update(objectRef, { zIndex: entry.zIndex, updatedBy: userId, updatedAt: now });
  }

  await batch.commit();
}

// Update only the classification of an object
export async function updateObjectClassification(
  roomId: string,
  objectId: string,
  classification: string | null,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  const now = Timestamp.now();
  const update: Record<string, unknown> = { updatedBy: userId, updatedAt: now };
  if (classification === null) {
    update['classification'] = deleteField();
  } else {
    update['classification'] = classification;
  }
  await updateDoc(objectRef, update);
}

// Delete an object
export async function deleteObject(
  roomId: string,
  objectId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  await deleteDoc(objectRef);
}

// Subscribe to canvas objects changes (batched — all changes in a single callback)
export function subscribeToObjects(
  roomId: string,
  onChanges: (changes: { added: CanvasObject[]; modified: CanvasObject[]; removed: string[] }) => void
): Unsubscribe {
  const objectsRef = getObjectsRef(roomId);
  const q = query(objectsRef, orderBy('zIndex', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const changes = snapshot.docChanges();
    if (changes.length > 2) {
      console.warn(`[Perf] Firestore snapshot: ${changes.length} changes`);
    }
    const added: CanvasObject[] = [];
    const modified: CanvasObject[] = [];
    const removed: string[] = [];
    changes.forEach((change) => {
      const data = change.doc.data() as CanvasObject;
      if (change.type === 'added') added.push(data);
      else if (change.type === 'modified') modified.push(data);
      else if (change.type === 'removed') removed.push(change.doc.id);
    });
    onChanges({ added, modified, removed });
  }, (error) => {
    console.error('Firestore subscription error:', error);
  });
}

// Create a room if it doesn't exist, or add user to existing room
export async function ensureRoom(
  roomId: string,
  userId: string,
  roomName?: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const roomRef = doc(db, 'rooms', roomId);

  // Check if room exists
  const roomDoc = await getDoc(roomRef);

  if (!roomDoc.exists()) {
    // Create new room with creator as first member
    await setDoc(roomRef, {
      id: roomId,
      name: roomName || `Room ${roomId}`,
      createdBy: userId,
      createdAt: Timestamp.now(),
      members: [userId],
    });
  } else {
    // Room exists - add user as member if not already
    await setDoc(
      roomRef,
      {
        members: arrayUnion(userId),
      },
      { merge: true }
    );
  }
}
