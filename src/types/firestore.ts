export interface Prediction {
  id: string;
  email?: string;
  type?: string;
  fixtureId?: string;
  matchDetails?: string;
  prediction?: string;
  status: 'PENDIENTE' | 'PAGADO' | 'CANCELACION_SOLICITADA' | 'CANCELADA';
  timestamp?: any;
  result?: 'GANADA' | 'PERDIDA' | string | null;
  finalScore?: string;
  homeLogo?: string;
  awayLogo?: string;
  tokenCost?: number;
  lockedAt?: any;
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
  updatedAt?: any;
}
