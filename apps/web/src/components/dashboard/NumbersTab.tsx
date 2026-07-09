// apps/web/src/components/dashboard/NumbersTab.tsx

import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Search, Trash2, UserPlus, Loader2, PhoneCall } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export default function NumbersTab() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [ownedNumbers, setOwnedNumbers] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Search parameters
  const [areaCode, setAreaCode] = useState('');
  const [numType, setNumType] = useState<'local' | 'toll_free'>('local');
  
  const [isSearching, setIsSearching] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const [isLoadingOwned, setIsLoadingOwned] = useState(false);
  
  // Member assignment helper state
  const [members, setMembers] = useState<any[]>([]);
  const [assigningNumberId, setAssigningNumberId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');

  // Fetch owned numbers
  const fetchOwnedNumbers = async () => {
    if (!activeWorkspace) return;
    setIsLoadingOwned(true);
    try {
      const response = await api.get<any[]>('/phone-numbers');
      setOwnedNumbers(response);
    } catch (err) {
      console.error('Failed to load owned numbers:', err);
    } finally {
      setIsLoadingOwned(false);
    }
  };

  // Fetch workspace members
  const fetchMembers = async () => {
    if (!activeWorkspace) return;
    try {
      const response = await api.get<any[]>('/workspaces/me/members');
      setMembers(response);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  useEffect(() => {
    fetchOwnedNumbers();
    fetchMembers();
  }, [activeWorkspace]);

  // Search numbers on Telnyx
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setIsSearching(true);
    try {
      const response = await api.get<any[]>(
        `/phone-numbers/search?country_code=US&type=${numType}&area_code=${areaCode}`
      );
      setSearchResults(response);
    } catch (err) {
      console.error('Failed to search numbers:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Purchase number
  const handlePurchase = async (number: string) => {
    if (!activeWorkspace) return;
    setIsPurchasing(number);
    try {
      await api.post('/phone-numbers', {
        number,
        friendly_name: number.startsWith('+18') ? 'Toll Free Line' : 'Main Line',
      });
      // Clear results and reload owned
      setSearchResults((prev) => prev.filter((r) => r.number !== number));
      await fetchOwnedNumbers();
    } catch (err) {
      alert('Failed to purchase number: ' + (err as Error).message);
    } finally {
      setIsPurchasing(null);
    }
  };

  // Release number
  const handleRelease = async (id: string) => {
    if (!confirm('Are you sure you want to release this number? Telnyx billing will cease immediately.')) return;
    try {
      await api.delete(`/phone-numbers/${id}`);
      await fetchOwnedNumbers();
    } catch (err) {
      alert('Failed to release number: ' + (err as Error).message);
    }
  };

  // Assign member
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningNumberId || !selectedMemberId) return;
    try {
      await api.post(`/phone-numbers/${assigningNumberId}/assignments`, {
        member_id: selectedMemberId,
      });
      setAssigningNumberId(null);
      setSelectedMemberId('');
      await fetchOwnedNumbers();
    } catch (err) {
      alert('Failed to assign member: ' + (err as Error).message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: '100%', overflowY: 'auto', padding: '24px' }}>
      
      {/* Left Column: Search & Buy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <Search size={18} color="var(--accent-primary)" />
          Provision Numbers
        </h2>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>Number Type</label>
            <select 
              className="form-input" 
              value={numType} 
              onChange={(e: any) => setNumType(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.05)', height: '42px', fontSize: '0.85rem' }}
            >
              <option value="local">Local (US)</option>
              <option value="toll_free">Toll-Free</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>Area Code</label>
            <input
              type="text"
              placeholder="e.g. 415"
              className="form-input"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              maxLength={3}
              style={{ height: '42px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.05)' }}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '42px', padding: '0 20px', fontSize: '0.85rem' }} disabled={isSearching}>
            {isSearching ? <Loader2 className="animate-spin" size={14} /> : 'Search'}
          </button>
        </form>

        {/* Results */}
        <div style={{ flex: 1, minHeight: '300px', overflowY: 'auto' }}>
          {searchResults.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
              Search for available numbers above
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.map((item) => (
                <div 
                  key={item.number} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '14px 16px', 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid rgba(255,255,255,0.04)', 
                    borderRadius: 'var(--radius-sm)',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{item.friendlyName}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--accent-secondary)' }}>Voice</span> • <span style={{ color: 'var(--accent-secondary)' }}>SMS</span>
                    </div>
                  </div>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '6px 14px', fontSize: '0.75rem', background: 'var(--accent-gradient)' }}
                    onClick={() => handlePurchase(item.number)}
                    disabled={isPurchasing !== null}
                  >
                    {isPurchasing === item.number ? <Loader2 className="animate-spin" size={12} /> : 'Purchase'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Owned Numbers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '24px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <PhoneCall size={18} color="var(--accent-secondary)" />
          Active Numbers
        </h2>

        {assigningNumberId && (
          <form onSubmit={handleAssign} className="glass-panel" style={{ padding: '16px', border: '1px solid var(--accent-primary)', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Assign Phone Line to Member</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                className="form-input"
                value={selectedMemberId} 
                onChange={(e) => setSelectedMemberId(e.target.value)}
                required
                style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <option value="">Select a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.email})</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" style={{ padding: '0 16px', fontSize: '0.8rem' }}>Assign</button>
              <button type="button" className="btn btn-secondary" style={{ padding: '0 16px', fontSize: '0.8rem' }} onClick={() => setAssigningNumberId(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoadingOwned ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Loader2 className="animate-spin" size={20} color="var(--accent-secondary)" />
            </div>
          ) : ownedNumbers.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
              No numbers purchased yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ownedNumbers.map((num) => (
                <div 
                  key={num.id} 
                  style={{ 
                    padding: '16px', 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid rgba(255,255,255,0.04)', 
                    borderRadius: 'var(--radius-sm)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 750, fontSize: '1.05rem', color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{num.number}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{num.friendlyName} ({num.type})</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 10px', height: '34px', background: 'transparent' }}
                        title="Assign to member"
                        onClick={() => setAssigningNumberId(num.id)}
                      >
                        <UserPlus size={14} color="var(--text-secondary)" />
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '6px 10px', height: '34px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', color: 'var(--color-error)' }}
                        onClick={() => handleRelease(num.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Assignments List */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>Routing & Assignments</div>
                    {num.assignments.length === 0 ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Broadcast Mode (rings all workspace members)</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {num.assignments.map((asg: any) => (
                          <div 
                            key={asg.memberId} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.02)', 
                              padding: '4px 8px', 
                              borderRadius: 'var(--radius-sm)', 
                              border: '1px solid rgba(255,255,255,0.04)', 
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            <span>{asg.member.firstName} {asg.member.lastName}</span>
                            <Trash2 
                              size={11} 
                              color="var(--color-error)" 
                              style={{ cursor: 'pointer', marginLeft: '4px', opacity: 0.7 }}
                              onClick={() => {
                                if (confirm('Remove assignment?')) {
                                  api.delete(`/phone-numbers/${num.id}/assignments/${asg.memberId}`).then(fetchOwnedNumbers);
                                }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
