export interface Prediction {
  id?: string;
  email?: string;
  type?: string;
  matchDetails?: string;
  prediction?: string;
  status?: 'PENDIENTE' | 'PAGADO';
  timestamp?: any;
  result?: 'GANADOR' | 'PERDEDOR' | string | null;
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
