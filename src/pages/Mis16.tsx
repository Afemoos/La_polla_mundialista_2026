import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getUserBracket, saveUserBracket } from '../services/firestore';
import type { Bracket, BracketMatch, RoundOf32Match } from '../types/firestore';
import { CalendarDays, Save, X } from 'lucide-react';

const EMPTY_MATCH: BracketMatch = {
  matchNumber: 1, round: 'dieciseisavos',
  homeTeam: null, awayTeam: null, homeScore: null, awayScore: null, winner: null
};

function deriveRound(matchNumber: number): BracketMatch['round'] {
  if (matchNumber <= 16) return 'dieciseisavos';
  if (matchNumber <= 24) return 'octavos';
  if (matchNumber <= 28) return 'cuartos';
  if (matchNumber <= 30) return 'semifinal';
  if (matchNumber === 31) return 'tercer_lugar';
  return 'final';
}

function getPreviousMatches(m: number): [number, number] | null {
  if (m <= 16) return null;
  if (m <= 24) { const b = (m - 17) * 2 + 1; return [b, b + 1]; }
  if (m <= 28) { const b = (m - 25) * 2 + 17; return [b, b + 1]; }
  if (m <= 30) { const b = (m - 29) * 2 + 25; return [b, b + 1]; }
  if (m === 31) return [29, 30];
  return [29, 30];
}

function isLoserMatch(m: number): boolean { return m === 31; }

function propagateBracket(matches: BracketMatch[]): BracketMatch[] {
  const result = matches.map(m => ({ ...m, homeTeam: m.homeTeam ? { ...m.homeTeam } : null, awayTeam: m.awayTeam ? { ...m.awayTeam } : null }));
  for (const m of result) {
    if (m.matchNumber <= 16) continue;
    const prev = getPreviousMatches(m.matchNumber);
    if (!prev) continue;
    const m1 = result.find(x => x.matchNumber === prev[0]);
    const m2 = result.find(x => x.matchNumber === prev[1]);
    if (!m1 || !m2) continue;
    if (isLoserMatch(m.matchNumber)) {
      if (m1.winner === 'home') m.homeTeam = m1.awayTeam;
      else if (m1.winner === 'away') m.homeTeam = m1.homeTeam;
      if (m2.winner === 'home') m.awayTeam = m2.awayTeam;
      else if (m2.winner === 'away') m.awayTeam = m2.homeTeam;
    } else {
      if (m1.winner === 'home') m.homeTeam = m1.homeTeam;
      else if (m1.winner === 'away') m.homeTeam = m1.awayTeam;
      if (m2.winner === 'home') m.awayTeam = m2.homeTeam;
      else if (m2.winner === 'away') m.awayTeam = m2.awayTeam;
    }
  }
  return result;
}

const ROUND_LABELS: Record<string, string> = {
  dieciseisavos: 'Dieciseisavos',
  octavos: 'Octavos',
  cuartos: 'Cuartos',
  semifinal: 'Semifinal',
  tercer_lugar: '3er Lugar',
  final: 'Final',
};

