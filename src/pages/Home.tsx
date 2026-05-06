import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Activity, Calendar, Globe2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function MatchRadar({ title, matchData, icon: Icon, color }: { title: string, matchData: any, icon: any, color: string }) {
    if (!matchData) {
        return (
            <div className="glass-card" style={{ marginTop: '2rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', color }}>
                    <Icon color={color} /> {title}
                </h2>
                <p style={{ color: 'var(--text-muted)' }}>Buscando partido en curso...</p>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '2rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', color }}>
                <Icon color={color} /> {title}
            </h2>
            
            <div className="glass-card radar-teams" style={{ border: `1px solid ${color}33` }}>
                <div style={{ flex: 1 }}>
                    <img src={matchData.teams.home.logo} width="80" alt="Home" />
                    <h3 style={{ marginTop: '10px', fontSize: 'clamp(1rem, 4vw, 1.3rem)' }}>{matchData.teams.home.name}</h3>
                </div>
                
                <div style={{ flex: 1 }}>
                    <div style={{ background: 'var(--glass-bg)', padding: '10px 20px', borderRadius: '20px', display: 'inline-block' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>VS</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                            <Calendar size={12} style={{ marginRight: '5px' }} />
                            {new Date(matchData.fixture.date).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {matchData.fixture.venue.name}
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1 }}>
                    <img src={matchData.teams.away.logo} width="80" alt="Away" />
                    <h3 style={{ marginTop: '10px', fontSize: 'clamp(1rem, 4vw, 1.3rem)' }}>{matchData.teams.away.name}</h3>
                </div>
            </div>

            {/* AI-NOTE: Zona de apuesta y probabilidades temporalmente deshabilitadas */}
        </div>
    );
}

export default function Home() {
    const { currentUser } = useAuth() || {};
    const [globalMatch, setGlobalMatch] = useState<any>(null);
    const [colombiaMatch, setColombiaMatch] = useState<any>(null);

    useEffect(() => {
        const unsubGlobal = onSnapshot(doc(db, "system", "radar_match"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setGlobalMatch({
                    fixtureId: data.fixtureId,
                    teams: { home: { name: data.homeTeam, logo: data.homeFlag }, away: { name: data.awayTeam, logo: data.awayFlag } },
                    fixture: { date: data.date, venue: { name: data.stadium } },
                    probHome: data.probHome, probDraw: data.probDraw, probAway: data.probAway
                });
            } else {
                setGlobalMatch(null);
            }
        });

        const unsubColombia = onSnapshot(doc(db, "system", "colombia_match"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setColombiaMatch({
                    fixtureId: data.fixtureId,
                    teams: { home: { name: data.homeTeam, logo: data.homeFlag }, away: { name: data.awayTeam, logo: data.awayFlag } },
                    fixture: { date: data.date, venue: { name: data.stadium } },
                    probHome: data.probHome, probDraw: data.probDraw, probAway: data.probAway
                });
            } else {
                setColombiaMatch(null);
            }
        });

        return () => {
            unsubGlobal();
            unsubColombia();
        };
    }, []);

    return (
        <div className="fade-in">
            <h1 className="page-title">🏆 La Polla Mundialista</h1>
            
            <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-bl)' }}>
                <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ✅ Sesión Iniciada Exitosamente
                </h3>
                <p style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</p>
            </div>

            <MatchRadar 
                title="Radar Tricolor: Selección Colombia" 
                matchData={colombiaMatch} 
                icon={Activity} 
                color="var(--primary)" 
            />

            <MatchRadar 
                title="Radar Global: Mundial y Champions" 
                matchData={globalMatch} 
                icon={Globe2} 
                color="var(--accent-bl)" 
            />
            
            <div className="glass-card" style={{ marginTop: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-rd)' }}>
                    <ShieldAlert size={20} /> Información Importante
                </h3>
                <p style={{ marginTop: '10px', color: 'var(--text-muted)' }}>
                    Recuerda que todas las predicciones enviadas están sujetas al pago de la inscripción. El administrador actualizará tu estado de "Pendiente" a "Pagado" una vez confirmado el abono. Las apuestas no confirmadas antes del pitazo inicial serán ignoradas.
                </p>
            </div>
        </div>
    );
}
