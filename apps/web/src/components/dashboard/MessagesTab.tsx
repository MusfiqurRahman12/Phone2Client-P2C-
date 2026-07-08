// apps/web/src/components/dashboard/MessagesTab.tsx

import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Send, MessageSquare, Loader2, User } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export default function MessagesTab({ socket }: { socket: any }) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  
  const [ownedNumbers, setOwnedNumbers] = useState<any[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState('');
  const [newContactNumber, setNewContactNumber] = useState('');
  
  const [messageBody, setMessageBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom of chat thread
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load owned numbers for sender selection
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
        console.error('Failed to load owned numbers for SMS:', err);
      }
    }
    loadNumbers();
  }, [activeWorkspace]);

  // Load conversations
  const fetchConversations = async (selectFirstId = false) => {
    if (!activeWorkspace) return;
    setIsLoadingConversations(true);
    try {
      const response = await api.get<any[]>('/conversations');
      setConversations(response);
      if (selectFirstId && response.length > 0) {
        setActiveConversationId(response[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Load messages for active conversation
  const fetchMessages = async (id: string) => {
    setIsLoadingMessages(true);
    try {
      const response = await api.get<any[]>(`/conversations/${id}/messages`);
      setMessages(response);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations(true);
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      // Mark as read locally
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c))
      );
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  // Listen to WebSocket events for real-time messages
  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (data: any) => {
      // 1. If message belongs to active thread, append it
      if (data.conversationId === activeConversationId) {
        setMessages((prev) => [...prev, data.message]);
      }
      
      // 2. Refresh conversation list to update previews and unread badges
      fetchConversations();
    });

    socket.on('message:status', (data: any) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
      );
    });

    return () => {
      socket.off('message:new');
      socket.off('message:status');
    };
  }, [socket, activeConversationId]);

  // Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim() || !selectedNumberId) return;

    let destinationNumber = '';
    if (activeConversationId) {
      const activeConv = conversations.find((c) => c.id === activeConversationId);
      destinationNumber = activeConv.externalNumber;
    } else if (newContactNumber.trim()) {
      destinationNumber = newContactNumber.trim();
    } else {
      return;
    }

    setIsSending(true);
    try {
      const sentMsg = await api.post<any>('/messages', {
        from_number_id: selectedNumberId,
        to_number: destinationNumber,
        body: messageBody.trim(),
      });

      // Clear composer
      setMessageBody('');
      setNewContactNumber('');

      // If we started a new conversation, fetch list and select it
      if (!activeConversationId) {
        await fetchConversations();
      } else {
        // Just append local message (or let socket handling do it)
        setMessages((prev) => {
          if (prev.some((m) => m.id === sentMsg.id)) return prev;
          return [...prev, sentMsg];
        });
      }
    } catch (err) {
      alert('Failed to send SMS: ' + (err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', borderTop: '1px solid var(--border-color)' }}>
      
      {/* Sidebar: Conversations */}
      <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
        
        {/* Create new thread control */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Sender Line</label>
            <select 
              className="form-input" 
              value={selectedNumberId} 
              onChange={(e) => setSelectedNumberId(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            >
              {ownedNumbers.map((n) => (
                <option key={n.id} value={n.id}>{n.number} ({n.friendlyName})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>New Chat Number</label>
            <input
              type="text"
              placeholder="+15559876543"
              className="form-input"
              value={newContactNumber}
              onChange={(e) => {
                setNewContactNumber(e.target.value);
                setActiveConversationId(null); // deselect current thread
              }}
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            />
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoadingConversations ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
              <Loader2 className="animate-spin" size={20} color="var(--accent-primary)" />
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No chats found.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setNewContactNumber('');
                  setActiveConversationId(c.id);
                }}
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  background: activeConversationId === c.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  borderLeft: activeConversationId === c.id ? '3px solid var(--accent-primary)' : 'none',
                  transition: 'var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.externalNumber}</span>
                  {c.unreadCount > 0 && (
                    <span style={{
                      background: 'var(--accent-primary)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-round)'
                    }}>{c.unreadCount}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.lastMessageBody || 'Empty conversation'}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>
                  {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString() : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.02)' }}>
        
        {/* Thread Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-round)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
            <User size={16} color="var(--text-secondary)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
              {activeConversationId 
                ? conversations.find((c) => c.id === activeConversationId)?.externalNumber 
                : newContactNumber || 'Select a chat'}
            </h3>
            {activeConversationId && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Line: {conversations.find((c) => c.id === activeConversationId)?.phoneNumber?.friendlyName}
              </span>
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoadingMessages ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
              <Loader2 className="animate-spin" size={24} color="var(--accent-primary)" />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <MessageSquare size={36} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
              Type a message below to start the conversation
            </div>
          ) : (
            messages.map((msg) => {
              const isOutbound = msg.direction === 'OUTBOUND';
              return (
                <div 
                  key={msg.id} 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOutbound ? 'flex-end' : 'flex-start',
                    maxWidth: '70%',
                    alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    borderTopRightRadius: isOutbound ? '2px' : 'var(--radius-md)',
                    borderTopLeftRadius: isOutbound ? 'var(--radius-md)' : '2px',
                    background: isOutbound ? 'var(--accent-gradient)' : 'var(--bg-tertiary)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    border: isOutbound ? 'none' : '1px solid var(--border-color)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    {msg.body}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    {isOutbound && (
                      <span style={{ 
                        color: msg.status === 'DELIVERED' ? 'var(--color-success)' : 
                               msg.status === 'FAILED' ? 'var(--color-error)' : 'var(--text-muted)'
                      }}>
                        • {msg.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Composer */}
        <form onSubmit={handleSend} style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)', display: 'flex', gap: '12px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type your SMS message..."
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            disabled={isSending || (!activeConversationId && !newContactNumber)}
            required
            style={{ height: '48px' }}
          />
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={isSending || !messageBody.trim() || (!activeConversationId && !newContactNumber)}
            style={{ width: '48px', height: '48px', padding: 0 }}
          >
            {isSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </form>

      </div>

    </div>
  );
}
