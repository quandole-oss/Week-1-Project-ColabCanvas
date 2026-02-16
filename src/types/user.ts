export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  color: string;
}

export interface PresenceData {
  userId: string;
  userName: string;
  color: string;
  online: boolean;
  lastSeen: number;
}
