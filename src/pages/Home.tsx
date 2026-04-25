import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Activity, Calendar, Zap, Globe2 } from 'lucide-react';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

function MatchRadar({ title, matchData, icon: Icon, color }: { title: string, matchData: any, icon: any, color: string }) {
    const { currentUser } = useAuth() || {};
    const [scoreHome, setScoreHome] = useState(0);
    const [scoreAway, setScoreAway] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const submitPrediction = async (e: React.FormEvent) => {
        e.preventDefault();
        const isConfirmed = window.confirm(
            `¿Estás seguro de tu marcador exacto para el partido ${matchData.teams.home.name} vs ${matchData.teams.away.name}?\n\n` + 
            "Una vez enviada la predicción, no podrás modificarla. Para cualquier corrección deberás contactar al Administrador."
        );
        if (!isConfirmed) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "predictions"), {
                email: currentUser?.email,
                type: "POLla_MUNDIALISTA",
                fixtureId: matchData.fixtureId || null,
                matchDetails: `${matchData.teams.home.name} vs ${matchData.teams.away.name}`,
                prediction: `${scoreHome} - ${scoreAway}`,
                status: "PENDIENTE",
                timestamp: serverTimestamp()
            });
            alert("✅ Predicción enviada exitosamente. Contacta al Admin para confirmar tu pago.");
            setScoreHome(0);
            setScoreAway(0);
        } catch (error: any) {
            alert("Error al enviar predicción: " + error.message);
        }
        setIsSubmitting(false);
    };

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
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 20px', borderRadius: '20px', display: 'inline-block' }}>
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

            <div className="radar-prob">
                <div style={{ flex: 1, background: 'rgba(0, 255, 136, 0.1)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(0,255,136,0.3)' }}>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gana {matchData.teams.home.name}</div>
                    <div style={{ fontWeight: 800, color: '#00FF88' }}>{matchData.probHome}%</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255, 215, 0, 0.1)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(255,215,0,0.3)' }}>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Empate</div>
                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{matchData.probDraw}%</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255, 0, 85, 0.1)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(255,0,85,0.3)' }}>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gana {matchData.teams.away.name}</div>
                    <div style={{ fontWeight: 800, color: 'var(--accent-rd)' }}>{matchData.probAway}%</div>
                </div>
            </div>

            {/* ZONA DE APUESTA */}
            <div className="glass-card" style={{ marginTop: '1rem', border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', marginBottom: '1rem' }}>
                    <Zap size={20} /> Participar en este Evento
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Acierta el marcador exacto para llevarte el acumulado.
                </p>
                
                <form onSubmit={submitPrediction}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 40%', minWidth: '100px' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Goles {matchData.teams.home.name}</label>
                            <input 
                                type="number" 
                                className="styled-input" 
                                min="0" 
                                max="20"
                                value={scoreHome}
                                onChange={(e) => setScoreHome(Number(e.target.value))}
                                required
                            />
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-muted)' }}>-</div>
                        <div style={{ flex: '1 1 40%', minWidth: '100px' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Goles {matchData.teams.away.name}</label>
                            <input 
                                type="number" 
                                className="styled-input" 
                                min="0" 
                                max="20"
                                value={scoreAway}
                                onChange={(e) => setScoreAway(Number(e.target.value))}
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>
                        {isSubmitting ? 'Registrando apuesta...' : 'Enviar Marcador Cerrado'}
                    </button>
                </form>
            </div>
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
            
            <div className="glass-card" style={{ borderLeft: '4px solid #00F0FF' }}>
                <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ✅ Sesión Iniciada Exitosamente
                </h3>
                <p style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</p>
            </div>

            <MatchRadar 
                title="Radar Tricolor: Selección Colombia" 
                matchData={colombiaMatch} 
                icon={Activity} 
                color="#FFD700" 
            />

            <MatchRadar 
                title="Radar Global: Mundial y Champions" 
                matchData={globalMatch} 
                icon={Globe2} 
                color="#00F0FF" 
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
