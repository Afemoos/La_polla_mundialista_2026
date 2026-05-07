import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserBracket, saveUserBracket, getTeamsByGroup, getTeamPlayers } from '../services/firestore';
import type { Bracket, WorldCupTeam, Player } from '../types/firestore';
import { Target, Save, ChevronDown } from 'lucide-react';

interface TeamWithId extends WorldCupTeam {
  id?: string;
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

export default function MiGoleador() {
  const { currentUser } = useAuth() || {};
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loading, setLoading] = useState(true);

  // Cascading selects
  const [selectedGroup, setSelectedGroup] = useState('');
  const [teams, setTeams] = useState<TeamWithId[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithId | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    getUserBracket(currentUser.uid)
      .then(b => { setBracket(b); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser]);

  const handleGroupChange = async (group: string) => {
    setSelectedGroup(group);
    setSelectedTeam(null);
    setPlayers([]);
    setSelectedPlayer(null);
    if (!group) { setTeams([]); return; }
    setLoadingTeams(true);
    try {
      const t = await getTeamsByGroup(group);
      setTeams(t as TeamWithId[]);
    } catch {
      setTeams([]);
    }
    setLoadingTeams(false);
  };

  const handleTeamChange = async (team: TeamWithId | null) => {
    setSelectedTeam(team);
    setPlayers([]);
    setSelectedPlayer(null);
    if (!team || !selectedGroup || !team.id) return;
    setLoadingPlayers(true);
    try {
      const p = await getTeamPlayers(team.id, selectedGroup);
      setPlayers(p);
    } catch {
      setPlayers([]);
    }
    setLoadingPlayers(false);
  };

  const handleSave = async () => {
    if (!currentUser || !selectedPlayer || !selectedTeam) return;
    setSaving(true);
    setError('');
    const alreadyPaid = bracket?.tokensSpent?.goleador && bracket.tokensSpent.goleador > 0;
    try {
      await saveUserBracket(
        currentUser.uid,
        {
          email: currentUser.email || '',
          goleador: { apiId: selectedPlayer.apiId, name: selectedPlayer.name, teamName: selectedTeam.name, photo: selectedPlayer.photo },
        },
        alreadyPaid ? undefined : { field: 'goleador', amount: 10 }
      );
      setBracket(prev => {
        const updated: Bracket = {
          ...(prev || {} as Bracket),
          goleador: { apiId: selectedPlayer.apiId, name: selectedPlayer.name, teamName: selectedTeam.name, photo: selectedPlayer.photo },
          userId: currentUser.uid,
          email: currentUser.email || '',
          matches: prev?.matches || [],
          tokensSpent: { bracket: prev?.tokensSpent?.bracket || 0, campeon: prev?.tokensSpent?.campeon || 0, goleador: alreadyPaid ? (prev?.tokensSpent?.goleador || 10) : 10 },
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
          <Target size={24} color="var(--accent-rd)" /> ¿Quién será el goleador?
        </h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          10 tokens — selecciona el jugador que crees que marcará más goles
        </p>

        {bracket?.goleador && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-success-bg)', borderRadius: '12px', border: '1px solid var(--color-success)' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Tu predicción actual</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <img src={bracket.goleador.photo} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{bracket.goleador.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{bracket.goleador.teamName}</div>
              </div>
            </div>
          </div>
        )}

        {/* Paso 1: Grupo */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>1. Selecciona el grupo</label>
          <select
            value={selectedGroup}
            onChange={e => handleGroupChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Grupo --</option>
            {GROUPS.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </div>

        {/* Paso 2: Equipo */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            2. Selecciona el equipo
            {loadingTeams && <span style={{ marginLeft: '8px' }}>Cargando...</span>}
          </label>
          <select
            value={selectedTeam?.apiId || ''}
            onChange={e => {
              const t = teams.find(t => t.apiId === Number(e.target.value));
              handleTeamChange(t || null);
            }}
            disabled={!selectedGroup || teams.length === 0}
            style={selectStyle}
          >
            <option value="">-- Equipo --</option>
            {teams.map(t => (
              <option key={t.apiId} value={t.apiId}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Paso 3: Jugador */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            3. Selecciona el jugador
            {loadingPlayers && <span style={{ marginLeft: '8px' }}>Cargando...</span>}
          </label>
          {players.length > 0 ? (
            <div style={{ maxHeight: '220px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
              {players.map(p => {
                const isSelected = selectedPlayer?.apiId === p.apiId;
                return (
                  <button
                    key={p.apiId}
                    onClick={() => setSelectedPlayer(p)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '0.6rem 0.8rem',
                      border: 'none',
                      borderBottom: '1px solid var(--glass-border)',
                      background: isSelected ? 'var(--color-warning-bg)' : 'transparent',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      textAlign: 'left',
                    }}
                  >
                    <img src={p.photo} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                    <span>{p.name}</span>
                    {isSelected && <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />}
                  </button>
                );
              })}
            </div>
          ) : selectedTeam ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>No hay jugadores disponibles para este equipo</p>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>Selecciona primero un equipo</p>
          )}
        </div>

        {error && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={!selectedPlayer || saving}
          className="glass-btn primary"
          style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Save size={18} />
          {bracket?.tokensSpent?.goleador ? 'Actualizar' : 'Guardar (10 tokens)'}
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 1rem',
  borderRadius: '10px',
  border: '1px solid var(--glass-border)',
  background: 'var(--input-bg)',
  color: 'var(--text-main)',
  fontSize: '1rem',
  fontFamily: 'inherit',
};