export default function Mis16() {
  const { currentUser } = useAuth() || {};
  const [phase, setPhase] = useState<'loading' | 'groups' | 'knockout'>('loading');
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [editHomeScore, setEditHomeScore] = useState<number | ''>('');
  const [editAwayScore, setEditAwayScore] = useState<number | ''>('');
  const [editWinner, setEditWinner] = useState<'home' | 'away' | null>(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      getDoc(doc(db, 'system', 'round_of_32_matches')),
      getUserBracket(currentUser.uid)
    ]).then(([snap, b]) => {
      if (!snap.exists() || !snap.data().matches || snap.data().matches.length === 0) {
        setPhase('groups');
      } else {
        const r32Matches: RoundOf32Match[] = snap.data().matches;
        const userMatches = b?.matches || [];
        const allMatches: BracketMatch[] = [];
        for (let i = 1; i <= 32; i++) {
          const existing = userMatches.find(m => m.matchNumber === i);
          if (i <= 16) {
            const api = r32Matches.find(r => r.matchNumber === i);
            allMatches.push({
              ...EMPTY_MATCH,
              matchNumber: i,
              round: 'dieciseisavos',
              homeTeam: api?.homeTeam || null,
              awayTeam: api?.awayTeam || null,
              homeScore: existing?.homeScore ?? null,
              awayScore: existing?.awayScore ?? null,
              winner: existing?.winner ?? null,
            });
          } else {
            allMatches.push(existing || { ...EMPTY_MATCH, matchNumber: i, round: deriveRound(i) });
          }
        }
        setMatches(propagateBracket(allMatches));
        setPhase('knockout');
      }
    }).catch(() => setPhase('groups'));
  }, [currentUser]);

  const openModal = (m: BracketMatch) => {
    if (m.matchNumber <= 16 && (!m.homeTeam || !m.awayTeam)) return;
    if (m.matchNumber > 16 && (!m.homeTeam || !m.awayTeam)) return;
    setEditingMatch(m);
    setEditHomeScore(m.homeScore ?? '');
    setEditAwayScore(m.awayScore ?? '');
    setEditWinner(m.winner);
    setModalError('');
  };

  const closeModal = () => { setEditingMatch(null); setModalError(''); };

  const handleSave = async () => {
    if (!currentUser || !editingMatch) return;
    if (editWinner && (editHomeScore === '' || editAwayScore === '')) {
      setModalError('Ingresa ambos marcadores para guardar.');
      return;
    }
    if (!editWinner && (editHomeScore !== '' || editAwayScore !== '')) {
      setModalError('Selecciona qué equipo avanza.');
      return;
    }
    if (editWinner === 'home' && Number(editHomeScore) <= Number(editAwayScore || 0)) {
      setModalError('El ganador debe tener más goles.');
      return;
    }
    if (editWinner === 'away' && Number(editAwayScore) <= Number(editHomeScore || 0)) {
      setModalError('El ganador debe tener más goles.');
      return;
    }
    setSaving(true);
    setModalError('');
    const alreadyPaid = bracket?.tokensSpent?.bracket && bracket.tokensSpent.bracket > 0;
    const updatedMatches = matches.map(m => {
      if (m.matchNumber === editingMatch.matchNumber) {
        return {
          ...m,
          homeScore: editHomeScore === '' ? null : Number(editHomeScore),
          awayScore: editAwayScore === '' ? null : Number(editAwayScore),
          winner: editWinner,
        };
      }
      return m;
    });
    const propagated = propagateBracket(updatedMatches);
    try {
      await saveUserBracket(
        currentUser.uid,
        {
          email: currentUser.email || '',
          matches: propagated,
        },
        alreadyPaid ? undefined : { field: 'bracket', amount: 15 }
      );
      setMatches(propagated);
      setBracket(prev => ({
        ...(prev || {} as Bracket),
        matches: propagated,
        userId: currentUser.uid,
        email: currentUser.email || '',
        tokensSpent: { bracket: alreadyPaid ? (prev?.tokensSpent?.bracket || 15) : 15, campeon: prev?.tokensSpent?.campeon || 0, goleador: prev?.tokensSpent?.goleador || 0 },
        campeon: prev?.campeon || null,
        goleador: prev?.goleador || null,
        score: prev?.score ?? null,
        campeonResult: prev?.campeonResult ?? null,
        goleadorResult: prev?.goleadorResult ?? null,
        createdAt: (prev?.createdAt || null) as any,
        updatedAt: null as any,
      }));
      setEditingMatch(null);
    } catch (e: any) {
      setModalError('Error al guardar: ' + (e?.message || ''));
    }
    setSaving(false);
  };

  if (phase === 'loading') return <div className="page-center"><div className="spinner" /></div>;

  if (phase === 'groups') {
    return (
      <div className="page-center">
        <div className="glass-card" style={{ maxWidth: '600px', textAlign: 'center', padding: '3rem' }}>
          <CalendarDays size={64} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <h2 style={{ marginBottom: '1rem' }}>Fase de Grupos</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.6 }}>
            El torneo se encuentra en fase de grupos. La predicción de eliminación directa estará disponible cuando comiencen los dieciseisavos.
          </p>
        </div>
      </div>
    );
  }

  const rounds = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'tercer_lugar', 'final'];
  const tokenCost = bracket?.tokensSpent?.bracket ? 0 : 15;

  return (
    <div className="bracket-container">
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', background: 'var(--page-title-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Mis 16 — Predicción de Eliminación Directa
      </h2>
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        {tokenCost > 0 ? `Cuesta ${tokenCost} tokens. Podrás editar tus predicciones sin costo adicional.` : 'Ya pagaste. Puedes editar tus predicciones.'}
      </p>

      <div className="bracket-grid">
        {rounds.map(round => {
          const roundMatches = matches.filter(m => m.round === round);
          if (round === 'tercer_lugar' || round === 'final') return null;
          return (
            <div key={round} className="bracket-column">
              <div className="bracket-round-title">{ROUND_LABELS[round]}</div>
              {roundMatches.map(m => (
                <MatchSlot key={m.matchNumber} match={m} onClick={() => openModal(m)} />
              ))}
            </div>
          );
        })}
        <div className="bracket-column">
          <div className="bracket-round-title">Semis / Final</div>
          {matches.filter(m => m.round === 'semifinal' || m.round === 'tercer_lugar' || m.round === 'final').map(m => (
            <MatchSlot key={m.matchNumber} match={m} onClick={() => openModal(m)} isCompact={m.round !== 'semifinal'} />
          ))}
        </div>
      </div>

      {editingMatch && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content bracket-modal" onClick={e => e.stopPropagation()}>
            <button onClick={closeModal} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Match {editingMatch.matchNumber} — {ROUND_LABELS[editingMatch.round]}</h3>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <TeamBox team={editingMatch.homeTeam} score={editHomeScore} onScoreChange={setEditHomeScore} />
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>vs</span>
              <TeamBox team={editingMatch.awayTeam} score={editAwayScore} onScoreChange={setEditAwayScore} />
            </div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>¿Qué equipo avanza a la siguiente ronda?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                <input type="radio" name="winner" checked={editWinner === 'home'} onChange={() => setEditWinner('home')} />
                {editingMatch.homeTeam?.name || 'Local'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                <input type="radio" name="winner" checked={editWinner === 'away'} onChange={() => setEditWinner('away')} />
                {editingMatch.awayTeam?.name || 'Visitante'}
              </label>
            </div>
            {modalError && <p style={{ color: 'var(--color-danger)', textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{modalError}</p>}
            <button onClick={handleSave} disabled={saving} className="glass-btn primary" style={{ width: '100%', padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchSlot({ match, onClick, isCompact }: { match: BracketMatch; onClick: () => void; isCompact?: boolean }) {
  const hasData = match.homeTeam && match.awayTeam;
  const isCompleted = match.winner !== null && match.homeScore !== null;
  const borderColor = isCompleted ? 'var(--color-success)' : hasData ? 'var(--glass-border)' : 'var(--glass-border)';
  const borderStyle = !hasData ? 'dashed' : 'solid';

  return (
    <button
      onClick={onClick}
      disabled={!hasData}
      style={{
        width: '100%',
        padding: isCompact ? '0.4rem 0.6rem' : '0.6rem 0.8rem',
        marginBottom: isCompact ? '0.3rem' : '0.5rem',
        borderRadius: '10px',
        border: `1.5px ${borderStyle} ${borderColor}`,
        background: isCompleted ? 'var(--color-success-bg)' : 'var(--glass-bg)',
        color: 'var(--text-main)',
        cursor: hasData ? 'pointer' : 'default',
        fontFamily: 'inherit',
        fontSize: isCompact ? '0.7rem' : '0.8rem',
        textAlign: 'center',
        opacity: hasData ? 1 : 0.5,
      }}
    >
      {hasData ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
            <img src={match.homeTeam!.logo} alt="" style={{ width: '16px', height: '16px' }} />
            <span style={{ fontWeight: 500, fontSize: isCompact ? '0.65rem' : '0.75rem' }}>{match.homeTeam!.code}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>vs</span>
            <span style={{ fontWeight: 500, fontSize: isCompact ? '0.65rem' : '0.75rem' }}>{match.awayTeam!.code}</span>
            <img src={match.awayTeam!.logo} alt="" style={{ width: '16px', height: '16px' }} />
          </div>
          {isCompleted && (
            <div style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: isCompact ? '0.7rem' : '0.8rem' }}>
              {match.homeScore} - {match.awayScore}
            </div>
          )}
          {isCompleted && <span style={{ fontSize: '0.6rem', color: 'var(--color-success)' }}>✓</span>}
        </>
      ) : (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Por definir</span>
      )}
    </button>
  );
}

function TeamBox({ team, score, onScoreChange }: { team: { name: string; logo: string; } | null; score: number | ''; onScoreChange: (v: number | '') => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      {team ? (
        <>
          <img src={team.logo} alt="" style={{ width: '40px', height: '40px', marginBottom: '4px' }} />
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>{team.name}</div>
        </>
      ) : (
        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px', color: 'var(--text-muted)' }}>Por definir</div>
      )}
      <input
        type="number"
        min={0}
        max={99}
        value={score}
        onChange={e => onScoreChange(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
        placeholder="-"
        style={{
          width: '50px',
          padding: '0.3rem',
          textAlign: 'center',
          borderRadius: '8px',
          border: '1px solid var(--glass-border)',
          background: 'var(--input-bg)',
          color: 'var(--text-main)',
          fontSize: '1rem',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
