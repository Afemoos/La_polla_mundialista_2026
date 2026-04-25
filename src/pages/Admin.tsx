import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { getAllPredictionsQuery, togglePredictionStatus, resolveCancellation } from '../services/firestore';
import type { Prediction } from '../types/firestore';
import { CheckCircle, XCircle } from 'lucide-react';

export default function Admin() {
    const [allBets, setAllBets] = useState<Prediction[]>([]);

    // Solo retenemos los estados y lógica de control de ingresos

    useEffect(() => {
        const q = getAllPredictionsQuery();
        // Escucha centralizada de todas las apuestas sin filtro
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const betsArray: Prediction[] = [];
            querySnapshot.forEach((d) => {
                betsArray.push({ id: d.id, ...d.data() } as Prediction);
            });
            setAllBets(betsArray);
        });
        return () => unsubscribe();
    }, []);

    const toggleStatus = async (id: string, currentStatus: string) => {
        try {
            await togglePredictionStatus(id, currentStatus);
        } catch (error) {
            console.error("Error updating status", error);
        }
    };

    const handleResolveCancel = async (id: string, approved: boolean) => {
        try {
            await resolveCancellation(id, approved);
        } catch (error) {
            console.error("Error resolving cancellation", error);
        }
    };

    const cancellationRequests = allBets.filter(b => b.status === 'CANCELACION_SOLICITADA');

    // Eliminado: handleResolveMatch ya no es necesario porque auditor.py lo hace automáticamente
    return (
        <div className="fade-in">
            <h1 className="page-title">⚙️ Panel de Administración</h1>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Vista protegida. Haz clic en el estado de cualquier pago para alternarlo en tiempo real entre PENDIENTE y PAGADO.
            </p>

            {/* PANEL DE SOLICITUDES DE CANCELACIÓN */}
            {cancellationRequests.length > 0 && (
                <div className="glass-card" style={{ borderColor: 'rgba(255, 51, 102, 0.5)' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#FF3366' }}>
                        <XCircle size={20} /> Solicitudes de Cancelación Pendientes
                    </h3>
                    
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Evento</th>
                                    <th>Marcador</th>
                                    <th>Acción Requerida</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cancellationRequests.map((bet) => (
                                    <tr key={bet.id}>
                                        <td style={{ fontWeight: 600 }}>{bet.email}</td>
                                        <td>{bet.matchDetails || bet.type}</td>
                                        <td>{bet.prediction}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button 
                                                    onClick={() => handleResolveCancel(bet.id!, true)}
                                                    className="btn-danger-small"
                                                >
                                                    Aprobar Cancelación
                                                </button>
                                                <button 
                                                    onClick={() => handleResolveCancel(bet.id!, false)}
                                                    className="btn-primary"
                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto' }}
                                                >
                                                    Denegar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PANEL ÚNICO PARA ADMINISTRADORES */}
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
