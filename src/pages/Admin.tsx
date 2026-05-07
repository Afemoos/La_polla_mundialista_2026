import { useEffect, useState } from 'react';
import { onSnapshot, doc, collection, updateDoc, increment, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getAllPredictionsQuery } from '../services/firestore';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { Prediction, AppUser } from '../types/firestore';
import { Wifi, Coins, Plus, Minus, RefreshCw, Eye, ChevronDown, ChevronUp, Loader, FileSpreadsheet, History } from 'lucide-react';

export default function Admin() {
    const { currentUser } = useAuth() || {};
    const [allBets, setAllBets] = useState<Prediction[]>([]);
    const [apiStatus, setApiStatus] = useState<{ requests_current: number; requests_limit: number; last_updated: any } | null>(null);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [tokenAmounts, setTokenAmounts] = useState<Record<string, number>>({});
    const [syncing, setSyncing] = useState(false);
    const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
    const [isTokensOpen, setIsTokensOpen] = useState(true);
    const [isHistorialOpen, setIsHistorialOpen] = useState(false);
    const [excelSyncing, setExcelSyncing] = useState(false);
    const [isResetOpen, setIsResetOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetError, setResetError] = useState('');
    const [resetDone, setResetDone] = useState<{ predictions: number; brackets: number; tokensReset: number; duplicatesRemoved: number } | null>(null);

    useEffect(() => {
        const q = getAllPredictionsQuery();
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const betsArray: Prediction[] = [];
            querySnapshot.forEach((d) => {
                betsArray.push({ id: d.id, ...d.data() } as Prediction);
            });
            setAllBets(betsArray);
        });
        return () => unsubscribe();
    }, []);

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

    const handleFactoryReset = async () => {
        if (!confirm('¿Estás seguro? Esta acción eliminará TODAS las predicciones y brackets. Los equipos, jugadores y configuraciones del sistema no se verán afectados.')) return;
        if (!confirm('ÚLTIMA CONFIRMACIÓN: ¿Realmente quieres formatear de fábrica?')) return;

        setIsResetting(true);
        setResetError('');
        setResetDone(null);

        try {
            let deletedPredictions = 0;
            let deletedBrackets = 0;

            // Eliminar predicciones
            const predictionsSnap = await getDocs(collection(db, 'predictions'));
            const predictionBatches: Prediction[][] = [];
            let currentBatch: Prediction[] = [];
            predictionsSnap.forEach(d => {
                currentBatch.push({ id: d.id } as Prediction);
                if (currentBatch.length >= 500) {
                    predictionBatches.push(currentBatch);
                    currentBatch = [];
                }
            });
            if (currentBatch.length > 0) predictionBatches.push(currentBatch);

            for (const batch of predictionBatches) {
                const wb = writeBatch(db);
                batch.forEach(p => wb.delete(doc(db, 'predictions', p.id)));
                await wb.commit();
                deletedPredictions += batch.length;
            }

            // Eliminar brackets
            const bracketsSnap = await getDocs(collection(db, 'brackets'));
            const bracketBatches: string[][] = [];
            let currentBracketBatch: string[] = [];
            bracketsSnap.forEach(d => {
                currentBracketBatch.push(d.id);
                if (currentBracketBatch.length >= 500) {
                    bracketBatches.push(currentBracketBatch);
                    currentBracketBatch = [];
                }
            });
            if (currentBracketBatch.length > 0) bracketBatches.push(currentBracketBatch);

            for (const batch of bracketBatches) {
                const wb = writeBatch(db);
                batch.forEach(id => wb.delete(doc(db, 'brackets', id)));
                await wb.commit();
                deletedBrackets += batch.length;
            }

            // Resetear tokens de todos los usuarios a 0
            let tokensReset = 0;
            const usersSnap = await getDocs(collection(db, 'users'));
            const userBatches: string[][] = [];
            let currentUserBatch: string[] = [];
            usersSnap.forEach(d => {
                currentUserBatch.push(d.id);
                if (currentUserBatch.length >= 500) {
                    userBatches.push(currentUserBatch);
                    currentUserBatch = [];
                }
            });
            if (currentUserBatch.length > 0) userBatches.push(currentUserBatch);

            for (const batch of userBatches) {
                const wb = writeBatch(db);
                batch.forEach(id => wb.update(doc(db, 'users', id), { tokens: 0 }));
                await wb.commit();
                tokensReset += batch.length;
            }

            // Eliminar usuarios duplicados (mismo email, diferentes UID)
            // AI-NOTE: Ocurre cuando un usuario elimina y re-crea su cuenta de Google
            let duplicatesRemoved = 0;
            const usersForDedup = await getDocs(collection(db, 'users'));
            const byEmail: Record<string, { uid: string; tokens: number }[]> = {};
            usersForDedup.forEach(d => {
                const data = d.data();
                const email = data.email || '';
                if (!byEmail[email]) byEmail[email] = [];
                byEmail[email].push({ uid: d.id, tokens: data.tokens || 0 });
            });
            const toDelete: string[] = [];
            for (const [email, entries] of Object.entries(byEmail)) {
                if (entries.length <= 1) continue;
                // Conservar el que tenga más tokens; si hay empate, el primero
                entries.sort((a, b) => b.tokens - a.tokens);
                const [keep, ...remove] = entries;
                remove.forEach(r => toDelete.push(r.uid));
            }
            if (toDelete.length > 0) {
                const dedupBatches: string[][] = [];
                let currentDedupBatch: string[] = [];
                toDelete.forEach(id => {
                    currentDedupBatch.push(id);
                    if (currentDedupBatch.length >= 500) {
                        dedupBatches.push(currentDedupBatch);
                        currentDedupBatch = [];
                    }
                });
                if (currentDedupBatch.length > 0) dedupBatches.push(currentDedupBatch);
                for (const batch of dedupBatches) {
                    const wb = writeBatch(db);
                    batch.forEach(id => wb.delete(doc(db, 'users', id)));
                    await wb.commit();
                    duplicatesRemoved += batch.length;
                }
            }

            setResetDone({ predictions: deletedPredictions, brackets: deletedBrackets, tokensReset, duplicatesRemoved });
        } catch (e: any) {
            setResetError('Error: ' + (e?.message || 'Desconocido'));
        }
        setIsResetting(false);
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

    const handleSyncExcel = async () => {
        setExcelSyncing(true);
        try {
            const res = await fetch('/api/trigger-excel-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentUser?.email || '' }),
            });
            const data = await res.json();
            if (res.ok) {
                alert('✅ Sincronización a Excel iniciada. Los datos se reflejarán en la hoja de cálculo en breve.');
            } else {
                alert(`❌ Error: ${data.error || 'No autorizado'}`);
            }
        } catch (error) {
            console.error("Error triggering Excel sync:", error);
            alert('❌ Error de conexión al sincronizar con Excel.');
        }
        setExcelSyncing(false);
    };

    return (
        <div className="fade-in">
            <h1 className="page-title">⚙️ Panel de Administración</h1>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                    Vista protegida. Gestiona tokens y auditoría de apuestas.
                </p>
                <button
                    className="btn-primary"
                    style={{ padding: '10px 20px', fontSize: '0.9rem', width: 'auto', background: 'var(--color-success-bg)', border: '1px solid var(--color-success)', color: 'var(--color-success)' }}
                    onClick={handleSyncExcel}
                    disabled={excelSyncing}
                >
                    {excelSyncing ? <><Loader size={16} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} /> Sincronizando...</> : <><FileSpreadsheet size={16} style={{ marginRight: '6px' }} /> Exportar a Excel (Manual)</>}
                </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
                Nota: El botón reemplaza la hoja completa de Auditoría evitando duplicados. Extensiones de terceros sí pueden causar duplicados.
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

            {/* 1. GESTIÓN DE TOKENS (abierto por defecto) */}
            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isTokensOpen ? '1.5rem' : '0', flexWrap: 'wrap', gap: '8px', cursor: 'pointer' }}
                    onClick={() => setIsTokensOpen(!isTokensOpen)}
                >
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', margin: 0 }}>
                        <Coins size={20} /> Gestión de Tokens
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '0.85rem', width: 'auto' }}
                            onClick={(e) => { e.stopPropagation(); syncMissingUsers(); }}
                            disabled={syncing}
                        >
                            <RefreshCw size={16} style={{ marginRight: '6px' }} />
                            {syncing ? 'Sincronizando...' : 'Sincronizar Usuarios Antiguos'}
                        </button>
                        {isTokensOpen ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                    </div>
                </div>

                {isTokensOpen && (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Tokens Actuales</th>
                                    <th>Acción</th>
                                    <th>Pred.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr><td colSpan={4} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay usuarios registrados</td></tr>
                                ) : users.map((user) => (
                                    <tr key={user.uid}>
                                        <td style={{ fontWeight: 600 }}>{user.email}</td>
                                        <td>
                                            <span style={{ background: 'var(--glass-bg)', padding: '6px 14px', borderRadius: '20px', fontWeight: 800, color: 'var(--primary)', fontSize: '1rem' }}>
                                                🪙 {user.tokens}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input type="number" min="1" value={tokenAmounts[user.uid] || ''}
                                                    onChange={(e) => setTokenAmounts(prev => ({ ...prev, [user.uid]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                                    placeholder="Cant." className="styled-input" style={{ width: '70px', padding: '6px 8px', textAlign: 'center' }} />
                                                <button onClick={() => addTokens(user.uid, tokenAmounts[user.uid] || 0)} className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem', width: 'auto' }}><Plus size={14} /></button>
                                                <button onClick={() => removeTokens(user.uid, tokenAmounts[user.uid] || 0)} className="btn-danger-small" style={{ padding: '6px 10px', fontSize: '0.8rem' }}><Minus size={14} /></button>
                                            </div>
                                        </td>
                                        <td>
                                            <button onClick={() => setSelectedUserEmail(user.email)} className="btn-primary"
                                                style={{ padding: '6px 10px', fontSize: '0.8rem', width: 'auto', background: 'var(--glass-bg)', border: '1px solid var(--accent-bl)', color: 'var(--accent-bl)' }} title="Ver predicciones">
                                                <Eye size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* PREDICCIONES DEL USUARIO SELECCIONADO */}
            {selectedUserEmail && (
                <div className="glass-card" style={{ marginBottom: '1.5rem', borderColor: 'var(--accent-bl)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-bl)', margin: 0 }}>
                            <Eye size={20} /> Predicciones de {selectedUserEmail}
                        </h3>
                        <button onClick={() => setSelectedUserEmail(null)} className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto', background: 'var(--glass-bg)', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}>
                            Cerrar
                        </button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Partido</th>
                                    <th>Marcador</th>
                                    <th>Tokens</th>
                                    <th>Estado</th>
                                    <th>Tiempo Restante</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allBets.filter(b => b.email === selectedUserEmail && b.type === 'POLla_MUNDIALISTA').length === 0 ? (
                                    <tr><td colSpan={5} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay predicciones registradas en la Polla Mundialista</td></tr>
                                ) : allBets.filter(b => b.email === selectedUserEmail && b.type === 'POLla_MUNDIALISTA').map((bet) => {
                                    const now = new Date();
                                    const locked = bet.lockedAt?.toDate ? bet.lockedAt.toDate() : null;
                                    const hoursLeft = locked ? 48 - ((now.getTime() - locked.getTime()) / (1000 * 60 * 60)) : -1;
                                    const isBlocked = hoursLeft <= 0;
                                    return (
                                        <tr key={bet.id}>
                                            <td style={{ fontWeight: 600 }}>{bet.matchDetails}</td>
                                            <td>{bet.prediction}</td>
                                            <td>{bet.tokenCost || 'N/A'}</td>
                                            <td>
                                                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                                                    background: isBlocked ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                                                    color: isBlocked ? 'var(--color-danger)' : 'var(--color-success)',
                                                    border: `1px solid ${isBlocked ? 'var(--color-danger)' : 'var(--color-success)'}` }}>
                                                    {isBlocked ? 'Bloqueado' : 'Activo'}
                                                </span>
                                            </td>
                                            <td>
                                                {locked === null ? (<span style={{ color: 'var(--text-muted)' }}>—</span>)
                                                : isBlocked ? (<span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Bloqueado</span>)
                                                : (<span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{Math.floor(hoursLeft)}h {Math.floor((hoursLeft % 1) * 60)}m</span>)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 2. HISTORIAL DE RECARGAS (colapsado por defecto) */}
            <div className="glass-card">
                <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isHistorialOpen ? '1.5rem' : '0', cursor: 'pointer' }}
                    onClick={() => setIsHistorialOpen(!isHistorialOpen)}
                >
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <History size={20} color="var(--primary)" /> Historial de Recargas de Tokens
                    </h3>
                    {isHistorialOpen ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>

                {isHistorialOpen && (
                    <div className="table-container">
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Saldo actual de tokens por usuario. Las recargas y descuentos se realizan desde la sección de Gestión de Tokens.
                        </p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Email</th>
                                    <th>Balance de Tokens</th>
                                    <th>Predicciones Activas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr><td colSpan={4} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay usuarios registrados</td></tr>
                                ) : users.map((user) => {
                                    const userPredictionCount = allBets.filter(b => b.email === user.email).length;
                                    return (
                                        <tr key={user.uid}>
                                            <td style={{ fontWeight: 600 }}>👤 Usuario</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                                            <td>
                                                <span style={{ background: 'var(--color-success-bg)', padding: '6px 14px', borderRadius: '20px', fontWeight: 800, color: 'var(--color-success)', fontSize: '1rem' }}>
                                                    🪙 {user.tokens}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ color: 'var(--text-muted)' }}>{userPredictionCount} predicción(es)</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Formateo de Fábrica */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    onClick={() => setIsResetOpen(!isResetOpen)}
                >
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)' }}>
                        <AlertTriangle size={20} /> Formateo de Fábrica
                    </h3>
                    {isResetOpen ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>

                {isResetOpen && (
                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                            <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginBottom: '0.5rem' }}>⚠️ Acción irreversible</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                Esta acción: (1) eliminará todas las <strong>predicciones</strong> y <strong>brackets</strong>, (2) reseteará los <strong>tokens</strong> de todos los usuarios a 0, (3) eliminará <strong>usuarios duplicados</strong> (mismo email, distinto UID).
                                No se borrarán equipos, jugadores ni configuraciones del sistema.
                            </p>
                        </div>
                        {resetError && (
                            <p style={{ color: 'var(--color-danger)', marginBottom: '1rem', fontSize: '0.9rem' }}>{resetError}</p>
                        )}
                        {resetDone !== null && (
                            <p style={{ color: 'var(--color-success)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                ✅ Limpieza completada: {resetDone.predictions} predicciones, {resetDone.brackets} brackets eliminados, {resetDone.tokensReset} tokens reseteados, {resetDone.duplicatesRemoved} duplicados eliminados.
                            </p>
                        )}
                        <button
                            onClick={handleFactoryReset}
                            disabled={isResetting}
                            className="glass-btn"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'var(--color-danger)',
                                color: 'white',
                                border: 'none',
                                fontWeight: 600,
                                opacity: isResetting ? 0.6 : 1,
                            }}
                        >
                            {isResetting ? (
                                <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Formateando...</>
                            ) : (
                                <><Trash2 size={18} /> Formatear de Fábrica</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
