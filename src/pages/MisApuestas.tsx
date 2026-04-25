import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { onSnapshot } from 'firebase/firestore';
import { getUserBetsQuery, deleteUserBet, requestBetCancellation } from '../services/firestore';
import type { Prediction } from '../types/firestore';
import { Clock, Trash2, XCircle } from 'lucide-react';

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
            
            // Ordenamiento local para evitar la necesidad de un Composite Index en Firestore
            betsArray.sort((a, b) => {
                const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
                const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
                return timeB - timeA;
            });
            
            setBets(betsArray);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleDelete = async (id: string) => {
        if (window.confirm("¿Estás seguro de que deseas eliminar esta apuesta? Esta acción es irreversible.")) {
            try {
                await deleteUserBet(id);
            } catch (error: any) {
                alert("Error al eliminar la apuesta: " + error.message);
            }
        }
    };

    const handleCancelRequest = async (id: string) => {
        if (window.confirm("¿Estás seguro de que deseas solicitar la cancelación de esta apuesta pagada? El administrador deberá aprobar la solicitud.")) {
            try {
                await requestBetCancellation(id);
                alert("✅ Solicitud de cancelación enviada al administrador.");
            } catch (error: any) {
                alert("Error al solicitar cancelación: " + error.message);
            }
        }
    };

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
                                    <th>Marcador</th>
                                    <th>Pago</th>
                                    <th>Resultado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bets.map((bet) => {
                                    if (bet.status === 'CANCELADA') {
                                        return (
                                            <tr key={bet.id} style={{ opacity: 0.6, backgroundColor: 'rgba(255, 51, 102, 0.05)' }}>
                                                <td>
                                                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                        {bet.id.slice(0, 8)}...
                                                    </span>
                                                </td>
                                                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    Tu apuesta con ticket ID: {bet.id.slice(0, 8)}... ha sido removida exitosamente.
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <tr key={bet.id}>
                                        <td>
                                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {bet.id.slice(0, 8)}...
                                            </span>
                                        </td>
                                        <td>
                                            {bet.timestamp ? new Date(bet.timestamp.toDate()).toLocaleString() : 'Cargando...'}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{bet.matchDetails || bet.type}</td>
                                        <td>{bet.prediction}</td>
                                        <td>
                                            <span className={`badge ${bet.status === 'PAGADO' ? 'paid' : 'pending'}`}>
                                                {bet.status}
                                            </span>
                                        </td>
                                        <td>
                                            {!bet.result && <span style={{ color: 'var(--text-muted)' }}>⏱️ En Juego</span>}
                                            {bet.result === 'GANADA' && <span style={{ color: '#00FF88', fontWeight: 800 }}>🏆 GANADA</span>}
                                            {bet.result === 'PERDIDA' && <span style={{ color: '#FF3366', fontWeight: 800 }}>💀 PERDIDA</span>}
                                        </td>
                                        <td>
                                            {!bet.result && (
                                                <>
                                                    {bet.status === 'PENDIENTE' && (
                                                <button 
                                                    onClick={() => handleDelete(bet.id!)}
                                                    className="btn-danger-small"
                                                    title="Eliminar apuesta"
                                                >
                                                    <Trash2 size={16} /> Eliminar
                                                </button>
                                            )}
                                            {bet.status === 'PAGADO' && (
                                                <button 
                                                    onClick={() => handleCancelRequest(bet.id!)}
                                                    className="btn-warning-small"
                                                    title="Solicitar cancelación"
                                                >
                                                    <XCircle size={16} /> Solicitar
                                                </button>
                                            )}
                                            {bet.status === 'CANCELACION_SOLICITADA' && (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>En revisión...</span>
                                            )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
