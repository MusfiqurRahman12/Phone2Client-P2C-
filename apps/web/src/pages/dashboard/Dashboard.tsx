// apps/web/src/pages/dashboard/Dashboard.tsx

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../../hooks/useWebSocket';
import DialerTab from '../../components/dashboard/DialerTab';
import MessagesTab from '../../components/dashboard/MessagesTab';
import NumbersTab from '../../components/dashboard/NumbersTab';
import { Phone, MessageSquare, Binary, LogOut, User, Building, ChevronDown } from 'lucide-react';

export default function Dashboard() {
  const { user, activeWorkspace, logout, switchWorkspace, isAuthenticated, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dialer' | 'messages' | 'numbers'>('dialer');
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  // Initialize global websocket connection (scans JWT internally)
  const socket = useWebSocket();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        Loading portal...
      </div>
    );
  }

  return (
    <div className="app-container" style={{ padding: '16px', gap: '16px' }}>
      
      {/* Sidebar navigation */}
      <nav aria-label="Main navigation" className="glass-panel" style={{
        width: '260px',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        height: '100%',
        zIndex: 2,
      }}>
        
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', padding: '0 8px' }}>
          <div style={{
            background: 'var(--accent-gradient)',
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#fff',
            boxShadow: '0 0 15px var(--accent-glow)'
          }}>
            P2C
          </div>
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>Phone2Client</span>
        </div>

        {/* Workspace Selector */}
        {activeWorkspace && (
          <div style={{ position: 'relative', marginBottom: '24px' }}>
            <button 
              aria-label="Switch workspace"
              aria-expanded={showWorkspaceMenu}
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                textAlign: 'left',
                transition: 'var(--transition-fast)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building size={16} color="var(--accent-secondary)" />
                <span style={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                  {activeWorkspace.name}
                </span>
              </div>
              <ChevronDown size={14} color="var(--text-secondary)" />
            </button>

            {showWorkspaceMenu && (
              <div className="glass-panel" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '100%',
                marginTop: '8px',
                zIndex: 10,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  Switch Workspace
                </div>
                {user?.workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setShowWorkspaceMenu(false);
                    }}
                    style={{
                      width: '100%',
                      background: activeWorkspace.id === ws.id ? 'rgba(255,255,255,0.03)' : 'transparent',
                      border: 'none',
                      color: activeWorkspace.id === ws.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                      padding: '10px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'block',
                      fontFamily: 'inherit'
                    }}
                  >
                    {ws.name} {activeWorkspace.id === ws.id && '✓'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button
            onClick={() => setActiveTab('dialer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              background: activeTab === 'dialer' ? 'var(--accent-gradient)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'dialer' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              color: activeTab === 'dialer' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 550,
              fontSize: '0.9rem',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'var(--transition-fast)',
              boxShadow: activeTab === 'dialer' ? '0 4px 12px var(--accent-glow)' : 'none'
            }}
          >
            <Phone size={18} />
            <span>Keypad Dialer</span>
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              background: activeTab === 'messages' ? 'var(--accent-gradient)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'messages' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              color: activeTab === 'messages' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 550,
              fontSize: '0.9rem',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'var(--transition-fast)',
              boxShadow: activeTab === 'messages' ? '0 4px 12px var(--accent-glow)' : 'none'
            }}
          >
            <MessageSquare size={18} />
            <span>SMS Messaging</span>
          </button>

          <button
            onClick={() => setActiveTab('numbers')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              background: activeTab === 'numbers' ? 'var(--accent-gradient)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'numbers' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              color: activeTab === 'numbers' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 550,
              fontSize: '0.9rem',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'var(--transition-fast)',
              boxShadow: activeTab === 'numbers' ? '0 4px 12px var(--accent-glow)' : 'none'
            }}
          >
            <Binary size={18} />
            <span>Active Numbers</span>
          </button>
        </div>

        {/* User Card & Logout */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-round)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={14} color="var(--text-secondary)" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.firstName} {user?.lastName}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.1)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-error)',
              cursor: 'pointer',
              fontWeight: 550,
              fontSize: '0.85rem',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'var(--transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>

      </nav>

      {/* Main Content Area */}
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 2 }}>
        
        {/* Top Header */}
        <header className="glass-panel" style={{
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          width: '100%',
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'Outfit' }}>
            {activeTab === 'dialer' && 'Keypad Dialer'}
            {activeTab === 'messages' && 'SMS Messaging'}
            {activeTab === 'numbers' && 'Number Management'}
          </h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              fontSize: '0.75rem',
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-secondary)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}>
              Tenant Mode: Row-Level Isolation
            </div>
          </div>
        </header>

        {/* Tab Render Box */}
        <main className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'dialer' && <DialerTab socket={socket} />}
          {activeTab === 'messages' && <MessagesTab socket={socket} />}
          {activeTab === 'numbers' && <NumbersTab />}
        </main>

      </div>

    </div>
  );
}
