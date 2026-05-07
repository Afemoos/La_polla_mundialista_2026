import { Timestamp } from 'firebase/firestore';

export interface Prediction {
  id: string;
  email?: string;
  type?: string;
  fixtureId?: string;
  matchDetails?: string;
  prediction?: string;
  timestamp?: Timestamp;
  result?: 'GANADA' | 'PERDIDA' | string | null;
  finalScore?: string;
  homeLogo?: string;
  awayLogo?: string;
  tokenCost?: number;
  lockedAt?: Timestamp;
}

export interface AppUser {
  uid: string;
  email: string;
  tokens: number;
}

export interface RadarMatch {
  homeTeam: string;
  homeFlag: string;
  awayTeam: string;
  awayFlag: string;
  date: string;
  stadium: string;
  probHome: number;
  probDraw: number;
  probAway: number;
  updatedAt?: Timestamp;
}

export interface TeamVenue {
  apiId: number;
  name: string;
  address: string | null;
  city: string;
  capacity: number;
  surface: string;
  image: string;
}

export interface WorldCupTeam {
  apiId: number;
  name: string;
  code: string;
  country: string;
  logo: string;
  founded: number | null;
  national: boolean;
  venue: TeamVenue;
  group: string;
  position: number;
  host: boolean;
  updatedAt: Timestamp;
}

export interface Player {
  apiId: number;
  name: string;
  age: number;
  number: number | null;
  position: string;
  photo: string;
}

export interface TeamInfo {
  apiId: number;
  name: string;
  code: string;
  logo: string;
}

export interface BracketMatch {
  matchNumber: number;
  round: 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'tercer_lugar' | 'final';
  homeTeam: TeamInfo | null;
  awayTeam: TeamInfo | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: 'home' | 'away' | null;
}

export interface Bracket {
  userId: string;
  email: string;
  matches: BracketMatch[];
  campeon: TeamInfo | null;
  goleador: { apiId: number; name: string; teamName: string; photo: string; } | null;
  tokensSpent: {
    bracket: number;
    campeon: number;
    goleador: number;
  };
  score: number | null;
  campeonResult: 'GANADA' | 'PERDIDA' | null;
  goleadorResult: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RoundOf32Match {
  matchNumber: number;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  date: string;
  stadium: string;
}

export interface FlatPlayer {
  apiId: number;
  name: string;
  age: number;
  number: number | null;
  position: string;
  photo: string;
  teamApiId: number;
  teamName: string;
  teamCode: string;
  teamLogo: string;
}
