// apps/web/src/components/dashboard/DialerTab.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { Phone, PhoneOff, MicOff, Mic, Loader2, Volume2, History, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { playHaptic } from '../../utils/callSounds';

export default function DialerTab({ socket, webrtc }: { socket: any; webrtc: any }) {
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
  } = webrtc;

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

  // Fallback polling every 30s — catches inbound calls where Render was
  // asleep when Telnyx fired the webhook (free-tier cold start problem)
  useEffect(() => {
    if (!activeWorkspace) return;
    const interval = setInterval(() => {
      if (!activeCall) { // don't poll during an active call
        fetchCallHistory();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeWorkspace, activeCall, fetchCallHistory]);

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
    <div className="dialer-grid">
      
      {/* Dialer Control Center */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* Microphone permission warning */}
        {micPermission === 'denied' && (
          <div style={{
            width: '100%',
            maxWidth: '320px',
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            color: '#f87171',
            textAlign: 'center',
            lineHeight: '1.5'
          }}>
            🎙️ <strong>Microphone access denied.</strong><br />
            Please click the lock icon in your browser address bar and allow microphone access, then refresh the page.
          </div>
        )}
        
        {/* Caller ID selector */}
        <div style={{ width: '100%', maxWidth: '280px', marginBottom: '24px' }}>
          <label htmlFor="caller-id-select" style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'center' }}>
            Outbound Caller ID
          </label>
          <select 
            id="caller-id-select"
            className="form-input" 
            aria-label="Select outbound caller ID number"
            value={selectedNumberId} 
            onChange={(e) => setSelectedNumberId(e.target.value)}
            disabled={activeCall !== null}
            style={{ textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.05)' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-secondary)', fontSize: '0.8rem', marginBottom: '16px', fontWeight: 500 }}>
            <Loader2 className="animate-spin" size={14} />
            Connecting WebRTC Gateway...
          </div>
        )}

        {/* Dial Display */}
        <div style={{ width: '100%', maxWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            className="form-input"
            value={dialNumber}
            onChange={(e) => setDialNumber(e.target.value)}
            placeholder="Enter phone number"
            disabled={activeCall !== null}
            style={{ 
              textAlign: 'center', 
              fontSize: '1.25rem', 
              letterSpacing: '0.08em', 
              height: '44px',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid rgba(255,255,255,0.06)',
              borderRadius: 0,
              padding: '0 8px'
            }}
          />
          {!activeCall && dialNumber && (
            <button 
              className="btn btn-secondary" 
              onClick={clearNumber} 
              style={{ height: '40px', padding: '0 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Active Call UI or Keypad */}
        {activeCall ? (
          <div className="glass-panel" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '24px', 
            padding: '32px 24px', 
            width: '100%', 
            maxWidth: '300px',
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div style={{ 
                fontSize: '0.7rem', 
                textTransform: 'uppercase', 
                letterSpacing: '0.2em', 
                fontWeight: 700,
                color: activeCall.status === 'CONNECTED' ? 'var(--color-success)' : 'var(--color-warning)',
                background: activeCall.status === 'CONNECTED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)'
              }}>
                {activeCall.status === 'CONNECTED' ? 'In Call' : 'Connecting...'}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '6px' }}>
                {activeCall.direction} LINE
              </div>
            </div>
            
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'Outfit', color: 'var(--text-primary)' }}>
              {activeCall.phoneNumber}
            </div>

            {/* Premium Sound wave logic */}
            {activeCall.status === 'CONNECTED' && (
              <div className="audio-wave">
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
              </div>
            )}
            
            {/* Call State Controls */}
            {activeCall.status === 'RINGING' && activeCall.direction === 'INBOUND' ? (
              <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
                <button className="btn btn-primary" onClick={answer} style={{ background: 'var(--color-success)', flex: 1 }}>
                  <Phone size={16} /> Answer
                </button>
                <button className="btn btn-danger" onClick={hangup} style={{ flex: 1 }}>
                  <PhoneOff size={16} /> Decline
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <button 
                  className="btn" 
                  onClick={toggleMute}
                  style={{ 
                    background: isMuted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)', 
                    borderColor: isMuted ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-round)',
                    width: '48px',
                    height: '48px',
                    padding: 0
                  }}
                >
                  {isMuted ? <MicOff size={18} color="var(--color-error)" /> : <Mic size={18} color="var(--text-secondary)" />}
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={hangup} 
                  style={{ borderRadius: 'var(--radius-round)', width: '56px', height: '56px', padding: 0 }}
                >
                  <PhoneOff size={22} />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Circular Hollow Dialpad */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '240px' }}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['*', '0', '#']
            ].map((row, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                {row.map((char) => (
                  <button
                    key={char}
                    onMouseDown={() => handleButtonPressStart(char)}
                    onMouseUp={() => handleButtonPressEnd(char)}
                    onMouseLeave={(e) => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.03)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onTouchStart={() => handleButtonPressStart(char)}
                    onTouchEnd={() => handleButtonPressEnd(char)}
                    style={{
                      flex: 1,
                      aspectRatio: '1',
                      height: '50px',
                      borderRadius: 'var(--radius-round)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: 'var(--text-primary)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      fontSize: '1.15rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: '1',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.boxShadow = '0 0 12px var(--accent-glow)';
                      e.currentTarget.style.transform = 'scale(1.08)';
                    }}
                  >
                    <div>{char}</div>
                    {char === '0' && <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '1px', fontWeight: 400 }}>+</div>}
                  </button>
                ))}
              </div>
            ))}

            {/* Place Call Action */}
            <button 
              className="btn btn-primary" 
              onClick={handleCall}
              disabled={!dialNumber || ownedNumbers.length === 0}
              style={{ height: '44px', marginTop: '12px', background: 'var(--accent-gradient)', fontSize: '0.9rem' }}
            >
              <Phone size={16} /> Initiate Connection
            </button>
          </div>
        )}

        {/* Developer Sandbox Controls */}
        {!activeCall && ownedNumbers.length > 0 && (
          <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', width: '100%', maxWidth: '240px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>DX Testing Center</div>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.75rem', padding: '6px 14px', background: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }}
              onClick={() => triggerMockInboundCall('+15559998888')}
            >
              Simulate Inbound
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Call History & Webhook Logs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '24px', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setRightTab('history')}
              style={{
                background: 'none',
                border: 'none',
                color: rightTab === 'history' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: 700,
                fontFamily: 'Outfit',
                fontSize: '0.95rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: rightTab === 'history' ? '2px solid var(--accent-secondary)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'var(--transition-fast)'
              }}
            >
              <History size={16} />
              Logs
            </button>
            <button 
              onClick={() => setRightTab('webhooks')}
              style={{
                background: 'none',
                border: 'none',
                color: rightTab === 'webhooks' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: 700,
                fontFamily: 'Outfit',
                fontSize: '0.95rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: rightTab === 'webhooks' ? '2px solid var(--accent-secondary)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'var(--transition-fast)'
              }}
            >
              <Volume2 size={16} />
              Telemetry
            </button>
          </div>
          {rightTab === 'history' && (
            <button 
              onClick={fetchCallHistory} 
              disabled={isLoadingHistory}
              aria-label="Refresh call history"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
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

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {rightTab === 'history' ? (
            isLoadingHistory && callHistory.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : callHistory.length === 0 ? (
              <div style={{ padding: '36px 16px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', lineHeight: '1.8' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⚡</div>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>No call sessions</div>
                <div>Outbound and inbound session records will register here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                        padding: '12px 14px', 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid rgba(255,255,255,0.04)', 
                        borderRadius: 'var(--radius-sm)',
                        transition: 'var(--transition-fast)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: 'var(--radius-round)',
                          background: isOutbound ? 'var(--accent-secondary)' : 'var(--color-success)',
                          boxShadow: isOutbound ? '0 0 6px var(--accent-secondary)' : '0 0 6px var(--color-success)'
                        }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                            {displayNum}
                            <button 
                              onClick={() => setDialNumber(displayNum)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-secondary)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'inline-flex',
                                opacity: 0.6,
                                transition: 'opacity 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                              title="Click to dial"
                            >
                              <Phone size={11} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{dateStr}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: call.status === 'COMPLETED' ? 'var(--text-muted)' : 
                                 call.status === 'MISSED' ? 'var(--color-error)' : 
                                 call.status === 'CONNECTED' ? 'var(--color-success)' : 'var(--color-warning)'
                        }}>
                          {call.status}
                        </div>
                        {call.durationSeconds !== null && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
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
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              padding: '16px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-secondary)',
              lineHeight: '1.6',
              height: '350px',
              overflowY: 'auto'
            }}>
              {realTimeWebhookLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>Waiting for call telemetry events...</div>
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
