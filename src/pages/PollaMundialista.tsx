import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import type { Prediction } from '../types/firestore';
import { Calendar, MapPin, Lock, Edit3, Save, AlertTriangle, Coins } from 'lucide-react';

interface WorldCupMatch {
  id: string;
  phase: string;
  homeTeam?: string;
  awayTeam?: string;
  homeFlag?: string;
  awayFlag?: string;
  stadium?: string;
  date?: string;
  probHome?: number;
  probDraw?: number;
  probAway?: number;
  tokenCost: number;
  isDefined: boolean;
}

interface UserPredictionState {
  exists: boolean;
  docId?: string;
  prediction?: string;
  lockedAt?: Date;
}

const DUMMY_MATCHES: WorldCupMatch[] = [
  { id: 'wc-grupos-1', phase: 'Fase de Grupos - Jornada 1', homeTeam: 'Colombia', awayTeam: 'Uzbekistán', homeFlag: 'https://media.api-sports.io/football/teams/8.png', awayFlag: 'https://media.api-sports.io/football/teams/66.png', stadium: 'Por definir', date: '2026-06-17T22:00:00-05:00', probHome: 50, probDraw: 30, probAway: 20, tokenCost: 1, isDefined: true },
  { id: 'wc-grupos-2', phase: 'Fase de Grupos - Jornada 2', homeTeam: 'Colombia', awayTeam: 'RD Congo', homeFlag: 'https://media.api-sports.io/football/teams/8.png', awayFlag: 'https://media.api-sports.io/football/teams/34.png', stadium: 'Por definir', date: '2026-06-23T22:00:00-05:00', probHome: 55, probDraw: 25, probAway: 20, tokenCost: 1, isDefined: true },
  { id: 'wc-grupos-3', phase: 'Fase de Grupos - Jornada 3', homeTeam: 'Colombia', awayTeam: 'Portugal', homeFlag: 'https://media.api-sports.io/football/teams/8.png', awayFlag: 'https://media.api-sports.io/football/teams/27.png', stadium: 'Por definir', date: '2026-06-27T19:30:00-05:00', probHome: 35, probDraw: 30, probAway: 35, tokenCost: 1, isDefined: true },
  { id: 'wc-octavos', phase: 'Octavos de Final', homeTeam: 'Falta por definirse', awayTeam: 'Falta por definirse', homeFlag: '', awayFlag: '', stadium: 'Falta por definirse', date: '', probHome: 0, probDraw: 0, probAway: 0, tokenCost: 2, isDefined: false },
  { id: 'wc-cuartos', phase: 'Cuartos de Final', homeTeam: 'Falta por definirse', awayTeam: 'Falta por definirse', homeFlag: '', awayFlag: '', stadium: 'Falta por definirse', date: '', probHome: 0, probDraw: 0, probAway: 0, tokenCost: 3, isDefined: false },
  { id: 'wc-semi', phase: 'Semifinal', homeTeam: 'Falta por definirse', awayTeam: 'Falta por definirse', homeFlag: '', awayFlag: '', stadium: 'Falta por definirse', date: '', probHome: 0, probDraw: 0, probAway: 0, tokenCost: 4, isDefined: false },
  { id: 'wc-final', phase: 'Final', homeTeam: 'Falta por definirse', awayTeam: 'Falta por definirse', homeFlag: '', awayFlag: '', stadium: 'Falta por definirse', date: '', probHome: 0, probDraw: 0, probAway: 0, tokenCost: 5, isDefined: false },
];

