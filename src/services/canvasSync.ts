import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  arrayUnion,
  getDoc,
} from 'firebase/firestore';
import type { Unsubscribe, Firestore } from 'firebase/firestore';
import { db } from './firebase';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';

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

  const data: Partial<CanvasObject> = {
    id: objectId,
    type,
    props,
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

// Delete an object
export async function deleteObject(
  roomId: string,
  objectId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const objectRef = doc(db, 'rooms', roomId, 'objects', objectId);
  await deleteDoc(objectRef);
}

// Subscribe to canvas objects changes
export function subscribeToObjects(
  roomId: string,
  onAdd: (obj: CanvasObject) => void,
  onModify: (obj: CanvasObject) => void,
  onRemove: (objectId: string) => void
): Unsubscribe {
  const objectsRef = getObjectsRef(roomId);
  const q = query(objectsRef, orderBy('zIndex', 'asc'));

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = change.doc.data() as CanvasObject;

      if (change.type === 'added') {
        onAdd(data);
      } else if (change.type === 'modified') {
        onModify(data);
      } else if (change.type === 'removed') {
        onRemove(change.doc.id);
      }
    });
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
