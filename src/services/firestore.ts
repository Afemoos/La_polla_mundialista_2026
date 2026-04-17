import {
  collection,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Prediction, RadarMatch } from '../types/firestore';

export function getUserBetsQuery(email: string) {
  return query(
    collection(db, 'predictions'),
    where('email', '==', email),
    orderBy('timestamp', 'desc')
  );
}

export function getWinnersQuery() {
  return query(
    collection(db, 'predictions'),
    where('result', '==', 'GANADOR'),
    orderBy('timestamp', 'desc')
  );
}

export function getAllPredictionsQuery() {
  return query(collection(db, 'predictions'), orderBy('timestamp', 'desc'));
}

export async function togglePredictionStatus(id: string, currentStatus: string) {
  const newStatus = currentStatus === 'PENDIENTE' ? 'PAGADO' : 'PENDIENTE';
  await updateDoc(doc(db, 'predictions', id), { status: newStatus });
}

export async function saveRadarMatch(match: RadarMatch) {
  await setDoc(doc(db, 'system', 'radar_match'), {
    ...match,
    updatedAt: serverTimestamp(),
  });
}

export async function resolveMatchResults(
  bets: Prediction[],
  matchName: string,
  finalMarker: string
) {
  const pendingBets = bets.filter((bet) => bet.matchDetails === matchName && !bet.result);
  let countWinners = 0;

  await Promise.all(
    pendingBets.map(async (bet) => {
      const isWinner = bet.prediction === finalMarker ? 'GANADOR' : 'PERDEDOR';
      if (isWinner === 'GANADOR') countWinners++;
      await updateDoc(doc(db, 'predictions', bet.id!), { result: isWinner });
    })
  );

  return {
    audited: pendingBets.length,
    winners: countWinners,
  };
}
