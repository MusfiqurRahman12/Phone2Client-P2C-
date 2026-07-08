// apps/web/src/hooks/useWebSocket.ts

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';

interface WebSocketCallbacks {
  onIncomingCall?: (call: any) => void;
  onCallStateChange?: (state: any) => void;
  onNewMessage?: (msg: any) => void;
  onMessageStatusChange?: (status: any) => void;
}

export function useWebSocket(callbacks: WebSocketCallbacks = {}) {
  const socketRef = useRef<Socket | null>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Read callbacks into a ref so they can be re-bound without re-running the effect
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const token = localStorage.getItem('p2c_access_token');
    
    // Connect to local dev server (proxied automatically via vite config proxy)
    const socket = io({
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Socket.io disconnected');
    });

    // Binding real-time telephony webhooks enqueued events
    socket.on('call:incoming', (data) => {
      if (callbacksRef.current.onIncomingCall) {
        callbacksRef.current.onIncomingCall(data);
      }
    });

    socket.on('call:state-change', (data) => {
      if (callbacksRef.current.onCallStateChange) {
        callbacksRef.current.onCallStateChange(data);
      }
    });

    socket.on('message:new', (data) => {
      if (callbacksRef.current.onNewMessage) {
        callbacksRef.current.onNewMessage(data);
      }
    });

    socket.on('message:status', (data) => {
      if (callbacksRef.current.onMessageStatusChange) {
        callbacksRef.current.onMessageStatusChange(data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  return socketRef.current;
}
