import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { onSnapshot } from 'firebase/firestore';
import { getUserBetsQuery } from '../services/firestore';
import type { Prediction } from '../types/firestore';
import { Clock } from 'lucide-react';

export default function MisApuestas() {
    const { currentUser } = useAuth() || {};
    const [bets, setBets] = useState<Prediction[]>([]);

    useEffect(() => {
        if (!currentUser?.email) return;

        const q = getUserBetsQuery(currentUser.email);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const betsArray: Prediction[] = [];
            querySnapshot.forEach((doc) => {
                betsArray.push({ id: doc.id, ...doc.data() } as Prediction);
            });
            
            betsArray.sort((a, b) => {
                const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
                const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
                return timeB - timeA;
            });
            
            setBets(betsArray);
        });

        return () => unsubscribe();
    }, [currentUser]);

    return (
        <div className="fade-in">
            <h1 className="page-title">📊 Mis Apuestas y Registros</h1>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Aquí puedes ver el historial en tiempo real y el estado de todas las predicciones enviadas.
            </p>

            <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} color="var(--primary)" /> Mis Movimientos
                </h3>
                
                {bets.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No tienes registros activos en este momento.</p>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Ticket ID</th>
                                    <th>Fecha</th>
                                    <th>Evento</th>
                                    <th>Marcador Apostado</th>
                                    <th>Marcador Oficial</th>
                                    <th>Resultado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bets.map((bet) => (
                                    <tr key={bet.id}>
                                        <td>
                                            <span style={{ background: 'var(--glass-bg)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {bet.id.slice(0, 8)}...
                                            </span>
                                        </td>
                                        <td>
                                            {bet.timestamp ? new Date(bet.timestamp.toDate()).toLocaleString() : 'Cargando...'}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{bet.matchDetails || bet.type}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {bet.homeLogo && <img src={bet.homeLogo} width="20" alt="Home" />}
                                                <span style={{ fontWeight: 800 }}>{bet.prediction}</span>
                                                {bet.awayLogo && <img src={bet.awayLogo} width="20" alt="Away" />}
                                            </div>
                                        </td>
                                        <td>
                                            {bet.finalScore ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {bet.homeLogo && <img src={bet.homeLogo} width="20" alt="Home" />}
                                                    <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{bet.finalScore}</span>
                                                    {bet.awayLogo && <img src={bet.awayLogo} width="20" alt="Away" />}
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            {!bet.result && <span style={{ color: 'var(--text-muted)' }}>⏱️ En Juego</span>}
                                            {bet.result === 'GANADA' && <span style={{ color: 'var(--color-success)', fontWeight: 800 }}>🏆 GANADA</span>}
                                            {bet.result === 'PERDIDA' && <span style={{ color: 'var(--color-danger)', fontWeight: 800 }}>💀 PERDIDA</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