function MatchCard({
  match,
  userTokens,
  userPrediction,
}: {
  match: WorldCupMatch;
  userTokens: number;
  userPrediction: UserPredictionState;
}) {
  const { currentUser } = useAuth() || {};
  const [homeScore, setHomeScore] = useState<number | ''>('');
  const [awayScore, setAwayScore] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // AI-NOTE: Determinar estado de la tarjeta basado en tiempo transcurrido
  const now = new Date();
  const lockedTime = userPrediction.lockedAt ? new Date(userPrediction.lockedAt) : null;
  const hoursSinceLocked = lockedTime ? (now.getTime() - lockedTime.getTime()) / (1000 * 60 * 60) : 0;
  const is48hExceeded = lockedTime !== null && hoursSinceLocked >= 48;
  const hasPrediction = userPrediction.exists;
  const canModify = hasPrediction && !is48hExceeded;
  const isLocked = hasPrediction && is48hExceeded;

  const prepopulateScores = () => {
    if (userPrediction.prediction && !isEditing) {
      const parts = userPrediction.prediction.split(' - ');
      if (parts.length === 2) {
        setHomeScore(parts[0] === '' ? '' : Number(parts[0]));
        setAwayScore(parts[1] === '' ? '' : Number(parts[1]));
      }
    }
  };

  const getCardClass = () => {
    if (!match.isDefined) return 'glass-card match-card match-card-future';
    if (isLocked) return 'glass-card match-card match-card-locked';
    return 'glass-card match-card';
  };

  const handleSave = async () => {
    if (homeScore === '' || awayScore === '') {
      alert('Debes ingresar ambos marcadores.');
      return;
    }

    if (userTokens < match.tokenCost && !hasPrediction) {
      alert('No cuentas con tokens suficientes. Por favor comunícate con un administrador para cargar tokens en tu cuenta.');
      return;
    }

    const predictionStr = `${homeScore} - ${awayScore}`;
    const isConfirmed = window.confirm(
      `El marcador será guardado y se descontarán ${match.tokenCost} ${match.tokenCost === 1 ? 'token' : 'tokens'}. No podrá ser modificado después de 48 horas (2 días).\n\nMarcador: ${predictionStr}\nEvento: ${match.homeTeam} vs ${match.awayTeam}`
    );
    if (!isConfirmed) return;

    setSaving(true);
    try {
      // Crear predicción y descontar tokens
      await addDoc(collection(db, 'predictions'), {
        email: currentUser?.email,
        type: 'POLla_MUNDIALISTA',
        fixtureId: match.id,
        matchDetails: `${match.homeTeam} vs ${match.awayTeam}`,
        prediction: predictionStr,
        homeLogo: match.homeFlag || '',
        awayLogo: match.awayFlag || '',
        status: 'PENDIENTE',
        tokenCost: match.tokenCost,
        lockedAt: serverTimestamp(),
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', currentUser!.uid), {
        tokens: increment(-match.tokenCost)
      });

      alert('Predicción guardada exitosamente. Podrás modificarla durante las próximas 48 horas.');
    } catch (error) {
      console.error('Error guardando predicción:', error);
      alert('Error al guardar la predicción.');
    }
    setSaving(false);
    setIsEditing(false);
  };

  const handleModify = async () => {
    if (homeScore === '' || awayScore === '') {
      alert('Debes ingresar ambos marcadores.');
      return;
    }

    if (!userPrediction.docId) return;

    const predictionStr = `${homeScore} - ${awayScore}`;
    const isConfirmed = window.confirm(
      `Se actualizará tu marcador. El contador de 48 horas se reiniciará.\n\nNuevo marcador: ${predictionStr}`
    );
    if (!isConfirmed) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'predictions', userPrediction.docId), {
        prediction: predictionStr,
        lockedAt: serverTimestamp()
      });
      alert('Marcador actualizado exitosamente.');
    } catch (error) {
      console.error('Error modificando predicción:', error);
      alert('Error al modificar la predicción.');
    }
    setSaving(false);
    setIsEditing(false);
  };

  return (
    <div className={getCardClass()}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className="card-phase">{match.phase}</span>
        <span className="card-token-cost">
          <Coins size={14} style={{ marginRight: '4px' }} />
          {match.tokenCost} {match.tokenCost === 1 ? 'Token' : 'Tokens'}
        </span>
      </div>

      <div className="flags-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          {match.homeFlag ? (
            <img src={match.homeFlag} alt={match.homeTeam} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>?</span>
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {match.homeTeam}
          </div>
        </div>

        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-muted)' }}>VS</div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          {match.awayFlag ? (
            <img src={match.awayFlag} alt={match.awayTeam} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>?</span>
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {match.awayTeam}
          </div>
        </div>
      </div>

      <div className="info-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        {match.stadium && match.stadium !== 'Falta por definirse' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={12} /> {match.stadium}
          </span>
        )}
        {match.date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={12} /> {new Date(match.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', hour12: true })}
          </span>
        )}
        {(!match.stadium || match.stadium === 'Falta por definirse') && !match.date && (
          <span>Información próximamente</span>
        )}
      </div>

      {match.isDefined && (
        <div className="prob-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '1rem' }}>
          <div style={{ flex: 1, background: 'var(--color-success-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-success)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Local</div>
            <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>{match.probHome ?? '--'}%</div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-warning-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--primary)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Empate</div>
            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{match.probDraw ?? '--'}%</div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-danger-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-danger)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Visitante</div>
            <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>{match.probAway ?? '--'}%</div>
          </div>
        </div>
      )}

      {isLocked && (
        <div style={{ textAlign: 'center', padding: '8px', marginBottom: '0.75rem', background: 'var(--glass-bg)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <Lock size={14} style={{ marginRight: '6px', color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Los marcadores han sido guardados y no se pueden modificar.</span>
        </div>
      )}

      <div className="input-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="number"
          min="0"
          max="20"
          className="styled-input"
          style={{ width: '70px', textAlign: 'center' }}
          value={homeScore}
          onChange={(e) => setHomeScore(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={!match.isDefined || isLocked || (!isEditing && hasPrediction)}
          placeholder="0"
        />
        <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>-</span>
        <input
          type="number"
          min="0"
          max="20"
          className="styled-input"
          style={{ width: '70px', textAlign: 'center' }}
          value={awayScore}
          onChange={(e) => setAwayScore(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={!match.isDefined || isLocked || (!isEditing && hasPrediction)}
          placeholder="0"
        />
      </div>

      <div className="action-row" style={{ textAlign: 'center' }}>
        {!match.isDefined && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Falta por definirse</span>
        )}
        {match.isDefined && !hasPrediction && (
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : <><Save size={16} style={{ marginRight: '6px' }} /> Guardar</>}
          </button>
        )}
        {match.isDefined && canModify && !isEditing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Marcador actual: <strong style={{ color: 'var(--text-main)' }}>{userPrediction.prediction}</strong>
            </div>
            <button
              className="btn-primary"
              style={{ width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              onClick={() => {
                prepopulateScores();
                setIsEditing(true);
              }}
            >
              <Edit3 size={16} style={{ marginRight: '6px' }} /> Modificar
            </button>
          </div>
        )}
        {match.isDefined && canModify && isEditing && (
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              className="btn-primary"
              style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}
              onClick={() => {
                setIsEditing(false);
                setHomeScore('');
                setAwayScore('');
              }}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              onClick={handleModify}
              disabled={saving}
            >
              {saving ? 'Guardando...' : <><Save size={16} style={{ marginRight: '6px' }} /> Confirmar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PollaMundialista() {
  const { currentUser } = useAuth() || {};
  const [matches, setMatches] = useState<WorldCupMatch[]>(DUMMY_MATCHES);
  const [userPredictions, setUserPredictions] = useState<Prediction[]>([]);
  const [userTokens, setUserTokens] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    // Escuchar tokens del usuario
    const unsubTokens = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        setUserTokens(snap.data().tokens || 0);
      }
    });

    // Escuchar predicciones del usuario (tipo Polla Mundialista)
    const q = query(
      collection(db, 'predictions'),
      where('email', '==', currentUser.email),
      where('type', '==', 'POLla_MUNDIALISTA')
    );
    const unsubPredictions = onSnapshot(q, (snap) => {
      const preds: Prediction[] = [];
      snap.forEach((d) => {
        preds.push({ id: d.id, ...d.data() } as Prediction);
      });
      setUserPredictions(preds);
    });

    // AI-NOTE: Intentar cargar partidos desde Firestore, usar dummies como fallback
    const unsubMatches = onSnapshot(doc(db, 'system', 'worldcup_path'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.matches && Array.isArray(data.matches)) {
          setMatches(data.matches as WorldCupMatch[]);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubTokens();
      unsubPredictions();
      unsubMatches();
    };
  }, [currentUser]);

  const getPredictionForMatch = (matchId: string): UserPredictionState => {
    const pred = userPredictions.find(p => p.fixtureId === matchId);
    if (!pred) return { exists: false };
    return {
      exists: true,
      docId: pred.id,
      prediction: pred.prediction,
      lockedAt: pred.lockedAt?.toDate ? pred.lockedAt.toDate() : undefined
    };
  };

  if (loading) {
    return (
      <div className="fade-in">
        <h1 className="page-title">🏆 Polla Mundialista</h1>
        <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando partidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1 className="page-title">🏆 Polla Mundialista</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>
        Predice el marcador exacto de cada fase del camino de Colombia en el Mundial 2026. Cada predicción cuesta tokens. Tienes 48 horas para modificar tu marcador antes de que se bloquee definitivamente.
      </p>

      <div className="match-grid">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            userTokens={userTokens}
            userPrediction={getPredictionForMatch(match.id)}
          />
        ))}
      </div>

      {userTokens < 1 && (
        <div className="glass-card" style={{ marginTop: '2rem', borderLeft: '4px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={24} color="var(--primary)" />
          <div>
            <strong style={{ color: 'var(--primary)' }}>Sin tokens disponibles</strong>
            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
              No cuentas con tokens para participar. Contacta a un administrador para cargar tokens en tu cuenta.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
