import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CalendarDays } from 'lucide-react';

export default function Mis16() {
  const [phase, setPhase] = useState<'loading' | 'groups' | 'knockout'>('loading');

  useEffect(() => {
    getDoc(doc(db, 'system', 'round_of_32_matches')).then(snap => {
      if (!snap.exists() || !snap.data().matches || snap.data().matches.length === 0) {
        setPhase('groups');
      } else {
        setPhase('knockout');
      }
    }).catch(() => setPhase('groups'));
  }, []);

  if (phase === 'loading') {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

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

  return (
    <div className="page-center">
      <div className="glass-card" style={{ maxWidth: '600px', textAlign: 'center', padding: '3rem' }}>
        <h2>Mis 16 — Bracket</h2>
        <p style={{ color: 'var(--text-muted)' }}>El bracket interactivo se cargará aquí cuando los datos de dieciseisavos estén disponibles.</p>
      </div>
    </div>
  );
}
