// apps/web/src/components/dashboard/DialerTab.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTelnyxWebRTC } from '../../hooks/useTelnyxWebRTC';
import { api } from '../../services/api';
import { Phone, PhoneOff, MicOff, Mic, Loader2, Volume2, History, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { playHaptic } from '../../utils/callSounds';

export default function DialerTab({ socket }: { socket: any }) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [ownedNumbers, setOwnedNumbers] = useState<any[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState('');
  const [dialNumber, setDialNumber] = useState('');
  const [realTimeWebhookLogs, setRealTimeWebhookLogs] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<'history' | 'webhooks'>('history');
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const {
    isConnecting,
    micPermission,
    activeCall,
    isMuted,
    dial,
    answer,
    hangup,
    toggleMute,
    sendDTMF,
    triggerMockInboundCall
  } = useTelnyxWebRTC();

  const fetchCallHistory = useCallback(async () => {
    if (!activeWorkspace) return;
    setIsLoadingHistory(true);
    try {
      const response = await api.get<any[]>('/calls/history');
      setCallHistory(response);
    } catch (err) {
      console.error('Failed to load call history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeWorkspace]);

  // Load owned numbers for Caller ID selection and call history
  useEffect(() => {
    async function loadNumbers() {
      if (!activeWorkspace) return;
      try {
        const response = await api.get<any[]>('/phone-numbers');
        const activeNums = response.filter((n) => n.status === 'ACTIVE');
        setOwnedNumbers(activeNums);
        if (activeNums.length > 0) {
          setSelectedNumberId(activeNums[0].id);
        }
      } catch (err) {
        console.error('Failed to load owned numbers for dialer:', err);
      }
    }
    loadNumbers();
    fetchCallHistory();
  }, [activeWorkspace, fetchCallHistory]);

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
      fetchCallHistory();
    });

    socket.on('call:state-change', (data: any) => {
      logWebhook(`Call State Change: Session ${data.providerCallId?.substring(0, 8) || ''} is now ${data.status}`);
      fetchCallHistory();
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:state-change');
    };
  }, [socket, fetchCallHistory]);

  // Refresh history when a call ends (give backend 2s to process the webhook)
  const prevActiveCallRef = useRef<any>(null);
  useEffect(() => {
    if (prevActiveCallRef.current && !activeCall) {
      // Call just ended — wait for webhook processor then refresh
      setTimeout(() => fetchCallHistory(), 2000);
      setTimeout(() => fetchCallHistory(), 5000); // second attempt in case Render is slow
    }
    prevActiveCallRef.current = activeCall;
  }, [activeCall, fetchCallHistory]);

  const longPressTimer = useRef<any>(null);
  const isLongPress = useRef(false);

  const handleButtonPressStart = (char: string) => {
    isLongPress.current = false;
    if (char === '0') {
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        playHaptic(60); // longer buzz for long-press '+'
        setDialNumber((prev) => prev + '+');
      }, 600); // 600ms hold
    }
  };

  const handleButtonPressEnd = (char: string) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }

    playHaptic(30); // short tap buzz
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
        
        {/* Microphone permission warning */}
        {micPermission === 'denied' && (
          <div style={{
            width: '100%',
            maxWidth: '320px',
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            color: '#f87171',
            textAlign: 'center',
            lineHeight: '1.5'
          }}>
            🎙️ <strong>Microphone access denied.</strong><br />
            Please click the 🔒 lock icon in your browser address bar and allow microphone access, then refresh the page.
          </div>
        )}
        
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
                    onMouseDown={() => handleButtonPressStart(char)}
                    onMouseUp={() => handleButtonPressEnd(char)}
                    onMouseLeave={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                    }}
                    onTouchStart={() => handleButtonPressStart(char)}
                    onTouchEnd={() => handleButtonPressEnd(char)}
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
                      transition: 'var(--transition-fast)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: '1'
                    }}
                  >
                    <div>{char}</div>
                    {char === '0' && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>+</div>}
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

      {/* Right Column: Call History & Webhook Logs */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setRightTab('history')}
              style={{
                background: 'none',
                border: 'none',
                color: rightTab === 'history' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: rightTab === 'history' ? '2px solid var(--accent-primary)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <History size={16} />
              Call History
            </button>
            <button 
              onClick={() => setRightTab('webhooks')}
              style={{
                background: 'none',
                border: 'none',
                color: rightTab === 'webhooks' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: rightTab === 'webhooks' ? '2px solid var(--accent-primary)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Volume2 size={16} />
              Real-time Logs
            </button>
          </div>
          {rightTab === 'history' && (
            <button 
              onClick={fetchCallHistory} 
              disabled={isLoadingHistory}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
              }}
            >
              <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rightTab === 'history' ? (
            isLoadingHistory && callHistory.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : callHistory.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', lineHeight: '1.8' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>No calls yet</div>
                <div>Calls appear here after they end.<br />
                History refreshes automatically after each call.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {callHistory.map((call) => {
                  const isOutbound = call.direction === 'OUTBOUND';
                  const displayNum = isOutbound ? call.toNumber : call.fromNumber;
                  const dateStr = new Date(call.startedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  return (
                    <div 
                      key={call.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '12px 16px', 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 'var(--radius-sm)',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-round)',
                          background: isOutbound ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isOutbound ? 'var(--color-info)' : 'var(--color-success)'
                        }}>
                          {isOutbound ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {displayNum}
                            <button 
                              onClick={() => setDialNumber(displayNum)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-primary)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'inline-flex'
                              }}
                              title="Click to dial"
                            >
                              <Phone size={12} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dateStr}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: call.status === 'COMPLETED' ? 'var(--text-secondary)' : 
                                 call.status === 'MISSED' ? 'var(--color-error)' : 
                                 call.status === 'CONNECTED' ? 'var(--color-success)' : 'var(--color-warning)'
                        }}>
                          {call.status}
                        </div>
                        {call.durationSeconds !== null && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {call.durationSeconds >= 60 ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : `${call.durationSeconds}s`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              padding: '16px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-success)',
              lineHeight: '1.6',
              height: '350px',
              overflowY: 'auto'
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
          )}
        </div>
      </div>
    </div>
  );
}
