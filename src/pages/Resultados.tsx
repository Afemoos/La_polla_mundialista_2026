import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Trophy, Medal, Star } from 'lucide-react';

export default function Resultados() {
    const [winners, setWinners] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = collection(db, "predictions");
        // Descargamos todo para no requerir un Indice manual de Firebase e iteramos localmente.
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const betsArray: any[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Filtramos unicamente a la casta de ganadores
                if (data.result === 'GANADOR') {
                    betsArray.push({ id: doc.id, ...data });
                }
            });
            // Ordenar por fecha del partido / creación para que los últimos ganadores salgan arriba
            betsArray.sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            setWinners(betsArray);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="fade-in">
            <h1 className="page-title">🌟 Salón de la Fama</h1>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Aquí se inmortalizan y exaltan las predicciones perfectas. Los visionarios del fútbol.
            </p>

            <div className="glass-card" style={{ border: '2px solid rgba(255, 215, 0, 0.5)', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(0,0,0,0) 100%)' }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#FFD700' }}>
                    <Medal size={24} /> Ganadores Históricos
                </h3>

                {loading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Cargando leyendas...</p>
                ) : winners.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>Aún no hay ganadores registrados. ¿Serás tú el primero?</p>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Visionario</th>
                                    <th>Partido Acertado</th>
                                    <th>Puntaje Dorado</th>
                                    <th>Fecha de Consagración</th>
                                </tr>
                            </thead>
                            <tbody>
                                {winners.map((winner, index) => (
                                    <tr key={winner.id}>
                                        <td style={{ fontWeight: 800, color: index === 0 ? '#FFD700' : 'var(--text-primary)' }}>
                                            {index === 0 && <Star size={14} color="#FFD700" style={{ display: 'inline', marginRight: '5px' }}/>}
                                            {winner.email}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)' }}>{winner.matchDetails}</td>
                                        <td style={{ color: '#00FF88', fontWeight: 900, fontSize: '1.1rem' }}>{winner.prediction}</td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            {winner.timestamp ? new Date(winner.timestamp.toDate()).toLocaleDateString() : 'Desconocido'}
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
