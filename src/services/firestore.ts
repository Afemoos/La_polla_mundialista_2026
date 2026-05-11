import {
  collection,
  query,
  where,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  getDoc,
  writeBatch,
  increment,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { WorldCupTeam, Player, UserProfile, PredictionV2, BracketV2, CampeonPick, GoleadorPick } from '../types/firestore';

// AI-NOTE: Cache de equipos a nivel de módulo para evitar 12 lecturas en cada navegación

export async function getTournamentTeams(tournamentId: string): Promise<WorldCupTeam[]> {
  const ref = collection(db, `tournaments/${tournamentId}/teams`);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data() })) as WorldCupTeam[];
}

export async function getTournamentPlayers(tournamentId: string, teamApiId: number): Promise<Player[]> {
  const ref = collection(db, `tournaments/${tournamentId}/players`);
  const q = query(ref, where('teamApiId', '==', teamApiId), limit(60));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data() })) as unknown as Player[];
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserPredictions(uid: string, tournamentId: string): Promise<PredictionV2[]> {
  const ref = collection(db, `users/${uid}/tournaments/${tournamentId}/predictions`);
  const q = query(ref, where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data() })) as PredictionV2[];
}

export async function getUserBracketV2(uid: string, tournamentId: string): Promise<BracketV2 | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}`, 'bracket', 'data'));
  if (snap.exists() && !snap.data().deletedAt) return snap.data() as BracketV2;
  return null;
}

export async function getCampeonPick(uid: string, tournamentId: string): Promise<CampeonPick | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}`, 'campeon', 'data'));
  if (snap.exists() && !snap.data().deletedAt) return snap.data() as CampeonPick;
  return null;
}

export async function getGoleadorPick(uid: string, tournamentId: string): Promise<GoleadorPick | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}`, 'goleador', 'data'));
  if (snap.exists() && !snap.data().deletedAt) return snap.data() as GoleadorPick;
  return null;
}

export async function saveUserPick(
  uid: string,
  tournamentId: string,
  type: 'bracket' | 'campeon' | 'goleador',
  data: Record<string, unknown>,
  tokenDeduction?: { amount: number }
): Promise<void> {
  const ref = doc(db, `users/${uid}/tournaments/${tournamentId}`, type, 'data');
  if (tokenDeduction) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'profile', 'data'), { tokens: increment(-tokenDeduction.amount) });
    batch.set(ref, { ...data, deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  } else {
    await setDoc(ref, { ...data, deletedAt: null, updatedAt: serverTimestamp() }, { merge: true });
  }
}
