import { useState, useEffect, useRef } from 'react';
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

  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [teams, setTeams] = useState<TeamWithId[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithId | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const groupRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    getUserBracket(currentUser.uid)
      .then(b => { setBracket(b); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false);
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) setTeamOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGroupSelect = async (group: string) => {
    setSelectedGroup(group);
    setGroupOpen(false);
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

  const handleTeamSelect = async (team: TeamWithId | null) => {
    setSelectedTeam(team);
    setTeamOpen(false);
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

        {/* Paso 1: Grupo (custom dropdown) */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>1. Selecciona el grupo</label>
          <div ref={groupRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setGroupOpen(!groupOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0.7rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--glass-border)',
                background: 'var(--input-bg)',
                color: selectedGroup ? 'var(--text-main)' : 'var(--text-muted)',
                fontSize: '1rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {selectedGroup ? (
                <>
                  <span style={{
                    width: '24px', height: '24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.1rem',
                    color: 'var(--primary)',
                  }}>{selectedGroup}</span>
                  <span>Grupo {selectedGroup}</span>
                </>
              ) : (
                <span>-- Grupo --</span>
              )}
              <ChevronDown size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
            {groupOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '10px', marginTop: '4px', maxHeight: '280px', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                {GROUPS.map(g => (
                  <button key={g} onClick={() => handleGroupSelect(g)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 1rem', border: 'none', borderBottom: '1px solid var(--glass-border)', background: selectedGroup === g ? 'var(--color-warning-bg)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', textAlign: 'left' }}>
                    <span style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)' }}>{g}</span>
                    <span>Grupo {g}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Paso 2: Equipo (custom dropdown) */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            2. Selecciona el equipo
            {loadingTeams && <span style={{ marginLeft: '8px', fontSize: '0.8rem' }}>Cargando...</span>}
          </label>
          <div ref={teamRef} style={{ position: 'relative' }}>
            <button
              onClick={() => selectedGroup && setTeamOpen(!teamOpen)}
              disabled={!selectedGroup}
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
                cursor: selectedGroup ? 'pointer' : 'not-allowed',
                opacity: selectedGroup ? 1 : 0.6,
              }}
            >
              {selectedTeam ? (
                <>
                  <img src={selectedTeam.logo} alt="" style={{ width: '24px', height: '24px' }} />
                  <span>{selectedTeam.name}</span>
                </>
              ) : (
                <span>-- Equipo --</span>
              )}
              <ChevronDown size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
            {teamOpen && teams.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '10px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                {teams.map(t => (
                  <button key={t.apiId} onClick={() => handleTeamSelect(t)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 1rem', border: 'none', borderBottom: '1px solid var(--glass-border)', background: selectedTeam?.apiId === t.apiId ? 'var(--color-warning-bg)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', textAlign: 'left' }}>
                    <img src={t.logo} alt="" style={{ width: '22px', height: '22px' }} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Paso 3: Jugador (lista con fotos) */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            3. Selecciona el jugador
            {loadingPlayers && <span style={{ marginLeft: '8px', fontSize: '0.8rem' }}>Cargando...</span>}
          </label>
          {players.length > 0 ? (
            <div style={{ maxHeight: '220px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
              {players.map(p => {
                const isSelected = selectedPlayer?.apiId === p.apiId;
                return (
                  <button key={p.apiId} onClick={() => setSelectedPlayer(p)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 0.8rem', border: 'none', borderBottom: '1px solid var(--glass-border)', background: isSelected ? 'var(--color-warning-bg)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', textAlign: 'left' }}>
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

        {selectedPlayer && !bracket?.goleador && (
          <div style={{ marginBottom: '1.5rem', padding: '1.2rem', background: 'var(--color-warning-bg)', borderRadius: '12px', border: '1px solid var(--primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1rem' }}>
              <img src={selectedPlayer.photo} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{selectedPlayer.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selectedTeam?.name || ''}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-main)' }}>Posición:</strong> {selectedPlayer.position}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Edad:</strong> {selectedPlayer.age}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Número:</strong> {selectedPlayer.number ?? 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-main)' }}>Equipo:</strong> {selectedTeam?.name || 'N/A'}</div>
            </div>
          </div>
        )}

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
