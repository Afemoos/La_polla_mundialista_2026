export const TOURNAMENTS = {
  WORLD_CUP_2026: 'world_cup_2026',
  CHAMPIONS_LEAGUE_2025: 'champions_league_2025',
} as const;

export const COLOMBIA_API_ID = 8;

export type TournamentId = typeof TOURNAMENTS[keyof typeof TOURNAMENTS];

export const LEAGUES = {
  [TOURNAMENTS.WORLD_CUP_2026]: { apiId: 1, name: 'World Cup 2026', season: 2026 },
  [TOURNAMENTS.CHAMPIONS_LEAGUE_2025]: { apiId: 2, name: 'Champions League', season: 2025 },
} as const;

export const TOURNAMENT_NAMES: Record<TournamentId, string> = {
  [TOURNAMENTS.WORLD_CUP_2026]: 'World Cup 2026',
  [TOURNAMENTS.CHAMPIONS_LEAGUE_2025]: 'Champions League 2025',
};
