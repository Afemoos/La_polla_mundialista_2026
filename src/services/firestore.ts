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
  getDocs,
  getDoc,
  writeBatch,
  increment,
  limit,
  startAt,
  endAt,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Prediction, RadarMatch, WorldCupTeam, Player, Bracket, FlatPlayer } from '../types/firestore';

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

export async function getTeamsByGroup(group: string): Promise<WorldCupTeam[]> {
  const teamsRef = collection(db, `Teams/world_cup_2026/Group_${group}`);
  const snapshot = await getDocs(teamsRef);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as unknown as WorldCupTeam[];
}

export async function getTeamPlayers(teamDocId: string, group: string): Promise<Player[]> {
  const playersRef = collection(db, `Teams/world_cup_2026/Group_${group}/${teamDocId}/Players`);
  const snapshot = await getDocs(playersRef);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as unknown as Player[];
}

export async function getUserBracket(userId: string): Promise<Bracket | null> {
  const snap = await getDoc(doc(db, 'brackets', userId));
  if (!snap.exists()) return null;
  return snap.data() as Bracket;
}

export async function saveUserBracket(
  userId: string,
  data: Partial<Bracket>,
  tokenDeduction?: { field: 'bracket' | 'campeon' | 'goleador'; amount: number }
): Promise<void> {
  const bracketRef = doc(db, 'brackets', userId);

  if (tokenDeduction) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId), { tokens: increment(-tokenDeduction.amount) });
    batch.set(bracketRef, {
      ...data,
      userId,
      [`tokensSpent.${tokenDeduction.field}`]: tokenDeduction.amount,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  } else {
    await setDoc(bracketRef, {
      ...data,
      userId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function searchPlayers(searchTerm: string, maxResults: number = 20): Promise<FlatPlayer[]> {
  const term = searchTerm.trim().toLowerCase();
  if (term.length === 0) return [];

  const playersRef = collection(db, 'flat_players');
  const q = query(
    playersRef,
    orderBy('name'),
    startAt(term.charAt(0).toUpperCase() + term.slice(1)),
    endAt(term + '\uf8ff'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(d => ({ ...d.data() })) as FlatPlayer[];
  return results.filter(p => p.name.toLowerCase().includes(term));
}
