import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Activity, Shield, Globe2 } from 'lucide-react';

interface MatchResult {
    fixtureId: number;
    date: string;
    homeTeam: string;
    homeFlag: string;
    awayTeam: string;
    awayFlag: string;
    goalsHome: number | null;
    goalsAway: number | null;
    status: string;
}

interface ResultPanel {
    title: string;
    icon: any;
    color: string;
    matches: MatchResult[];
    loading: boolean;
    emptyMessage?: string;
}

function MatchCard({ match }: { match: MatchResult }) {
    const date = new Date(match.date).toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    const score = (match.goalsHome !== null && match.goalsAway !== null)
        ? `${match.goalsHome} - ${match.goalsAway}`
        : 'VS';

    return (
        <div className="match-result-row">
            <div className="match-result-teams-container">
                {/* Equipo local */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <img src={match.homeFlag} width="24" height="24" alt={match.homeTeam}
                        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    <span className="team-name" title={match.homeTeam}>{match.homeTeam}</span>
                </div>

                {/* Marcador */}
                <div style={{
                    background: 'var(--glass-bg)',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    minWidth: '60px',
                    textAlign: 'center',
                    color: 'var(--primary)',
                    flexShrink: 0
                }}>
                    {score}
                </div>

                {/* Equipo visitante */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
                    <span className="team-name" title={match.awayTeam} style={{ textAlign: 'right' }}>{match.awayTeam}</span>
                    <img src={match.awayFlag} width="24" height="24" alt={match.awayTeam}
                        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                </div>
            </div>

            {/* Fecha */}
            <div className="match-result-date">
                {date}
            </div>
        </div>
    );
}

function ResultsSection({ title, icon: Icon, color, matches, loading, emptyMessage }: ResultPanel) {
    return (
        <div className="glass-card" style={{ border: `1px solid ${color}33` }}>
            <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', color }}>
                <Icon size={20} color={color} /> {title}
            </h3>
            {loading ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                    Sincronizando resultados...
                </p>
            ) : matches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                    {emptyMessage || 'No hay resultados disponibles aún. El bot sincroniza cada 6 horas.'}
                </p>
            ) : (
                <div>
                    {matches.map((m) => <MatchCard key={m.fixtureId} match={m} />)}
                </div>
            )}
        </div>
    );
}

export default function Resultados() {
    const [colombiaMatches, setColombiaMatches] = useState<MatchResult[]>([]);
    const [championsMatches, setChampionsMatches] = useState<MatchResult[]>([]);
    const [worldcupMatches, setWorldcupMatches] = useState<MatchResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'system', 'recent_results'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setColombiaMatches(data.colombia || []);
                setChampionsMatches(data.champions || []);
                setWorldcupMatches(data.worldcup || []);
                if (data.updatedAt) {
                    setLastUpdated(new Date(data.updatedAt.toDate()).toLocaleString('es-CO'));
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="fade-in">
            <h1 className="page-title">📋 Resultados de Partidos</h1>

            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Últimos 10 resultados de cada competencia. Actualizado automáticamente cada 6 horas.
            </p>
            {lastUpdated && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2rem' }}>
                    🕐 Última sincronización: {lastUpdated}
                </p>
            )}

            <ResultsSection
                title="Selección Colombia"
                icon={Activity}
                color="var(--primary)"
                matches={colombiaMatches}
                loading={loading}
            />

            <ResultsSection
                title="UEFA Champions League"
                icon={Shield}
                color="var(--accent-bl)"
                matches={championsMatches}
                loading={loading}
            />

            <ResultsSection
                title="FIFA World Cup 2026"
                icon={Globe2}
                color="var(--color-success)"
                matches={worldcupMatches}
                loading={loading}
                emptyMessage="La fase de grupos del Mundial 2026 aún no ha comenzado. Los partidos iniciarán en junio de 2026."
            />
        </div>
    );
}
