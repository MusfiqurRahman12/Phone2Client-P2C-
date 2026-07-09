// apps/web/src/hooks/useTelnyxWebRTC.ts

import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  startRingtone,
  startRingback,
  playConnectSound,
  playHangupSound,
  playDtmfTone,
  stopAllSounds,
} from '../utils/callSounds';

export interface CallSession {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'RINGING' | 'CONNECTED' | 'DISCONNECTED';
  phoneNumber: string;
}

export function useTelnyxWebRTC(onCallEnded?: () => void) {
  const [client, setClient] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const telnyxRtcRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  // Initialize WebRTC client
  useEffect(() => {
    let active = true;

    async function setupClient() {
      setIsConnecting(true);
      try {
        // 1. Fetch WebRTC token from our backend
        const data = await api.post<{ token: string }>('/calls/token');

        if (!active) return;

        // If it's a mock token, we don't load the real Telnyx SDK to avoid network failure
        if (data.token.startsWith('mock_')) {
          console.log('Mock Telnyx WebRTC token received. Running call simulator.');
          setClient({ isMock: true });
          setIsConnecting(false);
          return;
        }

        // 2. Lazy load the TelnyxRTC SDK client
        const { TelnyxRTC } = await import('@telnyx/webrtc');

        if (!active) return;

        const rtcClient = new TelnyxRTC({
          login_token: data.token,
        });

        rtcClient.on('telnyx.ready', () => {
          console.log('Telnyx WebRTC ready');
          setIsConnecting(false);
        });

        rtcClient.on('telnyx.error', (error) => {
          console.error('Telnyx WebRTC error:', error);
          setIsConnecting(false);
        });

        rtcClient.on('telnyx.notification', (notification) => {
          console.log('Telnyx WebRTC notification:', notification);
          
          if (notification.type === 'callUpdate') {
            const call = notification.call;
            if (!call) return;
            activeCallRef.current = call;

            if (call.state === 'ringing') {
              const direction = call.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND';
              setActiveCall({
                id: call.id || '',
                direction,
                status: 'RINGING',
                phoneNumber: call.options?.remoteCallerName || call.options?.remoteCallerNumber || 'Unknown',
              });
              // Play ringtone for inbound, ringback for outbound
              if (direction === 'INBOUND') {
                startRingtone();
              } else {
                startRingback();
              }
            } else if (call.state === 'active') {
              stopAllSounds();
              playConnectSound();
              setActiveCall((prev) => prev ? { ...prev, status: 'CONNECTED' } : null);
            } else if (call.state === 'destroy') {
              stopAllSounds();
              playHangupSound();
              setActiveCall(null);
              activeCallRef.current = null;
              if (onCallEnded) onCallEnded();
            }
          }
        });

        rtcClient.connect();
        telnyxRtcRef.current = rtcClient;
        setClient(rtcClient);
      } catch (error) {
        console.error('Failed to initialize Telnyx WebRTC SDK:', error);
        setIsConnecting(false);
        // Fall back to Mock client in case of local load/network errors
        setClient({ isMock: true });
      }
    }

    setupClient();

    return () => {
      active = false;
      if (telnyxRtcRef.current) {
        telnyxRtcRef.current.disconnect();
      }
    };
  }, []);

  // Outbound Dial
  const dial = (toNumber: string, fromNumberId: string) => {
    if (!client) return;

    if (client.isMock) {
      // Simulate dialing
      startRingback();
      setActiveCall({
        id: `mock_sess_${Math.random().toString(36).substring(7)}`,
        direction: 'OUTBOUND',
        status: 'RINGING',
        phoneNumber: toNumber,
      });

      // Simulate auto-answer after 2 seconds
      setTimeout(() => {
        setActiveCall((prev) => {
          if (prev && prev.status === 'RINGING') {
            stopAllSounds();
            playConnectSound();
            return { ...prev, status: 'CONNECTED' };
          }
          return prev;
        });
      }, 2000);
      return;
    }

    // Call API to register outbound call log
    api.post<{ id: string }>('/calls/outbound', {
      from_number_id: fromNumberId,
      to_number: toNumber,
    }).then(() => {
      // Initiate WebRTC call through browser SDK
      const newCall = client.newCall({
        destinationNumber: toNumber,
        audio: true,
        video: false,
      });
      activeCallRef.current = newCall;
    }).catch((err) => {
      console.error('Failed to place outbound call:', err);
    });
  };

  // Answer Inbound Call
  const answer = () => {
    if (client?.isMock) {
      stopAllSounds();
      playConnectSound();
      setActiveCall((prev) => prev ? { ...prev, status: 'CONNECTED' } : null);
      return;
    }

    if (activeCallRef.current) {
      activeCallRef.current.answer();
    }
  };

  // Hangup call
  const hangup = () => {
    stopAllSounds();
    playHangupSound();
    if (client?.isMock) {
      setActiveCall(null);
      if (onCallEnded) onCallEnded();
      return;
    }

    if (activeCallRef.current) {
      activeCallRef.current.hangup();
      setActiveCall(null);
      activeCallRef.current = null;
    }
  };

  const toggleMute = () => {
    if (client?.isMock) {
      setIsMuted(!isMuted);
      return;
    }

    if (activeCallRef.current) {
      if (isMuted) {
        activeCallRef.current.unmute();
      } else {
        activeCallRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  const sendDTMF = (digit: string) => {
    playDtmfTone();
    if (client?.isMock) {
      console.log(`Mock DTMF key sent: ${digit}`);
      return;
    }

    if (activeCallRef.current) {
      activeCallRef.current.sendDTMF(digit);
    }
  };

  return {
    isConnecting,
    activeCall,
    isMuted,
    dial,
    answer,
    hangup,
    toggleMute,
    sendDTMF,
    // Allows triggering inbound calls in mock mode (for testing UI)
    triggerMockInboundCall: (fromNumber: string) => {
      if (client?.isMock) {
        startRingtone();
        setActiveCall({
          id: `mock_sess_${Math.random().toString(36).substring(7)}`,
          direction: 'INBOUND',
          status: 'RINGING',
          phoneNumber: fromNumber,
        });
      }
    }
  };
}
