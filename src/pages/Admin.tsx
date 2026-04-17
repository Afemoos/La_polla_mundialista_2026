import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle, Radio } from 'lucide-react';

const WORLD_CUP_TEAMS = [
    { country: "Argentina", code: "ar" },
    { country: "Brasil", code: "br" },
    { country: "Colombia", code: "co" },
    { country: "Uruguay", code: "uy" },
    { country: "Ecuador", code: "ec" },
    { country: "Venezuela", code: "ve" },
    { country: "Perú", code: "pe" },
    { country: "Chile", code: "cl" },
    { country: "Paraguay", code: "py" },
    { country: "Bolivia", code: "bo" },
    { country: "Francia", code: "fr" },
    { country: "Inglaterra", code: "gb-eng" },
    { country: "España", code: "es" },
    { country: "Alemania", code: "de" },
    { country: "Portugal", code: "pt" },
    { country: "Italia", code: "it" },
    { country: "Países Bajos", code: "nl" },
    { country: "Estados Unidos", code: "us" },
    { country: "México", code: "mx" },
    { country: "Canadá", code: "ca" },
    { country: "Marruecos", code: "ma" },
    { country: "Senegal", code: "sn" },
    { country: "Japón", code: "jp" },
    { country: "Corea del Sur", code: "kr" },
];

