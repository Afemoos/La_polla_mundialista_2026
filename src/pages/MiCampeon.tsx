import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCampeonPick, saveUserPick, getTournamentTeams, getUserProfile } from '../services/firestore';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CampeonPick, WorldCupTeam, UserProfile } from '../types/firestore';
import { Crown, Save, ChevronDown } from 'lucide-react';

export default function MiCampeon() {
  const { currentUser } = useAuth() || {};
  const [pick, setPick] = useState<CampeonPick | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teams, setTeams] = useState<WorldCupTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<WorldCupTeam | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    loadData();
    async function loadData() {
      try {
        const [p, pr, t] = await Promise.all([
          getCampeonPick(currentUser!.uid, 'world_cup_2026'),
          getUserProfile(currentUser!.uid),
          getTournamentTeams('world_cup_2026'),
        ]);
        setPick(p);
        setProfile(pr);
        setTeams(t.sort((a, b) => a.name.localeCompare(b.name)));
        if (p?.teamApiId && t.length > 0) {
          const found = t.find(team => team.apiId === p.teamApiId);
          if (found) setSelectedTeam(found);
        }
      } catch (e: any) {
        setError('Error al cargar: ' + (e?.message || ''));
      }
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    if (!currentUser || !selectedTeam) return;
    setSaving(true);
    setError('');
    const alreadyPaid = profile?.paidFeatures?.includes('campeon');
    try {
      await saveUserPick(currentUser.uid, 'world_cup_2026', 'campeon', {
        teamApiId: selectedTeam.apiId,
        teamName: selectedTeam.name,
        teamCode: selectedTeam.code,
        teamLogo: selectedTeam.logo,
      }, alreadyPaid ? undefined : { amount: 10 });
      if (!alreadyPaid) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'profile', 'data'), {
          paidFeatures: arrayUnion('campeon')
        });
      }
      setPick({
        teamApiId: selectedTeam.apiId,
        teamName: selectedTeam.name,
        teamCode: selectedTeam.code,
        teamLogo: selectedTeam.logo,
        result: null,
        createdAt: null as any,
        deletedAt: null,
      });
    } catch {
      setError('Error al guardar');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="page-center"><div className="spinner" /></div>;
  }

  return (
    <div className="page-center">
      <div className="glass-card" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Crown size={24} color="var(--primary)" /> ¿Quién será el campeón?
        </h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          10 tokens — selecciona el equipo que crees que ganará el Mundial 2026
        </p>

        {pick && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-success-bg)', borderRadius: '12px', border: '1px solid var(--color-success)' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Tu predicción actual</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <img src={pick.teamLogo} alt="" style={{ width: '36px', height: '36px' }} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{pick.teamName}</span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selecciona un equipo
          </label>

          {/* Custom dropdown with flags */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0.7rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--glass-border)',
                background: 'var(--input-bg)',
                color: selectedTeam ? 'var(--text-main)' : 'var(--text-muted)',
                fontSize: '1rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {selectedTeam ? (
                <>
                  <img src={selectedTeam.logo} alt="" style={{ width: '24px', height: '24px' }} />
                  <span>{selectedTeam.name}</span>
                </>
              ) : (
                <span>-- Selecciona --</span>
              )}
              <ChevronDown size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                marginTop: '4px',
                maxHeight: '280px',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {teams.map(t => {
                  const isSel = selectedTeam?.apiId === t.apiId;
                  return (
                    <button
                      key={t.apiId}
                      onClick={() => { setSelectedTeam(t); setDropdownOpen(false); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '0.6rem 1rem',
                        border: 'none',
                        borderBottom: '1px solid var(--glass-border)',
                        background: isSel ? 'var(--color-warning-bg)' : 'transparent',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = isSel ? 'var(--color-warning-bg)' : 'transparent')}
                    >
                      <img src={t.logo} alt="" style={{ width: '22px', height: '22px' }} />
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selectedTeam && !pick && (
          <div style={{ marginBottom: '1.5rem', padding: '1.2rem', background: 'var(--color-warning-bg)', borderRadius: '12px', border: '1px solid var(--primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1rem' }}>
              <img src={selectedTeam.logo} alt="" style={{ width: '48px', height: '48px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{selectedTeam.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selectedTeam.country} · {selectedTeam.code}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-main)' }}>Fundación:</strong> {selectedTeam.founded || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Grupo:</strong> {selectedTeam.group}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Estadio:</strong> {selectedTeam.venue?.name || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Ciudad:</strong> {selectedTeam.venue?.city || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Capacidad:</strong> {selectedTeam.venue?.capacity?.toLocaleString() || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Superficie:</strong> {selectedTeam.venue?.surface || 'N/A'}</div>
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={!selectedTeam || saving}
          className="glass-btn primary"
          style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Save size={18} />
          {profile?.paidFeatures?.includes('campeon') ? 'Actualizar' : 'Guardar (10 tokens)'}
        </button>
      </div>
    </div>
  );
}
