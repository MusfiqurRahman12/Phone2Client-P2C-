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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', height: '100%', overflowY: 'auto', padding: '24px' }}>
      
      {/* Left Column: Search & Buy */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={20} color="var(--accent-primary)" />
          Search & Buy Numbers
        </h2>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Number Type</label>
            <select 
              className="form-input" 
              value={numType} 
              onChange={(e: any) => setNumType(e.target.value)}
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', height: '45px' }}
            >
              <option value="local">Local (US)</option>
              <option value="toll_free">Toll-Free</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Area Code (Optional)</label>
            <input
              type="text"
              placeholder="e.g. 415"
              className="form-input"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              maxLength={3}
              style={{ height: '45px' }}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '45px', padding: '0 24px' }} disabled={isSearching}>
            {isSearching ? <Loader2 className="animate-spin" size={18} /> : 'Search'}
          </button>
        </form>

        {/* Results */}
        <div style={{ flex: 1, minHeight: '300px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          {searchResults.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Search for available numbers above
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {searchResults.map((item) => (
                <div key={item.number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{item.friendlyName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <span>Voice</span> • <span>SMS</span>
                    </div>
                  </div>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => handlePurchase(item.number)}
                    disabled={isPurchasing !== null}
                  >
                    {isPurchasing === item.number ? <Loader2 className="animate-spin" size={14} /> : 'Purchase'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Owned Numbers */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PhoneCall size={20} color="var(--accent-secondary)" />
          Active Workspace Numbers
        </h2>

        {assigningNumberId && (
          <form onSubmit={handleAssign} className="glass-panel" style={{ padding: '16px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-primary)' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Assign Phone Line to Member</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              <select 
                className="form-input"
                value={selectedMemberId} 
                onChange={(e) => setSelectedMemberId(e.target.value)}
                required
              >
                <option value="">Select a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.email})</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">Assign</button>
              <button type="button" className="btn btn-secondary" onClick={() => setAssigningNumberId(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          {isLoadingOwned ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Loader2 className="animate-spin" size={24} color="var(--accent-primary)" />
            </div>
          ) : ownedNumbers.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No numbers purchased yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ownedNumbers.map((num) => (
                <div key={num.id} style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{num.number}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{num.friendlyName} ({num.type})</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 10px' }}
                        title="Assign to member"
                        onClick={() => setAssigningNumberId(num.id)}
                      >
                        <UserPlus size={16} />
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-error)' }}
                        onClick={() => handleRelease(num.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Assignments List */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Assigned Members:</div>
                    {num.assignments.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Unassigned (rings all members by default)</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {num.assignments.map((asg: any) => (
                          <div 
                            key={asg.memberId} 
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                          >
                            <span>{asg.member.firstName} {asg.member.lastName}</span>
                            <Trash2 
                              size={12} 
                              color="var(--color-error)" 
                              style={{ cursor: 'pointer' }}
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