export default function Admin() {
    const [allBets, setAllBets] = useState<any[]>([]);

    const [radarHomeCode, setRadarHomeCode] = useState("co");
    const [radarAwayCode, setRadarAwayCode] = useState("br");
    const [radarStadium, setRadarStadium] = useState("Metropolitano Roberto Meléndez");
    const [radarDate, setRadarDate] = useState("");
    const [radarProbHome, setRadarProbHome] = useState(45);
    const [radarProbDraw, setRadarProbDraw] = useState(45);
    const [radarProbAway, setRadarProbAway] = useState(10);
    const [radarSaving, setRadarSaving] = useState(false);

    // Estados para la Clausura de Partidos
    const [resolveMatchName, setResolveMatchName] = useState("");
    const [resolveScoreHome, setResolveScoreHome] = useState(0);
    const [resolveScoreAway, setResolveScoreAway] = useState(0);
    const [resolveWorking, setResolveWorking] = useState(false);

    // Extraer opciones únicas de los detalles de las apuestas activas (sin resultado todavía)
    const matchOptions = Array.from(new Set(allBets.filter(b => !b.result && b.matchDetails).map(b => b.matchDetails as string)));

    useEffect(() => {
        const q = collection(db, "predictions");
        // Escucha centralizada de todas las apuestas sin filtro
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const betsArray: any[] = [];
            querySnapshot.forEach((d) => {
                betsArray.push({ id: d.id, ...d.data() });
            });
            betsArray.sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            setAllBets(betsArray);
        });
        return () => unsubscribe();
    }, []);

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === "PENDIENTE" ? "PAGADO" : "PENDIENTE";
        try {
            await updateDoc(doc(db, "predictions", id), {
                status: newStatus
            });
        } catch (error) {
            console.error("Error updating status", error);
        }
    };

    const handleRadarSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (radarProbHome + radarProbDraw + radarProbAway !== 100) {
            alert("❌ ERROR: Las sumatorias de probabilidades deben dar exactamente 100%.");
            return;
        }
        setRadarSaving(true);
        try {
            const homeName = WORLD_CUP_TEAMS.find(t => t.code === radarHomeCode)?.country || "Local";
            const awayName = WORLD_CUP_TEAMS.find(t => t.code === radarAwayCode)?.country || "Visitante";
            
            await setDoc(doc(db, "system", "radar_match"), {
                homeTeam: homeName,
                homeFlag: `https://flagcdn.com/w160/${radarHomeCode}.png`,
                awayTeam: awayName,
                awayFlag: `https://flagcdn.com/w160/${radarAwayCode}.png`,
                date: radarDate,
                stadium: radarStadium,
                probHome: radarProbHome,
                probDraw: radarProbDraw,
                probAway: radarProbAway,
                updatedAt: serverTimestamp()
            });
            alert("✅ ¡Radar Tricolor ha sido actualizado globalmente para todos los usuarios al instante!");
        } catch (error: any) {
            alert("Error al actualizar Radar: " + error.message);
        }
        setRadarSaving(false);
    };

    const handleResolveMatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resolveMatchName) return;

        const isConfirmed = window.confirm(`¿Seguro que deseas sellar el partido "${resolveMatchName}" con el marcador ${resolveScoreHome}-${resolveScoreAway}?\n\nEsta acción procesará dictámenes de GANADOR/PERDEDOR de forma irreversible.`);
        if(!isConfirmed) return;

        setResolveWorking(true);
        try {
            const finalMarker = `${resolveScoreHome} - ${resolveScoreAway}`;
            let countWinners = 0;
            
            const pendingBets = allBets.filter(b => b.matchDetails === resolveMatchName && !b.result);
            
            await Promise.all(pendingBets.map(async (bet) => {
                const isWinner = bet.prediction === finalMarker ? "GANADOR" : "PERDEDOR";
                if(isWinner === "GANADOR") countWinners++;
                await updateDoc(doc(db, "predictions", bet.id), { result: isWinner });
            }));

            alert(`✅ PARTIDO SELLADO.\n\nApuestas Auditadas: ${pendingBets.length}\nAcertaron al exacto: ${countWinners}`);
            setResolveScoreHome(0);
            setResolveScoreAway(0);
            setResolveMatchName("");
        } catch (error: any) {
            alert("Error al auditar marcadores: " + error.message);
        }
        setResolveWorking(false);
    };

    return (
        <div className="fade-in">
            <h1 className="page-title">⚙️ Panel de Administración</h1>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Vista protegida. Haz clic en el estado de cualquier pago para alternarlo en tiempo real entre PENDIENTE y PAGADO.
            </p>

            {/* CONTROL DEL RADAR TRICOLOR */}
            <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', color: 'var(--primary)' }}>
                    <Radio size={20} /> Transmisión Maestro (Cambiar Partido)
                </h3>
                <form onSubmit={handleRadarSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Local</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <img src={`https://flagcdn.com/w40/${radarHomeCode}.png`} width="25" alt="bandera" style={{ borderRadius: '4px' }}/>
                                <select className="input-field" value={radarHomeCode} onChange={e => setRadarHomeCode(e.target.value)} required>
                                    {WORLD_CUP_TEAMS.map(t => <option key={t.code} value={t.code}>{t.country}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Visitante</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <img src={`https://flagcdn.com/w40/${radarAwayCode}.png`} width="25" alt="bandera" style={{ borderRadius: '4px' }}/>
                                <select className="input-field" value={radarAwayCode} onChange={e => setRadarAwayCode(e.target.value)} required>
                                    {WORLD_CUP_TEAMS.map(t => <option key={t.code} value={t.code}>{t.country}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Estadio</label>
                            <input type="text" className="input-field" value={radarStadium} onChange={e => setRadarStadium(e.target.value)} placeholder="Ej: Hard Rock Stadium" required />
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Fecha y Hora Local</label>
                            <input type="datetime-local" className="input-field" value={radarDate} onChange={e => setRadarDate(e.target.value)} required />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Probabilidades (Debe sumar 100%)</label>
                        <div style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                                <span style={{ fontSize:'0.7rem', color:'#00FF88', display:'block', marginBottom:'5px'}}>% GANA LOCAL</span>
                                <input type="number" className="input-field" style={{ textAlign: 'center' }} min="0" max="100" value={radarProbHome} onChange={e => setRadarProbHome(Number(e.target.value))} required />
                            </div>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                                <span style={{ fontSize:'0.7rem', color:'var(--primary)', display:'block', marginBottom:'5px'}}>% EMPATE</span>
                                <input type="number" className="input-field" style={{ textAlign: 'center' }} min="0" max="100" value={radarProbDraw} onChange={e => setRadarProbDraw(Number(e.target.value))} required />
                            </div>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                                <span style={{ fontSize:'0.7rem', color:'var(--accent-rd)', display:'block', marginBottom:'5px'}}>% GANA VISITA</span>
                                <input type="number" className="input-field" style={{ textAlign: 'center' }} min="0" max="100" value={radarProbAway} onChange={e => setRadarProbAway(Number(e.target.value))} required />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="button-primary" style={{ marginTop: '0.5rem', background: 'var(--primary)', color: '#000' }} disabled={radarSaving}>
                        {radarSaving ? "Publicando en Vivo..." : "Publicar Radar Globalmente"}
                    </button>
                </form>
            </div>

            {/* RESOLUCIÓN DE VICTORIAS */}
            <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid rgba(255, 0, 85, 0.3)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', color: 'var(--accent-rd)' }}>
                    🏁 Clausurar Partido (Auditoría)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Selecciona un evento de la base de datos y estipula su marcador final oficial. El algoritmo recorrerá todas las apuestas de los usuarios y les dictaminará victoria o derrota.
                </p>

                <form onSubmit={handleResolveMatch} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Evento a Evaluar</label>
                        <select className="input-field" value={resolveMatchName} onChange={e => setResolveMatchName(e.target.value)} required>
                            <option value="">Selecciona el partido...</option>
                            {matchOptions.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Goles Local</label>
                            <input type="number" className="input-field" min="0" max="20" value={resolveScoreHome} onChange={e => setResolveScoreHome(Number(e.target.value))} required />
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-muted)' }}>-</div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Goles Visitante</label>
                            <input type="number" className="input-field" min="0" max="20" value={resolveScoreAway} onChange={e => setResolveScoreAway(Number(e.target.value))} required />
                        </div>
                    </div>

                    <button type="submit" className="button-primary" style={{ marginTop: '0.5rem', background: 'var(--accent-rd)', color: '#fff' }} disabled={resolveWorking || matchOptions.length === 0}>
                        {resolveWorking ? "Escudriñando Base de Datos..." : "Auditar Ganadores"}
                    </button>
                </form>
            </div>

            <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={20} color="#00FF88" /> Panel de Control de Ingresos
                </h3>
                
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Ticket ID</th>
                                <th>Usuario</th>
                                <th>Evento</th>
                                <th>Marcador</th>
                                <th>Fecha (DD/MM)</th>
                                <th>Acción Inmediata</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allBets.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay apuestas regitradas</td>
                                </tr>
                            ) : allBets.map((bet) => (
                                <tr key={bet.id}>
                                    <td>
                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                            {bet.id.slice(0, 8)}...
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{bet.email}</td>
                                    <td>{bet.matchDetails || bet.type}</td>
                                    <td>{bet.prediction}</td>
                                    <td>{bet.timestamp ? new Date(bet.timestamp.toDate()).toLocaleDateString() : 'N/A'}</td>
                                    <td>
                                        <button 
                                            onClick={() => toggleStatus(bet.id, bet.status)}
                                            style={{
                                                background: bet.status === 'PAGADO' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 215, 0, 0.2)',
                                                border: `1px solid ${bet.status === 'PAGADO' ? '#00FF88' : 'var(--primary)'}`,
                                                color: bet.status === 'PAGADO' ? '#00FF88' : 'var(--primary)',
                                                padding: '8px 16px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                fontWeight: 800,
                                                minWidth: '110px'
                                            }}
                                        >
                                            {bet.status}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
