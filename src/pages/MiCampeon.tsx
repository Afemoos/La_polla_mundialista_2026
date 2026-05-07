import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserBracket, saveUserBracket, getTeamsByGroup } from '../services/firestore';
import type { Bracket, WorldCupTeam } from '../types/firestore';
import { Crown, Save } from 'lucide-react';

export default function MiCampeon() {
  const { currentUser } = useAuth() || {};
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [teams, setTeams] = useState<WorldCupTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<WorldCupTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      getUserBracket(currentUser.uid).catch(() => null),
      Promise.all(['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => getTeamsByGroup(g).catch(() => [])))
        .then(groups => groups.flat().sort((a, b) => a.name.localeCompare(b.name)))
        .catch(() => [] as WorldCupTeam[])
    ]).then(([b, t]) => {
      setBracket(b);
      setTeams(t);
      if (b?.campeon) {
        setSelectedTeam(t.find(team => team.apiId === b.campeon!.apiId) || null);
      }
    }).catch(() => setError('Error al cargar datos'))
    .finally(() => setLoading(false));
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser || !selectedTeam) return;
    setSaving(true);
    setError('');
    const alreadyPaid = bracket?.tokensSpent?.campeon && bracket.tokensSpent.campeon > 0;
    try {
      await saveUserBracket(
        currentUser.uid,
        {
          email: currentUser.email || '',
          campeon: { apiId: selectedTeam.apiId, name: selectedTeam.name, code: selectedTeam.code, logo: selectedTeam.logo },
        },
        alreadyPaid ? undefined : { field: 'campeon', amount: 10 }
      );
      setBracket(prev => {
        const updated: Bracket = {
          ...(prev || {} as Bracket),
          campeon: { apiId: selectedTeam.apiId, name: selectedTeam.name, code: selectedTeam.code, logo: selectedTeam.logo },
          userId: currentUser.uid,
          email: currentUser.email || '',
          matches: prev?.matches || [],
          tokensSpent: { bracket: prev?.tokensSpent?.bracket || 0, campeon: alreadyPaid ? (prev?.tokensSpent?.campeon || 10) : 10, goleador: prev?.tokensSpent?.goleador || 0 },
          score: prev?.score ?? null,
          campeonResult: prev?.campeonResult ?? null,
          goleadorResult: prev?.goleadorResult ?? null,
          createdAt: (prev?.createdAt || null) as any,
          updatedAt: null as any,
        };
        return updated;
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

        {bracket?.campeon && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-success-bg)', borderRadius: '12px', border: '1px solid var(--color-success)' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Tu predicción actual</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <img src={bracket.campeon.logo} alt="" style={{ width: '36px', height: '36px' }} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{bracket.campeon.name}</span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Selecciona un equipo</label>
          <select
            value={selectedTeam?.apiId || ''}
            onChange={e => {
              const t = teams.find(t => t.apiId === Number(e.target.value));
              setSelectedTeam(t || null);
            }}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid var(--glass-border)',
              background: 'var(--input-bg)',
              color: 'var(--text-main)',
              fontSize: '1rem',
              fontFamily: 'inherit',
            }}
          >
            <option value="">-- Selecciona --</option>
            {teams.map(t => (
              <option key={t.apiId} value={t.apiId}>{t.name}</option>
            ))}
          </select>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={!selectedTeam || saving}
          className="glass-btn primary"
          style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Save size={18} />
          {bracket?.tokensSpent?.campeon ? 'Actualizar' : 'Guardar (10 tokens)'}
        </button>
      </div>
    </div>
  );
}
