// apps/web/src/components/dashboard/DialerTab.tsx

import { useState, useEffect } from 'react';
import { useTelnyxWebRTC } from '../../hooks/useTelnyxWebRTC';
import { api } from '../../services/api';
import { Phone, PhoneOff, MicOff, Mic, Loader2, Volume2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export default function DialerTab({ socket }: { socket: any }) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [ownedNumbers, setOwnedNumbers] = useState<any[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState('');
  const [dialNumber, setDialNumber] = useState('');
  const [realTimeWebhookLogs, setRealTimeWebhookLogs] = useState<string[]>([]);

  const {
    isConnecting,
    activeCall,
    isMuted,
    dial,
    answer,
    hangup,
    toggleMute,
    sendDTMF,
    triggerMockInboundCall
  } = useTelnyxWebRTC();

  // Load owned numbers for Caller ID selection
  useEffect(() => {
    async function loadNumbers() {
      if (!activeWorkspace) return;
      try {
        const response = await api.get<{ data: any[] }>('/phone-numbers');
        const activeNums = response.data.filter((n) => n.status === 'ACTIVE');
        setOwnedNumbers(activeNums);
        if (activeNums.length > 0) {
          setSelectedNumberId(activeNums[0].id);
        }
      } catch (err) {
        console.error('Failed to load owned numbers for dialer:', err);
      }
    }
    loadNumbers();
  }, [activeWorkspace]);

  // Bind real-time webhook event log listeners to display DX logs
  useEffect(() => {
    if (!socket) return;

    const logWebhook = (msg: string) => {
      setRealTimeWebhookLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev.slice(0, 19)
      ]);
    };

    socket.on('call:incoming', (data: any) => {
      logWebhook(`Incoming Call Alert: From ${data.fromNumber} to ${data.toNumber}`);
    });

    socket.on('call:state-change', (data: any) => {
      logWebhook(`Call State Change: Session ${data.providerCallId.substring(0, 8)} is now ${data.status}`);
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:state-change');
    };
  }, [socket]);

  const handleKeyPress = (char: string) => {
    setDialNumber((prev) => prev + char);
    if (activeCall && activeCall.status === 'CONNECTED') {
      sendDTMF(char);
    }
  };

  const handleCall = () => {
    if (!dialNumber || !selectedNumberId) return;
    dial(dialNumber, selectedNumberId);
  };

  const clearNumber = () => {
    setDialNumber('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', height: '100%', padding: '24px' }}>
      
      {/* Dialer Control Center */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* Caller ID selector */}
        <div style={{ width: '100%', maxWidth: '280px', marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'center' }}>
            Outbound Caller ID (Your purchased numbers)
          </label>
          <select 
            className="form-input" 
            value={selectedNumberId} 
            onChange={(e) => setSelectedNumberId(e.target.value)}
            disabled={activeCall !== null}
            style={{ textAlign: 'center' }}
          >
            {ownedNumbers.length === 0 ? (
              <option value="">No numbers purchased</option>
            ) : (
              ownedNumbers.map((n) => (
                <option key={n.id} value={n.id}>{n.number} - {n.friendlyName}</option>
              ))
            )}
          </select>
        </div>

        {/* Status indicator */}
        {isConnecting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '0.85rem', marginBottom: '16px' }}>
            <Loader2 className="animate-spin" size={16} />
            Connecting to Telnyx WebRTC Gateway...
          </div>
        )}

        {/* Dial Display */}
        <div style={{ width: '100%', maxWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <input
            type="text"
            className="form-input"
            value={dialNumber}
            onChange={(e) => setDialNumber(e.target.value)}
            placeholder="Enter destination phone number"
            disabled={activeCall !== null}
            style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.05em', height: '54px' }}
          />
          {!activeCall && dialNumber && (
            <button className="btn btn-secondary" onClick={clearNumber} style={{ height: '54px' }}>Clear</button>
          )}
        </div>

        {/* Active Call UI or Keypad */}
        {activeCall ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.01)', width: '100%', maxWidth: '320px' }}>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: activeCall.status === 'CONNECTED' ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {activeCall.status} ({activeCall.direction})
            </div>
            
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{activeCall.phoneNumber}</div>
            
            {/* Call State Controls */}
            {activeCall.status === 'RINGING' && activeCall.direction === 'INBOUND' ? (
              <div style={{ display: 'flex', gap: '16px' }}>
                <button className="btn btn-primary" onClick={answer} style={{ background: 'var(--color-success)', width: '100px' }}>
                  <Phone size={18} /> Answer
                </button>
                <button className="btn btn-danger" onClick={hangup} style={{ width: '100px' }}>
                  <PhoneOff size={18} /> Reject
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '16px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={toggleMute}
                  style={{ background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'none', borderColor: isMuted ? 'var(--color-error)' : 'var(--border-color)' }}
                >
                  {isMuted ? <MicOff size={20} color="var(--color-error)" /> : <Mic size={20} />}
                </button>
                <button className="btn btn-danger" onClick={hangup} style={{ borderRadius: 'var(--radius-round)', width: '48px', height: '48px', padding: 0 }}>
                  <PhoneOff size={20} />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Keypad */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '240px' }}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['*', '0', '#']
            ].map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                {row.map((char) => (
                  <button
                    key={char}
                    onClick={() => handleKeyPress(char)}
                    style={{
                      flex: 1,
                      height: '54px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      fontSize: '1.2rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    {char}
                  </button>
                ))}
              </div>
            ))}

            {/* Place Call Action */}
            <button 
              className="btn btn-primary" 
              onClick={handleCall}
              disabled={!dialNumber || ownedNumbers.length === 0}
              style={{ height: '54px', marginTop: '16px', background: 'var(--color-success)' }}
            >
              <Phone size={20} /> Call Number
            </button>
          </div>
        )}

        {/* Developer Sandbox Controls */}
        {!activeCall && ownedNumbers.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px dashed var(--border-color)', paddingTop: '20px', width: '100%', maxWidth: '280px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Local DX Sandbox</div>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              onClick={() => triggerMockInboundCall('+15559998888')}
            >
              Simulate Inbound Call
            </button>
          </div>
        )}
      </div>

      {/* Right Column: DX Real-Time Webhook Logs */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Volume2 size={18} color="var(--accent-secondary)" />
          Real-time Event Logs (Webhooks)
        </h3>
        <div style={{
          flex: 1,
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          padding: '16px',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          overflowY: 'auto',
          color: 'var(--color-success)',
          lineHeight: '1.6'
        }}>
          {realTimeWebhookLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Waiting for call actions or webhook events...</div>
          ) : (
            realTimeWebhookLogs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '4px' }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
