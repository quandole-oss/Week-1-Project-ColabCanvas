import { useEffect, useState, useRef } from 'react';
import { onValue } from 'firebase/database';
import { isFirebaseConfigured } from '../services/firebase';
import { setUserOnline, subscribeToPresence, getConnectedRef } from '../services/presenceSync';
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
  const [isConnected, setIsConnected] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  // Demo mode: use BroadcastChannel for presence sync
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsConnected(true);
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
          channel.postMessage({
            type: 'presence-response',
            user: getMyPresence(),
          } as PresenceMessage);
        } else if (msg.type === 'presence-response') {
          updateUserLastSeen(msg.user);
        }
      };

      channel.postMessage({ type: 'user-online', user: getMyPresence() } as PresenceMessage);
      channel.postMessage({ type: 'presence-request' } as PresenceMessage);

      const heartbeatInterval = setInterval(() => {
        channel.postMessage({ type: 'heartbeat', user: getMyPresence() } as PresenceMessage);
      }, 3000);

      const cleanupInterval = setInterval(() => {
        setOnlineUsers((prev) => {
          const now = Date.now();
          return prev.filter((u) => {
            if (u.userId === odId) return true;
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

  // Firebase mode: persistent connection model.
  // - onDisconnect (server-side) handles cleanup — NO client-side setUserOffline in effect cleanup.
  // - .info/connected listener re-announces presence on every RTDB reconnect.
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Use console.error for all presence debug output (console.log is stripped in prod)
    console.error('[Presence] Firebase effect running. roomId:', roomId, 'userId:', odId, 'userName:', userName);

    let presenceUnsub: (() => void) | undefined;
    let connectedUnsub: (() => void) | undefined;

    // 1. Subscribe to presence list FIRST (so we see changes immediately)
    try {
      presenceUnsub = subscribeToPresence(roomId, (users) => {
        console.error('[Presence] Got users:', users.length, users.map(u => u.userName));
        setOnlineUsers(users);
      });
      console.error('[Presence] subscribeToPresence: OK');
    } catch (error) {
      console.error('[Presence] subscribeToPresence failed:', error);
      setDebugError('subscribeToPresence: ' + String(error));
    }

    // 2. Use .info/connected to detect RTDB connection state.
    //    Every time we (re)connect, announce presence.
    //    The server's onDisconnect handler (set up inside setUserOnline)
    //    automatically cleans up when we disconnect — no client cleanup needed.
    try {
      const connectedRef = getConnectedRef();
      console.error('[Presence] getConnectedRef: OK');
      connectedUnsub = onValue(connectedRef, (snap) => {
        const connected = snap.val() === true;
        console.error('[Presence] .info/connected:', connected);
        setIsConnected(connected);

        if (connected) {
          // We just connected (or reconnected). Announce presence.
          // onDisconnect is registered inside setUserOnline, so the server
          // will clean up automatically when we drop.
          setUserOnline(roomId, odId, userName, userColor)
            .then(() => console.error('[Presence] Announced online after connect'))
            .catch((err) => {
              console.error('[Presence] setUserOnline failed:', err);
              setDebugError('setUserOnline: ' + String(err));
            });
        }
      }, (error) => {
        console.error('[Presence] .info/connected listener error:', error);
        setDebugError('.info/connected error: ' + String(error));
      });
    } catch (error) {
      console.error('[Presence] .info/connected setup failed:', error);
      setDebugError('connectedRef setup: ' + String(error));
    }

    // 3. Re-announce when tab becomes visible (browser throttles background tabs)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.error('[Presence] Tab visible — re-announcing');
        setUserOnline(roomId, odId, userName, userColor).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cleanup: only tear down listeners.
    // Do NOT call setUserOffline — let onDisconnect handle it server-side.
    // This eliminates the race condition where cleanup's offline write
    // arrives at RTDB after the next setup's online write.
    return () => {
      console.error('[Presence] Cleaning up listeners (NOT writing offline)');
      document.removeEventListener('visibilitychange', handleVisibility);
      if (presenceUnsub) presenceUnsub();
      if (connectedUnsub) connectedUnsub();
    };
  }, [roomId, odId, userName, userColor]);

  return {
    onlineUsers,
    isConnected,
    debugError,
  };
}
