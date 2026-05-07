import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserBracket, saveUserBracket } from '../services/firestore';
import type { Bracket, FlatPlayer } from '../types/firestore';
import { Target, Save, Search } from 'lucide-react';
import { collection, getDocs, limit as fsLimit, query } from 'firebase/firestore';
import { db } from '../firebase';

export default function MiGoleador() {
  const { currentUser } = useAuth() || {};
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [allPlayers, setAllPlayers] = useState<FlatPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<FlatPlayer | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      getUserBracket(currentUser.uid).catch(() => null),
      getDocs(query(collection(db, 'flat_players'), fsLimit(2000)))
        .then(snap => snap.docs.map(d => d.data() as FlatPlayer))
        .catch((e: Error) => { setLoadError(e.message); return [] as FlatPlayer[]; })
    ]).then(([b, players]) => {
      setBracket(b);
      setAllPlayers(players.length > 0 ? players : []);
      if (b?.goleador && players.length > 0) {
        const found = players.find(p => p.apiId === b.goleador!.apiId);
        if (found) setSelectedPlayer(found);
      }
    }).finally(() => setLoading(false));
  }, [currentUser]);

  const filteredPlayers = useMemo(() => {
    if (searchTerm.length < 2 || allPlayers.length === 0) return [];
    const term = searchTerm.toLowerCase();
    return allPlayers.filter(p => p.name.toLowerCase().includes(term)).slice(0, 20);
  }, [searchTerm, allPlayers]);

  const handleSelect = (player: FlatPlayer) => {
    setSelectedPlayer(player);
    setSearchTerm(player.name);
    setShowResults(false);
  };

  const handleSave = async () => {
    if (!currentUser || !selectedPlayer) return;
    setSaving(true);
    setError('');
    const alreadyPaid = bracket?.tokensSpent?.goleador && bracket.tokensSpent.goleador > 0;
    try {
      await saveUserBracket(
        currentUser.uid,
        {
          email: currentUser.email || '',
          goleador: { apiId: selectedPlayer.apiId, name: selectedPlayer.name, teamName: selectedPlayer.teamName, photo: selectedPlayer.photo },
        },
        alreadyPaid ? undefined : { field: 'goleador', amount: 10 }
      );
      setBracket(prev => {
        const updated: Bracket = {
          ...(prev || {} as Bracket),
          goleador: { apiId: selectedPlayer.apiId, name: selectedPlayer.name, teamName: selectedPlayer.teamName, photo: selectedPlayer.photo },
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

        {loadError && (
          <p style={{ color: 'var(--accent-rd)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem', padding: '0.5rem', background: 'var(--color-danger-bg)', borderRadius: '8px' }}>
            Error al cargar jugadores: {loadError}
          </p>
        )}

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

        <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Buscar jugador ({allPlayers.length} disponibles)</label>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSelectedPlayer(null); setShowResults(true); }}
              onFocus={() => { if (filteredPlayers.length > 0 || searchTerm.length >= 2) setShowResults(true); }}
              placeholder="Escribe el nombre del jugador..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 40px',
                borderRadius: '10px',
                border: '1px solid var(--glass-border)',
                background: 'var(--input-bg)',
                color: 'var(--text-main)',
                fontSize: '1rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {showResults && filteredPlayers.length > 0 && (
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
              {filteredPlayers.map(p => (
                <button
                  key={p.apiId}
                  onClick={() => handleSelect(p)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '0.6rem 1rem',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    background: 'transparent',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <img src={p.photo} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{p.teamName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showResults && searchTerm.length >= 2 && filteredPlayers.length === 0 && (
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
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}>
              No se encontraron jugadores
            </div>
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
