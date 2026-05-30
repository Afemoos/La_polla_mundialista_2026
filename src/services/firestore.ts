import {
  collection,
  collectionGroup,
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
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { TOURNAMENTS } from '../constants/tournaments';
import type {
  WorldCupTeam,
  Player,
  UserProfile,
  PredictionV2,
  BracketV2,
  CampeonPick,
  GoleadorPick,
  ActiveCard,
  ActiveCardInput,
  FlatTeam,
  TournamentFixture,
} from '../types/firestore';

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

export async function getTeamsByTournament(tournamentId: string): Promise<FlatTeam[]> {
  try {
    const q = query(collectionGroup(db, 'flat_teams'), where('tournamentId', '==', tournamentId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as FlatTeam);
    }
  } catch {
    // collectionGroup failed or index missing
  }

  // AI-NOTE: Fallback — extract unique teams from fixtures collection
  // This works even when flat_teams is empty (Teams/{tournamentId}/Group_X not populated)
  const fixturesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/fixtures`));
  if (fixturesSnap.empty) {
    return [];
  }

  const teamsMap = new Map<number, FlatTeam>();
  fixturesSnap.forEach(doc => {
    const data = doc.data() as TournamentFixture;
    if (data.homeTeam && !teamsMap.has(data.homeTeam.apiId)) {
      teamsMap.set(data.homeTeam.apiId, {
        apiId: data.homeTeam.apiId,
        name: data.homeTeam.name,
        code: data.homeTeam.code || '',
        logo: data.homeTeam.logo,
        country: data.homeTeam.name,
        group: '',
        founded: null,
        venue: { name: '', city: '', capacity: 0 },
        isHost: false,
        tournamentId,
      });
    }
    if (data.awayTeam && !teamsMap.has(data.awayTeam.apiId)) {
      teamsMap.set(data.awayTeam.apiId, {
        apiId: data.awayTeam.apiId,
        name: data.awayTeam.name,
        code: data.awayTeam.code || '',
        logo: data.awayTeam.logo,
        country: data.awayTeam.name,
        group: '',
        founded: null,
        venue: { name: '', city: '', capacity: 0 },
        isHost: false,
        tournamentId,
      });
    }
  });

  return Array.from(teamsMap.values());
}

export async function getOpponentsForTeam(
  teamApiId: number,
  tournamentId: string
): Promise<{ apiId: number; name: string; logo: string }[]> {
  const opponents: Map<number, { apiId: number; name: string; logo: string }> = new Map();

  const qHome = query(
    collection(db, `tournaments/${tournamentId}/fixtures`),
    where('homeTeam.apiId', '==', teamApiId)
  );
  const qAway = query(
    collection(db, `tournaments/${tournamentId}/fixtures`),
    where('awayTeam.apiId', '==', teamApiId)
  );

  const [homeSnap, awaySnap] = await Promise.all([getDocs(qHome), getDocs(qAway)]);

  homeSnap.forEach(doc => {
    const data = doc.data() as TournamentFixture;
    const opponent = data.awayTeam;
    if (opponent && !opponents.has(opponent.apiId)) {
      opponents.set(opponent.apiId, { apiId: opponent.apiId, name: opponent.name, logo: opponent.logo });
    }
  });

  awaySnap.forEach(doc => {
    const data = doc.data() as TournamentFixture;
    const opponent = data.homeTeam;
    if (opponent && !opponents.has(opponent.apiId)) {
      opponents.set(opponent.apiId, { apiId: opponent.apiId, name: opponent.name, logo: opponent.logo });
    }
  });

  return Array.from(opponents.values());
}

export async function getFixtureByTeams(
  team1ApiId: number,
  team2ApiId: number,
  tournamentId: string
): Promise<TournamentFixture | null> {
  const qHome = query(
    collection(db, `tournaments/${tournamentId}/fixtures`),
    where('homeTeam.apiId', '==', team1ApiId),
    where('awayTeam.apiId', '==', team2ApiId)
  );
  const qAway = query(
    collection(db, `tournaments/${tournamentId}/fixtures`),
    where('homeTeam.apiId', '==', team2ApiId),
    where('awayTeam.apiId', '==', team1ApiId)
  );

  const [homeSnap, awaySnap] = await Promise.all([getDocs(qHome), getDocs(qAway)]);

  if (!homeSnap.empty) {
    return homeSnap.docs[0].data() as TournamentFixture;
  }
  if (!awaySnap.empty) {
    return awaySnap.docs[0].data() as TournamentFixture;
  }
  return null;
}

export async function getActiveCardsForPolla(): Promise<ActiveCard[]> {
  const q = query(
    collectionGroup(db, 'active_cards'),
    where('tournamentId', '==', TOURNAMENTS.WORLD_CUP_2026),
    where('involvesColombia', '==', true),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as ActiveCard);
}

export async function getActiveCardsForChampions(): Promise<ActiveCard[]> {
  const q = query(
    collectionGroup(db, 'active_cards'),
    where('tournamentId', '==', TOURNAMENTS.CHAMPIONS_LEAGUE_2025),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as ActiveCard);
}

export async function createActiveCard(card: ActiveCardInput): Promise<string> {
  const existingQ = query(
    collectionGroup(db, 'active_cards'),
    where('fixtureId', '==', card.fixtureId),
    where('tournamentId', '==', card.tournamentId)
  );
  const existing = await getDocs(existingQ);
  if (!existing.empty) {
    throw new Error('Ya existe una tarjeta para este partido.');
  }

  const cardId = `${card.tournamentId}_${card.fixtureId}_${Date.now()}`;
  const docRef = doc(db, `tournaments/${card.tournamentId}/active_cards`, cardId);
  await setDoc(docRef, {
    cardId,
    ...card,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return cardId;
}

export async function getAllActiveCardsAdmin(tournamentId?: string): Promise<ActiveCard[]> {
  if (tournamentId) {
    const q = query(
      collection(db, `tournaments/${tournamentId}/active_cards`)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ActiveCard);
  }
  const q = collectionGroup(db, 'active_cards');
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as ActiveCard);
}

export async function updateActiveCard(
  cardId: string,
  tournamentId: string,
  updates: Partial<ActiveCard>
): Promise<void> {
  const docRef = doc(db, `tournaments/${tournamentId}/active_cards`, cardId);
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteActiveCard(cardId: string, tournamentId: string): Promise<void> {
  const docRef = doc(db, `tournaments/${tournamentId}/active_cards`, cardId);
  await deleteDoc(docRef);
}
