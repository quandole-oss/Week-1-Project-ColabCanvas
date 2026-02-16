import { useEffect, useState, useRef } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import { setUserOnline, setUserOffline, subscribeToPresence } from '../services/presenceSync';
import type { PresenceData } from '../types';

interface UsePresenceOptions {
  roomId: string;
  odId: string;
  userName: string;
  userColor: string;
}

type PresenceMessage =
  | { type: 'user-online'; user: PresenceData }
  | { type: 'user-offline'; odId: string }
  | { type: 'presence-request' }
  | { type: 'presence-response'; user: PresenceData }
  | { type: 'heartbeat'; user: PresenceData };

export function usePresence({
  roomId,
  odId,
  userName,
  userColor,
}: UsePresenceOptions) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceData[]>([]);
  const isSetup = useRef(false);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  // Demo mode: use BroadcastChannel for presence sync
  useEffect(() => {
    if (!isFirebaseConfigured) {
      const getMyPresence = (): PresenceData => ({
        userId: odId,
        userName,
        color: userColor,
        online: true,
        lastSeen: Date.now(),
      });

      // Start with just current user
      setOnlineUsers([getMyPresence()]);

      const channel = new BroadcastChannel(`canvas-presence-${roomId}`);
      broadcastChannel.current = channel;

      // Update user's lastSeen timestamp
      const updateUserLastSeen = (user: PresenceData) => {
        setOnlineUsers((prev) => {
          if (user.userId === odId) return prev;
          const exists = prev.some((u) => u.userId === user.userId);
          if (exists) {
            return prev.map((u) =>
              u.userId === user.userId ? { ...user, lastSeen: Date.now() } : u
            );
          }
          return [...prev, { ...user, lastSeen: Date.now() }];
        });
      };

      channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
        const msg = event.data;

        if (msg.type === 'user-online' || msg.type === 'heartbeat') {
          updateUserLastSeen(msg.user);
        } else if (msg.type === 'user-offline') {
          setOnlineUsers((prev) =>
            prev.filter((u) => u.userId !== msg.odId)
          );
        } else if (msg.type === 'presence-request') {
          // Someone new is asking who's online
          channel.postMessage({
            type: 'presence-response',
            user: getMyPresence(),
          } as PresenceMessage);
        } else if (msg.type === 'presence-response') {
          updateUserLastSeen(msg.user);
        }
      };

      // Announce ourselves and request who's online
      channel.postMessage({ type: 'user-online', user: getMyPresence() } as PresenceMessage);
      channel.postMessage({ type: 'presence-request' } as PresenceMessage);

      // Send heartbeat every 3 seconds to keep presence alive
      const heartbeatInterval = setInterval(() => {
        channel.postMessage({ type: 'heartbeat', user: getMyPresence() } as PresenceMessage);
      }, 3000);

      // Clean up stale users every 3 seconds (users who haven't sent heartbeat in 6 seconds)
      const cleanupInterval = setInterval(() => {
        setOnlineUsers((prev) => {
          const now = Date.now();
          return prev.filter((u) => {
            // Keep current user
            if (u.userId === odId) return true;
            // Remove users who haven't been seen in 6 seconds
            return now - u.lastSeen < 6000;
          });
        });
      }, 3000);

      return () => {
        channel.postMessage({ type: 'user-offline', odId } as PresenceMessage);
        clearInterval(heartbeatInterval);
        clearInterval(cleanupInterval);
        channel.close();
        broadcastChannel.current = null;
      };
    }
  }, [roomId, odId, userName, userColor]);

  // Firebase mode: Set user as online and subscribe to presence changes
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    if (isSetup.current) return;
    isSetup.current = true;

    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      try {
        // Set user as online
        await setUserOnline(roomId, odId, userName, userColor);

        // Subscribe to presence changes
        unsubscribe = subscribeToPresence(roomId, (users) => {
          setOnlineUsers(users);
        });
      } catch (error) {
        console.warn('Presence setup failed:', error);
        // Fall back to showing just current user
        setOnlineUsers([{
          userId: odId,
          userName,
          color: userColor,
          online: true,
          lastSeen: Date.now(),
        }]);
      }
    };

    setup();

    // Clean up on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      try {
        setUserOffline(roomId, odId, userName, userColor);
      } catch (error) {
        console.warn('Presence cleanup failed:', error);
      }
    };
  }, [roomId, odId, userName, userColor]);

  return {
    onlineUsers,
  };
}
