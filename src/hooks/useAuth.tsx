import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../services/firebase';
import type { User } from '../types';
import { getRandomUserColor } from '../utils';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signInAsDemo: (name: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Store user colors in localStorage to persist across sessions
const getUserColor = (uid: string): string => {
  const storedColor = localStorage.getItem(`user_color_${uid}`);
  if (storedColor) return storedColor;

  const newColor = getRandomUserColor();
  localStorage.setItem(`user_color_${uid}`, newColor);
  return newColor;
};

const firebaseUserToUser = (fbUser: FirebaseUser): User => ({
  uid: fbUser.uid,
  email: fbUser.email,
  displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Anonymous',
  photoURL: fbUser.photoURL,
  color: getUserColor(fbUser.uid),
});

// Create a demo user
const createDemoUser = (name: string): User => {
  const odId = `demo_${Date.now()}`;
  return {
    uid: odId,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@demo.local`,
    displayName: name,
    photoURL: null,
    color: getUserColor(odId),
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(!isFirebaseConfigured);

  useEffect(() => {
    // If Firebase is not configured, stop loading immediately
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setUser(firebaseUserToUser(fbUser));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error('Firebase not configured');
    }
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) {
      throw new Error('Firebase not configured');
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    if (!auth) {
      throw new Error('Firebase not configured');
    }
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    await updateProfile(credential.user, { displayName });
    setUser(firebaseUserToUser(credential.user));
  };

  const signOut = async () => {
    if (isDemo) {
      setUser(null);
      return;
    }
    if (auth) {
      await firebaseSignOut(auth);
    }
  };

  const signInAsDemo = (name: string) => {
    const demoUser = createDemoUser(name);
    setUser(demoUser);
    setIsDemo(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemo,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        signInAsDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
