import os
import json
import requests
import time
import argparse
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from datetime import datetime

API_KEY = os.environ.get("API_FOOTBALL_KEY", "")
CREDENTIALS_FILE = "credenciales_gcp.json"

HEADERS = {
    'x-rapidapi-host': "v3.football.api-sports.io",
    'x-rapidapi-key': API_KEY
}

TOURNAMENTS = {
    1: {"id": "world_cup_2026", "name": "World Cup 2026", "season": 2026},
    2: {"id": "champions_league_2025", "name": "Champions League", "season": 2025},
}

COLOMBIA_API_ID = 8

GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']


def init_firebase():
    try:
        credentials_path = CREDENTIALS_FILE if os.path.exists(CREDENTIALS_FILE) else f"../{CREDENTIALS_FILE}"
        if "GCP_CREDENTIALS" in os.environ:
            creds_dict = json.loads(os.environ["GCP_CREDENTIALS"])
            firebase_creds = credentials.Certificate(creds_dict)
        else:
            firebase_creds = credentials.Certificate(credentials_path)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_creds)
        db = firestore.client()
        print("Firebase inicializado correctamente.")
        return db
    except Exception as e:
        print(f"Error inicializando Firebase: {e}")
        return None


def update_sync_status(db, tournament_id, status, fixtures_count=0, teams_count=0, error_message=None, partial_fixtures_count=None):
    doc_path = f"tournaments/{tournament_id}/system/sync_status"
    data = {
        "status": status,
        "fixturesCount": fixtures_count,
        "teamsCount": teams_count,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastSyncAt": firestore.SERVER_TIMESTAMP,
    }
    if error_message:
        data["errorMessage"] = error_message
    if partial_fixtures_count is not None:
        data["partialFixturesCount"] = partial_fixtures_count
    try:
        db.document(doc_path).set(data, merge=True)
    except Exception as e:
        print(f"Error actualizando sync_status: {e}")


def fetch_predictions(fixture_id):
    pred_url = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
    time.sleep(0.5)
    try:
        pred_response = requests.get(pred_url, headers=HEADERS)
        if pred_response.status_code == 200:
            pred_data = pred_response.json()
            if pred_data.get("response") and len(pred_data["response"]) > 0:
                percents = pred_data["response"][0]["predictions"]["percent"]
                prob_home = int(percents.get("home", "33%").replace("%", ""))
                prob_draw = int(percents.get("draw", "33%").replace("%", ""))
                prob_away = int(percents.get("away", "34%").replace("%", ""))
                total = prob_home + prob_draw + prob_away
                if total == 100:
                    return prob_home, prob_draw, prob_away
                else:
                    prob_away = 100 - prob_home - prob_draw
                    return prob_home, prob_draw, prob_away
    except Exception as e:
        print(f"Error obteniendo probabilidades para fixture {fixture_id}: {e}")
    return None, None, None


def sync_fixtures(db, league_id, season):
    tournament = TOURNAMENTS.get(league_id)
    if not tournament:
        print(f"Liga {league_id} no soportada.")
        return 0, 0

    tournament_id = tournament["id"]
    print(f"\n--- Sincronizando fixtures: {tournament['name']} ---")

    url = f"https://v3.football.api-sports.io/fixtures?league={league_id}&season={season}"
    time.sleep(0.5)
    response = requests.get(url, headers=HEADERS)

    if response.status_code != 200:
        print(f"Error consultando API: {response.status_code} - {response.text}")
        return 0, 0

    data = response.json()
    if data.get("errors"):
        print(f"API reportó errores: {data['errors']}")

    fixtures = data.get("response", [])
    if not fixtures:
        print("No se encontraron fixtures en la respuesta.")
        return 0, 0

    print(f"API retornó {len(fixtures)} fixtures.")

    saved_count = 0
    error_count = 0

    for f in fixtures:
        try:
            fixture_id = f["fixture"]["id"]
            home = f["teams"]["home"]
            away = f["teams"]["away"]
            venue = f.get("fixture", {}).get("venue", {}) or {}

            prob_home, prob_draw, prob_away = fetch_predictions(fixture_id)

            fixture_data = {
                "fixtureId": fixture_id,
                "leagueId": league_id,
                "leagueName": tournament["name"],
                "season": season,
                "tournamentId": tournament_id,
                "homeTeam": {
                    "apiId": home.get("id"),
                    "name": home.get("name"),
                    "code": home.get("code"),
                    "logo": home.get("logo"),
                },
                "awayTeam": {
                    "apiId": away.get("id"),
                    "name": away.get("name"),
                    "code": away.get("code"),
                    "logo": away.get("logo"),
                },
                "date": f["fixture"].get("date"),
                "stadium": venue.get("name") or "Estadio por definir",
                "venueCity": venue.get("city") or "Ciudad por definir",
                "status": f["fixture"].get("status", "NS"),
                "probHome": prob_home,
                "probDraw": prob_draw,
                "probAway": prob_away,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }

            doc_path = f"tournaments/{tournament_id}/fixtures/{fixture_id}"
            db.document(doc_path).set(fixture_data, merge=True)
            saved_count += 1
            print(f"  Guardado fixture {fixture_id}: {home['name']} vs {away['name']}")

        except Exception as e:
            error_count += 1
            print(f"  Error guardando fixture: {e}")
            continue

    print(f"Fixtures guardados: {saved_count}, errores: {error_count}")
    return saved_count, error_count


