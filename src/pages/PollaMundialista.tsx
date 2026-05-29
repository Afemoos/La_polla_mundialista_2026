import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, collection, setDoc, updateDoc, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveCardsForPolla } from '../services/firestore';
import type { Prediction, ActiveCard } from '../types/firestore';
import { Calendar, MapPin, Lock, Edit3, Save, AlertTriangle, Coins } from 'lucide-react';

interface UserPredictionState {
  exists: boolean;
  matchId?: string;
  homeScore?: number;
  awayScore?: number;
  lockedAt?: Date;
}

function MatchCard({
  card,
  userTokens,
  userPrediction,
}: {
  card: ActiveCard;
  userTokens: number;
  userPrediction: UserPredictionState;
}) {
  const { currentUser } = useAuth() || {};
  const [homeScore, setHomeScore] = useState<number | ''>('');
  const [awayScore, setAwayScore] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const now = new Date();
  const lockedTime = userPrediction.lockedAt ? new Date(userPrediction.lockedAt) : null;
  const hoursSinceLocked = lockedTime ? (now.getTime() - lockedTime.getTime()) / (1000 * 60 * 60) : 0;
  const is48hExceeded = lockedTime !== null && hoursSinceLocked >= 48;
  const hasPrediction = userPrediction.exists;

  const matchDate = card.date ? new Date(card.date) : null;
  const hoursUntilMatch = matchDate ? (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60) : Infinity;
  const isPreMatchLocked = hoursUntilMatch <= 1;

  const canModify = hasPrediction && !is48hExceeded && !isPreMatchLocked;
  const isLocked = (hasPrediction && is48hExceeded) || isPreMatchLocked;

  const prepopulateScores = () => {
    if (userPrediction.homeScore !== undefined && !isEditing) {
      setHomeScore(userPrediction.homeScore);
      setAwayScore(userPrediction.awayScore || 0);
    }
  };

  const getCardClass = () => {
    if (!card.isActive) return 'glass-card match-card match-card-locked';
    if (isLocked) return 'glass-card match-card match-card-locked';
    return 'glass-card match-card';
  };

  const handleSave = async () => {
    if (homeScore === '' || awayScore === '') {
      alert('Debes ingresar ambos marcadores.');
      return;
    }

    if (userTokens < card.tokenCost && !hasPrediction) {
      alert('No cuentas con tokens suficientes. Por favor comunícate con un administrador para cargar tokens en tu cuenta.');
      return;
    }

    const predictionStr = `${homeScore} - ${awayScore}`;
    const isConfirmed = window.confirm(
      `El marcador será guardado y se descontarán ${card.tokenCost} ${card.tokenCost === 1 ? 'token' : 'tokens'}. No podrá ser modificado después de 48 horas (2 días).\n\nMarcador: ${predictionStr}\nEvento: ${card.homeTeamName} vs ${card.awayTeamName}`
    );
    if (!isConfirmed) return;

    setSaving(true);
    try {
      const predictionDocRef = doc(db, `users/${currentUser!.uid}/tournaments/world_cup_2026/predictions`, card.cardId);
      await setDoc(predictionDocRef, {
        email: currentUser?.email || '',
        matchId: card.cardId,
        matchDetails: `${card.homeTeamName} vs ${card.awayTeamName}`,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        tokenCost: card.tokenCost,
        deletedAt: null,
        lockedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        homeLogo: card.homeTeamLogo,
        awayLogo: card.awayTeamLogo,
      });

      await updateDoc(doc(db, 'users', currentUser!.uid, 'profile', 'data'), {
        tokens: increment(-card.tokenCost)
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

    if (!userPrediction.matchId) return;

    const predictionStr = `${homeScore} - ${awayScore}`;
    const isConfirmed = window.confirm(
      `Se actualizará tu marcador. El contador de 48 horas se reiniciará.\n\nNuevo marcador: ${predictionStr}`
    );
    if (!isConfirmed) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, `users/${currentUser!.uid}/tournaments/world_cup_2026/predictions`, userPrediction.matchId), {
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
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

  const handleLockNow = async () => {
    if (!userPrediction.matchId) return;
    const isConfirmed = window.confirm(
      '¿Estás seguro de bloquear definitivamente tu predicción? No podrás modificarla bajo ninguna circunstancia.'
    );
    if (!isConfirmed) return;

    setSaving(true);
    try {
      const pastTime = new Date(now.getTime() - 49 * 60 * 60 * 1000);
      await updateDoc(doc(db, `users/${currentUser!.uid}/tournaments/world_cup_2026/predictions`, userPrediction.matchId), {
        lockedAt: Timestamp.fromDate(pastTime)
      });
      alert('Predicción bloqueada definitivamente.');
    } catch (error) {
      console.error('Error bloqueando predicción:', error);
      alert('Error al bloquear la predicción.');
    }
    setSaving(false);
  };

  return (
    <div className={getCardClass()}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className="card-phase">{card.homeTeamName} vs {card.awayTeamName}</span>
        <span className="card-token-cost">
          <Coins size={14} style={{ marginRight: '4px' }} />
          {card.tokenCost} {card.tokenCost === 1 ? 'Token' : 'Tokens'}
        </span>
      </div>

      <div className="flags-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          {card.homeTeamLogo ? (
            <img src={card.homeTeamLogo} alt={card.homeTeamName} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>?</span>
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {card.homeTeamName}
          </div>
        </div>

        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-muted)' }}>VS</div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          {card.awayTeamLogo ? (
            <img src={card.awayTeamLogo} alt={card.awayTeamName} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>?</span>
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {card.awayTeamName}
          </div>
        </div>
      </div>

      <div className="info-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        {card.stadium && card.stadium !== 'Falta por definirse' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={12} /> {card.stadium}
          </span>
        )}
        {card.date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={12} /> {new Date(card.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', hour12: true })}
          </span>
        )}
        {(!card.stadium || card.stadium === 'Falta por definirse') && !card.date && (
          <span>Información próximamente</span>
        )}
      </div>

      {card.isActive && (
        <div className="prob-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '1rem' }}>
          <div style={{ flex: 1, background: 'var(--color-success-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-success)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Local</div>
            <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>{card.probHome ?? '--'}%</div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-warning-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--primary)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Empate</div>
            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{card.probDraw ?? '--'}%</div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-danger-bg)', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-danger)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Visitante</div>
            <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>{card.probAway ?? '--'}%</div>
          </div>
        </div>
      )}

      {isLocked && (
        <div style={{ textAlign: 'center', padding: '8px', marginBottom: '0.75rem', background: 'var(--glass-bg)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <Lock size={14} style={{ marginRight: '6px', color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isPreMatchLocked ? 'El partido está por comenzar. Las predicciones están cerradas.' : 'Los marcadores han sido guardados y no se pueden modificar.'}
          </span>
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
          disabled={!card.isActive || isLocked || (!isEditing && hasPrediction)}
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
          disabled={!card.isActive || isLocked || (!isEditing && hasPrediction)}
          placeholder="0"
        />
      </div>

      <div className="action-row" style={{ textAlign: 'center' }}>
        {!card.isActive && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tarjeta desactivada</span>
        )}
        {card.isActive && !hasPrediction && !isPreMatchLocked && (
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : <><Save size={16} style={{ marginRight: '6px' }} /> Guardar</>}
          </button>
        )}
        {card.isActive && canModify && !isEditing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Marcador actual: <strong style={{ color: 'var(--text-main)' }}>{userPrediction.homeScore} - {userPrediction.awayScore}</strong>
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
            <button
              className="btn-danger-small"
              style={{ width: '100%', marginTop: '4px' }}
              onClick={handleLockNow}
              disabled={saving}
            >
              <Lock size={16} style={{ marginRight: '6px' }} /> Bloquear Definitivamente
            </button>
          </div>
        )}
        {card.isActive && canModify && isEditing && (
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
  const [cards, setCards] = useState<ActiveCard[]>([]);
  const [userPredictions, setUserPredictions] = useState<Prediction[]>([]);
  const [userTokens, setUserTokens] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const unsubTokens = onSnapshot(doc(db, 'users', currentUser.uid, 'profile', 'data'), (snap) => {
      if (snap.exists()) {
        setUserTokens(snap.data().tokens || 0);
      }
    });

    const q = collection(db, `users/${currentUser.uid}/tournaments/world_cup_2026/predictions`);
    const unsubPredictions = onSnapshot(q, (snap) => {
      const preds: Prediction[] = [];
      snap.forEach((d) => {
        preds.push({ id: d.id, ...d.data() } as Prediction);
      });
      setUserPredictions(preds);
    });

    getActiveCardsForPolla()
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setLoading(false));

    return () => {
      unsubTokens();
      unsubPredictions();
    };
  }, [currentUser]);

  const getPredictionForMatch = (cardId: string): UserPredictionState => {
    const pred = userPredictions.find(p => p.id === cardId);
    if (!pred) return { exists: false };
    const data = pred as unknown as Record<string, unknown>;
    return {
      exists: true,
      matchId: pred.id,
      homeScore: data.homeScore as number,
      awayScore: data.awayScore as number,
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

      {cards.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            No hay tarjetas activas. Los partidos aparecerán aquí cuando el admin los configure.
          </p>
        </div>
      ) : (
        <div className="match-grid">
          {cards.map((card) => (
            <MatchCard
              key={card.cardId}
              card={card}
              userTokens={userTokens}
              userPrediction={getPredictionForMatch(card.cardId)}
            />
          ))}
        </div>
      )}

      {userTokens < 1 && cards.length > 0 && (
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
