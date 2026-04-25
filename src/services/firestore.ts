import {
  collection,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Prediction, RadarMatch } from '../types/firestore';

export function getUserBetsQuery(email: string) {
  return query(
    collection(db, 'predictions'),
    where('email', '==', email)
  );
}

export function getWinnersQuery() {
  return query(
    collection(db, 'predictions'),
    where('result', '==', 'GANADA'),
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
      const isWinner = bet.prediction === finalMarker ? 'GANADA' : 'PERDIDA';
      if (isWinner === 'GANADA') countWinners++;
      await updateDoc(doc(db, 'predictions', bet.id!), { result: isWinner });
    })
  );

  return {
    audited: pendingBets.length,
    winners: countWinners,
  };
}

export async function deleteUserBet(id: string) {
  await deleteDoc(doc(db, 'predictions', id));
}

export async function requestBetCancellation(id: string) {
  await updateDoc(doc(db, 'predictions', id), { status: 'CANCELACION_SOLICITADA' });
}

export async function resolveCancellation(id: string, approved: boolean) {
  const newStatus = approved ? 'CANCELADA' : 'PAGADO';
  await updateDoc(doc(db, 'predictions', id), { status: newStatus });
}
