import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import {
  getTeamsByTournament,
  getOpponentsForTeam,
  getFixtureByTeams,
  createActiveCard,
} from '../services/firestore';
import { TOURNAMENTS, TOURNAMENT_NAMES } from '../constants/tournaments';
import type { TournamentId } from '../constants/tournaments';
import type { FlatTeam, TournamentFixture } from '../types/firestore';
import { useAuth } from '../contexts/AuthContext';

interface AdminCreateCardModalProps {
  onClose: () => void;
  onCreated?: () => void;
}

export default function AdminCreateCardModal({ onClose, onCreated }: AdminCreateCardModalProps) {
  const { currentUser } = useAuth() || {};
  const [tournamentId, setTournamentId] = useState<TournamentId | ''>('');
  const [team1ApiId, setTeam1ApiId] = useState<number | ''>('');
  const [team2ApiId, setTeam2ApiId] = useState<number | ''>('');
  const [teams, setTeams] = useState<FlatTeam[]>([]);
  const [opponents, setOpponents] = useState<{ apiId: number; name: string; logo: string }[]>([]);
  const [fixture, setFixture] = useState<TournamentFixture | null>(null);
  const [tokenCost, setTokenCost] = useState(3);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingOpponents, setLoadingOpponents] = useState(false);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tournamentId) {
      setTeams([]);
      setTeam1ApiId('');
      setTeam2ApiId('');
      setOpponents([]);
      setFixture(null);
      return;
    }
    setLoadingTeams(true);
    setTeam1ApiId('');
    setTeam2ApiId('');
    setOpponents([]);
    setFixture(null);
    getTeamsByTournament(tournamentId)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId || !team1ApiId) {
      setOpponents([]);
      setTeam2ApiId('');
      setFixture(null);
      return;
    }
    setLoadingOpponents(true);
    setTeam2ApiId('');
    setFixture(null);
    getOpponentsForTeam(team1ApiId as number, tournamentId)
      .then(setOpponents)
      .catch(() => setOpponents([]))
      .finally(() => setLoadingOpponents(false));
  }, [tournamentId, team1ApiId]);

  useEffect(() => {
    if (!tournamentId || !team1ApiId || !team2ApiId) {
      setFixture(null);
      return;
    }
    setLoadingFixture(true);
    getFixtureByTeams(team1ApiId as number, team2ApiId as number, tournamentId)
      .then(setFixture)
      .catch(() => setFixture(null))
      .finally(() => setLoadingFixture(false));
  }, [tournamentId, team1ApiId, team2ApiId]);

  const handleCreate = async () => {
    if (!tournamentId || !team1ApiId || !team2ApiId || !fixture || !currentUser) {
      return;
    }
    if (tokenCost < 1 || tokenCost > 10) {
      setError('El costo debe estar entre 1 y 10 tokens.');
      return;
    }
    setError(null);
    setSaving(true);

    const team1 = teams.find(t => t.apiId === team1ApiId);
    const team2 = opponents.find(t => t.apiId === team2ApiId);
    if (!team1 || !team2) {
      setError('Equipo no encontrado.');
      setSaving(false);
      return;
    }

    if (fixture.status !== 'NS' && fixture.status !== null) {
      setError('No se puede crear una tarjeta para un partido que ya inició.');
      setSaving(false);
      return;
    }

    try {
      await createActiveCard({
        tournamentId,
        fixtureId: fixture.fixtureId,
        homeTeamApiId: fixture.homeTeam.apiId,
        awayTeamApiId: fixture.awayTeam.apiId,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        homeTeamLogo: fixture.homeTeam.logo,
        awayTeamLogo: fixture.awayTeam.logo,
        date: fixture.date,
        stadium: fixture.stadium,
        tokenCost,
        involvesColombia: fixture.homeTeam.apiId === 8 || fixture.awayTeam.apiId === 8,
        fixtureStatus: fixture.status,
        probHome: fixture.probHome,
        probDraw: fixture.probDraw,
        probAway: fixture.probAway,
        createdBy: currentUser.email || 'admin',
      });
      onCreated?.();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear la tarjeta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Crear Tarjeta</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Torneo</label>
            <select
              className="styled-select"
              value={tournamentId}
              onChange={e => setTournamentId(e.target.value as TournamentId)}
            >
              <option value="">Seleccionar torneo</option>
              <option value={TOURNAMENTS.WORLD_CUP_2026}>{TOURNAMENT_NAMES[TOURNAMENTS.WORLD_CUP_2026]}</option>
              <option value={TOURNAMENTS.CHAMPIONS_LEAGUE_2025}>{TOURNAMENT_NAMES[TOURNAMENTS.CHAMPIONS_LEAGUE_2025]}</option>
            </select>
          </div>

          <div className="form-group">
            <label>Equipo 1</label>
            {loadingTeams ? (
              <div className="input-placeholder"><Loader2 size={16} className="spin" /> Cargando equipos...</div>
            ) : (
              <select
                className="styled-select"
                value={team1ApiId}
                onChange={e => setTeam1ApiId(Number(e.target.value))}
                disabled={!tournamentId}
              >
                <option value="">Seleccionar equipo</option>
                {teams.map(t => (
                  <option key={t.apiId} value={t.apiId}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Equipo 2</label>
            {loadingOpponents ? (
              <div className="input-placeholder"><Loader2 size={16} className="spin" /> Cargando oponentes...</div>
            ) : !team1ApiId ? (
              <div className="input-placeholder">Selecciona Equipo 1 primero</div>
            ) : opponents.length === 0 ? (
              <div className="input-placeholder error">No hay oponentes. Sincroniza fixtures primero.</div>
            ) : (
              <select
                className="styled-select"
                value={team2ApiId}
                onChange={e => setTeam2ApiId(Number(e.target.value))}
                disabled={!team1ApiId}
              >
                <option value="">Seleccionar oponente</option>
                {opponents.map(o => (
                  <option key={o.apiId} value={o.apiId}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {fixture && (
            <div className="fixture-preview glass-card">
              <div className="fixture-teams">
                <div className="fixture-team">
                  <img src={fixture.homeTeam.logo} alt={fixture.homeTeam.name} />
                  <span>{fixture.homeTeam.name}</span>
                </div>
                <span className="vs-label">VS</span>
                <div className="fixture-team">
                  <img src={fixture.awayTeam.logo} alt={fixture.awayTeam.name} />
                  <span>{fixture.awayTeam.name}</span>
                </div>
              </div>
              <div className="fixture-info">
                <span><Calendar size={14} /> {new Date(fixture.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', hour12: true })}</span>
                <span><MapPin size={14} /> {fixture.stadium}</span>
              </div>
              {fixture.probHome !== null && (
                <div className="fixture-probs">
                  <span>Local {fixture.probHome}%</span>
                  <span>Empate {fixture.probDraw}%</span>
                  <span>Visitante {fixture.probAway}%</span>
                </div>
              )}
            </div>
          )}

          {!fixture && team2ApiId && !loadingFixture && (
            <div className="error-message">
              <AlertCircle size={16} /> Este partido no existe en Firestore. Ejecuta &quot;Sincronizar fixtures&quot; primero.
            </div>
          )}

          {fixture && fixture.status !== 'NS' && fixture.status !== null && (
            <div className="error-message">
              <AlertCircle size={16} /> El estado del partido no permite crear tarjeta ({fixture.status}).
            </div>
          )}

          <div className="form-group">
            <label>Costo (tokens)</label>
            <input
              type="number"
              className="styled-input"
              min={1}
              max={10}
              value={tokenCost}
              onChange={e => setTokenCost(Number(e.target.value))}
            />
          </div>

          {error && (
            <div className="error-message">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={saving || !fixture || !currentUser}
          >
            {saving ? <><Loader2 size={16} className="spin" /> Creando...</> : 'Crear Tarjeta'}
          </button>
        </div>
      </div>
    </div>
  );
}