def sync_flat_teams(db, tournament_id):
    print(f"\n--- Sincronizando flat_teams desde Teams/{tournament_id}/ ---")

    saved_count = 0
    errors = []

    for group in GROUPS:
        group_ref = db.collection(f"Teams/{tournament_id}/Group_{group}")
        try:
            snap = group_ref.get()
        except Exception as e:
            print(f"  Error leyendo Group_{group}: {e}")
            continue

        if not snap:
            continue

        for team_doc in snap:
            team_data = team_doc.to_dict()
            if "apiId" not in team_data:
                continue

            api_id = team_data["apiId"]
            flat_data = {
                "apiId": team_data.get("apiId"),
                "name": team_data.get("name"),
                "code": team_data.get("code"),
                "logo": team_data.get("logo"),
                "country": team_data.get("country"),
                "group": team_data.get("group"),
                "founded": team_data.get("founded"),
                "venue": team_data.get("venue"),
                "isHost": team_data.get("host", False),
                "tournamentId": tournament_id,
            }

            try:
                flat_path = f"tournaments/{tournament_id}/flat_teams/{api_id}"
                db.document(flat_path).set(flat_data, merge=True)
                saved_count += 1
            except Exception as e:
                errors.append(f"Error guardando flat_team {api_id}: {e}")

        print(f"  Group {group}: {len(snap)} equipos procesados")

    print(f"flat_teams guardados: {saved_count}")
    if errors:
        for err in errors:
            print(f"  {err}")

    return saved_count, len(errors)


def main():
    parser = argparse.ArgumentParser(description="Sincroniza fixtures de un torneo desde API-Football")
    parser.add_argument("--league", type=int, required=True, help="ID de la liga en API-Football (1=Mundial, 2=Champions)")
    parser.add_argument("--season", type=int, required=True, help="Temporada (2026 para Mundial, 2025 para Champions)")
    args = parser.parse_args()

    print("=" * 60)
    print(f"SYNC FIXTURES — Liga {args.league}, Temporada {args.season}")
    print("=" * 60)

    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada.")
        return

    db = init_firebase()
    if not db:
        return

    tournament = TOURNAMENTS.get(args.league)
    if not tournament:
        print(f"Liga {args.league} no soportada.")
        return

    tournament_id = tournament["id"]

    update_sync_status(db, tournament_id, "running")

    fixtures_saved, fixtures_errors = sync_fixtures(db, args.league, args.season)

    teams_saved, teams_errors = sync_flat_teams(db, tournament_id)

    total_errors = fixtures_errors + teams_errors

    if total_errors == 0:
        update_sync_status(db, tournament_id, "done", fixtures_saved, teams_saved)
        print("\nSincronización completada exitosamente.")
    elif fixtures_saved > 0:
        update_sync_status(db, tournament_id, "partial", fixtures_saved, teams_saved,
                          error_message=f"{fixtures_errors} fixture errors, {teams_errors} team errors",
                          partial_fixtures_count=fixtures_saved)
        print("\nSincronización parcial: algunos elementos no se guardaron.")
    else:
        update_sync_status(db, tournament_id, "error", 0, 0,
                          error_message="Sync failed completely")
        print("\nSincronización fallida.")

    print(f"Resumen: {fixtures_saved} fixtures, {teams_saved} equipos guardados.")


if __name__ == "__main__":
    main()
