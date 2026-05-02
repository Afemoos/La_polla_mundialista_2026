import { useEffect, useState } from 'react';
import { onSnapshot, doc, collection, updateDoc, increment, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getAllPredictionsQuery, togglePredictionStatus, resolveCancellation } from '../services/firestore';
import type { Prediction, AppUser } from '../types/firestore';
import { CheckCircle, XCircle, Wifi, Coins, Plus, Minus, RefreshCw } from 'lucide-react';

export default function Admin() {
    const [allBets, setAllBets] = useState<Prediction[]>([]);
    const [apiStatus, setApiStatus] = useState<{ requests_current: number; requests_limit: number; last_updated: any } | null>(null);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [tokenAmounts, setTokenAmounts] = useState<Record<string, number>>({});
    const [syncing, setSyncing] = useState(false);

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

    // Escuchar el estado de la API en tiempo real
    useEffect(() => {
        const unsubApi = onSnapshot(doc(db, 'system', 'api_status'), (snap) => {
            if (snap.exists()) {
                setApiStatus(snap.data() as any);
            }
        });
        return () => unsubApi();
    }, []);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const usersList: AppUser[] = [];
            snap.forEach((d) => {
                usersList.push({ uid: d.id, ...d.data() } as AppUser);
            });
            setUsers(usersList);
        });
        return () => unsubUsers();
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

    const addTokens = async (uid: string, amount: number) => {
        const finalAmount = amount || 1;
        try {
            await updateDoc(doc(db, 'users', uid), { tokens: increment(finalAmount) });
            setTokenAmounts(prev => ({ ...prev, [uid]: 0 }));
            alert(`✅ Se agregaron ${finalAmount} token(s) exitosamente.`);
        } catch (error) {
            console.error("Error adding tokens", error);
            alert("❌ Error al agregar tokens.");
        }
    };

    const removeTokens = async (uid: string, amount: number) => {
        const finalAmount = amount || 1;
        try {
            await updateDoc(doc(db, 'users', uid), { tokens: increment(-finalAmount) });
            setTokenAmounts(prev => ({ ...prev, [uid]: 0 }));
            alert(`✅ Se restaron ${finalAmount} token(s) exitosamente.`);
        } catch (error) {
            console.error("Error removing tokens", error);
            alert("❌ Error al restar tokens.");
        }
    };

    // AI-NOTE: Sincroniza usuarios históricos desde allBets a la colección users
    const syncMissingUsers = async () => {
        setSyncing(true);
        try {
            const existingEmails = new Set(users.map(u => u.email));
            const uniqueEmails = [...new Set(allBets.map(b => b.email).filter(Boolean))] as string[];
            let created = 0;

            for (const email of uniqueEmails) {
                if (!existingEmails.has(email)) {
                    const docId = email.replace(/[.#$/\[\]]/g, '_');
                    await setDoc(doc(db, 'users', docId), {
                        uid: docId,
                        email: email,
                        tokens: 0
                    });
                    created++;
                }
            }

            if (created > 0) {
                alert(`✅ Se sincronizaron ${created} usuario(s) histórico(s). Aparecerán en la tabla en breve.`);
            } else {
                alert('Todos los usuarios históricos ya están registrados.');
            }
        } catch (error) {
            console.error("Error syncing users:", error);
            alert("❌ Error al sincronizar usuarios.");
        }
        setSyncing(false);
    };

    // Eliminado: handleResolveMatch ya no es necesario porque auditor.py lo hace automáticamente
    return (
        <div className="fade-in">
            <h1 className="page-title">⚙️ Panel de Administración</h1>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Vista protegida. Haz clic en el estado de cualquier pago para alternarlo en tiempo real entre PENDIENTE y PAGADO.
            </p>

            {/* CONTADOR API */}
            {apiStatus && (
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(0, 240, 255, 0.05)',
                    border: '1px solid rgba(0, 240, 255, 0.2)',
                    borderRadius: '12px',
                    padding: '0.75rem 1.25rem',
                    marginBottom: '2rem'
                }}>
                    <Wifi size={16} color="var(--accent-bl)" />
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Requests diarias a la API</span>
                        <span style={{ fontWeight: 800, color: 'var(--accent-bl)' }}>
                            {apiStatus.requests_current.toLocaleString()} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {apiStatus.requests_limit.toLocaleString()}</span>
                        </span>
                    </div>
                    {apiStatus.last_updated && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            🕐 {new Date(apiStatus.last_updated.toDate()).toLocaleTimeString('es-CO')}
                        </span>
                    )}
                </div>
            )}

            {/* PANEL DE SOLICITUDES DE CANCELACIÓN */}
            {cancellationRequests.length > 0 && (
                <div className="glass-card" style={{ borderColor: 'var(--color-danger)' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)' }}>
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
                    <CheckCircle size={20} color="var(--color-success)" /> Panel de Control de Ingresos
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
                                        <span style={{ background: 'var(--glass-bg)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
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
                                                background: bet.status === 'PAGADO' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                                                border: `1px solid ${bet.status === 'PAGADO' ? 'var(--color-success)' : 'var(--primary)'}`,
                                                color: bet.status === 'PAGADO' ? 'var(--color-success)' : 'var(--primary)',
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

            {/* PANEL DE GESTIÓN DE TOKENS */}
            <div className="glass-card" style={{ marginTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', margin: 0 }}>
                        <Coins size={20} /> Gestión de Tokens
                    </h3>
                    <button
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.85rem', width: 'auto' }}
                        onClick={syncMissingUsers}
                        disabled={syncing}
                    >
                        <RefreshCw size={16} style={{ marginRight: '6px' }} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar Usuarios Antiguos'}
                    </button>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Tokens Actuales</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay usuarios registrados</td>
                                </tr>
                            ) : users.map((user) => (
                                <tr key={user.uid}>
                                    <td style={{ fontWeight: 600 }}>{user.email}</td>
                                    <td>
                                        <span style={{
                                            background: 'var(--glass-bg)',
                                            padding: '6px 14px',
                                            borderRadius: '20px',
                                            fontWeight: 800,
                                            color: 'var(--primary)',
                                            fontSize: '1rem'
                                        }}>
                                            🪙 {user.tokens}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                min="1"
                                                value={tokenAmounts[user.uid] || ''}
                                                onChange={(e) => setTokenAmounts(prev => ({
                                                    ...prev,
                                                    [user.uid]: e.target.value === '' ? 0 : Number(e.target.value)
                                                }))}
                                                placeholder="Cant."
                                                className="styled-input"
                                                style={{ width: '70px', padding: '6px 8px', textAlign: 'center' }}
                                            />
                                            <button
                                                onClick={() => addTokens(user.uid, tokenAmounts[user.uid] || 0)}
                                                className="btn-primary"
                                                style={{ padding: '6px 10px', fontSize: '0.8rem', width: 'auto' }}
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={() => removeTokens(user.uid, tokenAmounts[user.uid] || 0)}
                                                className="btn-danger-small"
                                                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                            >
                                                <Minus size={14} />
                                            </button>
                                        </div>
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
