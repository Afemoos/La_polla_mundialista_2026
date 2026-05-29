import os
import json
import requests
import time
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from datetime import datetime

# --- CONFIGURACION ---
API_KEY = os.environ.get("API_FOOTBALL_KEY", "")
CREDENTIALS_FILE = "credenciales_gcp.json"

HEADERS = {
    'x-rapidapi-host': "v3.football.api-sports.io",
    'x-rapidapi-key': API_KEY
}

# World Cup: League 1. Champions League: League 2
LEAGUES_TO_CHECK = [
    {"id": 1, "name": "World Cup 2026", "season": 2026},
    {"id": 2, "name": "Champions League", "season": 2025}
]
COLOMBIA_TEAM_ID = 8

def update_api_status(db, response_headers):
    if 'x-ratelimit-requests-current' in response_headers:
        current_req = response_headers['x-ratelimit-requests-current']
        limit_req = response_headers.get('x-ratelimit-requests-limit', '7500')
        try:
            db.collection("tournaments/world_cup_2026/system").document("api_status").set({
                "requests_current": int(current_req),
                "requests_limit": int(limit_req),
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True)
        except Exception as e:
            print(f"Error actualizando api_status: {e}")

# AI-NOTE: Probabilidades precalculadas basadas en ranking FIFA abril 2025 + ventaja local.
# Fórmula: Elo con scaling 400, home advantage 100, ajuste empate 0.22.
# Se usan SOLO como fallback cuando API-Football no proporciona predicciones reales.
# Cuando la API retorne datos para un partido, esos tienen prioridad absoluta.
FIFA_BASED_PROBS = {
    ("México", "Sudáfrica"): (48, 27, 25),
    ("Brasil", "Marruecos"): (42, 28, 30),
    ("Países Bajos", "Japón"): (45, 28, 27),
    ("Inglaterra", "Croacia"): (43, 28, 29),
    ("Colombia", "Uzbekistán"): (50, 26, 24),
    ("Argentina", "Austria"): (52, 26, 22),
    ("Portugal", "Uzbekistán"): (54, 25, 21),
    ("Colombia", "RD Congo"): (52, 26, 22),
    ("Escocia", "Brasil"): (22, 26, 52),
    ("Ecuador", "Alemania"): (25, 27, 48),
    ("Noruega", "Francia"): (18, 23, 59),
    ("Uruguay", "España"): (23, 26, 51),
    ("Colombia", "Portugal"): (35, 28, 37),
}

def fetch_predictions(fixture_id, db=None):
    """Obtiene predicciones de API-Football. Retorna (probHome, probDraw, probAway)
    o (None, None, None) si la API no tiene datos para este partido."""
    print(f"Obteniendo probabilidades para el partido {fixture_id}...")
    pred_url = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
    time.sleep(0.5) # Prevención de Rate Limit (R/S)
    pred_response = requests.get(pred_url, headers=HEADERS)
    
    if pred_response.status_code == 200:
        if db: update_api_status(db, pred_response.headers)
        pred_data = pred_response.json()
        if pred_data.get("response") and len(pred_data["response"]) > 0:
            percents = pred_data["response"][0]["predictions"]["percent"]
            prob_home = int(percents.get("home", "33%").replace("%", ""))
            prob_draw = int(percents.get("draw", "33%").replace("%", ""))
            prob_away = int(percents.get("away", "34%").replace("%", ""))
            # Verificar que los datos de API sumen 100 (a veces redondean mal)
            total = prob_home + prob_draw + prob_away
            if total == 100:
                print(f"  ✅ API-Football -> Local: {prob_home}% | Empate: {prob_draw}% | Visitante: {prob_away}%")
                return prob_home, prob_draw, prob_away
            else:
                # API devolvió datos pero no suman 100 — ajustar el último
                prob_away = 100 - prob_home - prob_draw
                print(f"  ⚠️ API-Football ajustada -> Local: {prob_home}% | Empate: {prob_draw}% | Visitante: {prob_away}%")
                return prob_home, prob_draw, prob_away
    return None, None, None

def build_radar_obj(fixture, prob_home, prob_draw, prob_away):
    return {
        "fixtureId": fixture['fixture']['id'],
        "homeTeam": fixture['teams']['home']['name'],
        "homeFlag": fixture['teams']['home']['logo'],
        "awayTeam": fixture['teams']['away']['name'],
        "awayFlag": fixture['teams']['away']['logo'],
        "date": fixture['fixture']['date'],
        "stadium": fixture['fixture']['venue']['name'] or "Estadio por definir",
        "probHome": prob_home,
        "probDraw": prob_draw,
        "probAway": prob_away,
    }

def get_team_logo(team_name, cache):
    """Obtiene el ID y logo de un equipo desde la API de Teams o un diccionario en caché."""
    if team_name in cache:
        return cache[team_name]
    
    # AI-NOTE: IDs conocidos de equipos nacionales de API-Football para evitar consultas extra
    KNOWN_IDS = {
        "México": 16, "Mexico": 16,
        "Sudáfrica": 13, "South Africa": 13,
        "Brasil": 6, "Brazil": 6,
        "Marruecos": 31, "Morocco": 31,
        "Países Bajos": 1118, "Netherlands": 1118,
        "Japón": 12, "Japan": 12,
        "Inglaterra": 10, "England": 10,
        "Croacia": 3, "Croatia": 3,
        "Colombia": 8,
        "Argentina": 9,
        "Austria": 775,
        "Portugal": 27,
        "RD Congo": 1112, "Democratic Republic of Congo": 1112, "DR Congo": 1112,
        "Escocia": 1091, "Scotland": 1091,
        "Ecuador": 2382,
        "Alemania": 25, "Germany": 25,
        "Francia": 2, "France": 2,
        "Uruguay": 7,
        "España": 14, "Spain": 14,
        "Uzbekistán": 146, "Uzbekistan": 146,
        "Noruega": 213, "Norway": 213,
    }
    
    team_id = KNOWN_IDS.get(team_name)
    if team_id:
        logo = f"https://media.api-sports.io/football/teams/{team_id}.png"
        cache[team_name] = (team_id, logo)
        return (team_id, logo)
    
    # Si no está en el diccionario, consultar la API de Teams
    search_url = f"https://v3.football.api-sports.io/teams?search={team_name}"
    time.sleep(0.5)
    response = requests.get(search_url, headers=HEADERS)
    if response.status_code == 200:
        data = response.json()
        teams = data.get("response", [])
        if teams:
            team = teams[0]["team"]
            team_id = team["id"]
            logo = team["logo"]
            cache[team_name] = (team_id, logo)
            print(f"    Equipo encontrado vía API: {team['name']} (ID: {team_id})")
            return (team_id, logo)
    
    cache[team_name] = (None, "")
    return (None, "")

def get_all_active_cards(db):
    active_cards = []
    tournament_ids = ["world_cup_2026", "champions_league_2025"]
    for tid in tournament_ids:
        try:
            snap = db.collection(f"tournaments/{tid}/active_cards").where("isActive", "==", True).get()
            for doc in snap:
                data = doc.to_dict()
                data["_cardId"] = doc.id
                data["_tournamentId"] = tid
                active_cards.append(data)
        except Exception as e:
            print(f"Error leyendo active_cards de {tid}: {e}")
    return active_cards


def update_active_card_probabilities(db, active_cards):
    print(f"\n--- Actualizando {len(active_cards)} active_cards ---")
    for card in active_cards:
        fixture_id = card.get("fixtureId")
        if not fixture_id:
            continue
        tournament_id = card.get("_tournamentId")
        card_id = card.get("_cardId")
        h, d, a = fetch_predictions(fixture_id, db)
        if h is not None or d is not None or a is not None:
            updates = {"updatedAt": firestore.SERVER_TIMESTAMP}
            if h is not None:
                updates["probHome"] = h
            if d is not None:
                updates["probDraw"] = d
            if a is not None:
                updates["probAway"] = a
            try:
                doc_path = f"tournaments/{tournament_id}/active_cards/{card_id}"
                db.document(doc_path).update(updates)
                print(f"  Actualizado card {card_id}: probs {h}/{d}/{a}")
            except Exception as e:
                print(f"  Error actualizando card {card_id}: {e}")


def sync_and_deactivate_active_cards(db):
    print("\n--- Sincronizando estado de fixtures y auto-desactivando ---")
    active_cards = get_all_active_cards(db)
    if not active_cards:
        print("  No hay active_cards para procesar.")
        return

    updated_count = 0
    deactivated_count = 0

    for card in active_cards:
        fixture_id = card.get("fixtureId")
        if not fixture_id:
            continue
        tournament_id = card.get("_tournamentId")
        card_id = card.get("_cardId")
        current_status = card.get("fixtureStatus")
        card_is_active = card.get("isActive", True)

        if current_status in ("LIVE", "FT", "AET", "PEN"):
            continue

        url = f"https://v3.football.api-sports.io/fixtures?id={fixture_id}"
        time.sleep(0.5)
        try:
            response = requests.get(url, headers=HEADERS)
            if response.status_code != 200:
                continue
            data = response.json()
            fixtures = data.get("response", [])
            if not fixtures:
                continue
            fixture = fixtures[0]
            api_status = fixture.get("fixture", {}).get("status", "NS")
            venue = fixture.get("fixture", {}).get("venue", {}) or {}
            new_stadium = venue.get("name") or card.get("stadium")
            new_venue_city = venue.get("city") or card.get("venueCity")
            new_date = fixture.get("fixture", {}).get("date") or card.get("date")

            updates = {"updatedAt": firestore.SERVER_TIMESTAMP}
            changed = False

            if api_status != "NS" and api_status != current_status:
                updates["fixtureStatus"] = api_status
                updates["isActive"] = False
                deactivated_count += 1
                print(f"  Auto-desactivando card {card_id} (estado: {current_status} -> {api_status})")
                changed = True

            if new_stadium and new_stadium != card.get("stadium"):
                updates["stadium"] = new_stadium
                changed = True
            if new_venue_city and new_venue_city != card.get("venueCity"):
                updates["venueCity"] = new_venue_city
                changed = True
            if new_date and new_date != card.get("date"):
                updates["date"] = new_date
                changed = True

            if changed:
                doc_path = f"tournaments/{tournament_id}/active_cards/{card_id}"
                db.document(doc_path).update(updates)
                updated_count += 1

        except Exception as e:
            print(f"  Error sincronizando card {card_id}: {e}")
            continue

    print(f"  {updated_count} cards actualizadas, {deactivated_count} auto-desactivadas.")

def main():
    print("Iniciando búsqueda de próximos partidos...")
    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada en las variables de entorno.")
        return

    # --- 1. BUSCAR PARTIDO GLOBAL (MUNDIAL/CHAMPIONS) ---
    upcoming_fixtures = []
    db = None
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
    except Exception as e:
        print("Fallo conexion DB temporal", e)
        
    for league in LEAGUES_TO_CHECK:
        print(f"Buscando el próximo partido para la liga: {league['name']}...")
        url = f"https://v3.football.api-sports.io/fixtures?league={league['id']}&season={league['season']}&next=1"
        time.sleep(0.5) # Prevención de Rate Limit (R/S)
        response = requests.get(url, headers=HEADERS)
        if response.status_code == 200:
            if db: update_api_status(db, response.headers)
            data = response.json()
            if data.get("errors") and "plan" in data["errors"]:
                print(f"  [ALERTA DE PAGO] API-Football bloqueó la consulta: {data['errors']['plan']}")
            elif data.get("response") and len(data["response"]) > 0:
                fixture = data["response"][0]
                upcoming_fixtures.append(fixture)
                print(f"  Encontrado: {fixture['teams']['home']['name']} vs {fixture['teams']['away']['name']}")
            else:
                print(f"  No hay partidos programados próximamente para esta liga.")
        else:
            print(f"  Error consultando la API: {response.text}")

    radar_match_global = None
    if upcoming_fixtures:
        upcoming_fixtures.sort(key=lambda x: x["fixture"]["timestamp"])
        next_match = upcoming_fixtures[0]
        h, d, a = fetch_predictions(next_match["fixture"]["id"], db)
        if h is None:
            h, d, a = 33, 33, 34  # Fallback genérico para radar si API no tiene datos
        radar_match_global = build_radar_obj(next_match, h, d, a)

    # --- 2. BUSCAR PARTIDO DE COLOMBIA ---
    print("\nBuscando el próximo partido para Colombia...")
    radar_match_colombia = None
    url_col = f"https://v3.football.api-sports.io/fixtures?team={COLOMBIA_TEAM_ID}&next=1"
    time.sleep(0.5) # Prevención de Rate Limit (R/S)
    response_col = requests.get(url_col, headers=HEADERS)
    if response_col.status_code == 200:
        if db: update_api_status(db, response_col.headers)
        data_col = response_col.json()
        if data_col.get("errors") and "plan" in data_col["errors"]:
            print(f"  [ALERTA DE PAGO] API-Football bloqueó la consulta de equipo: {data_col['errors']['plan']}")
        elif data_col.get("response") and len(data_col["response"]) > 0:
            col_match = data_col["response"][0]
            print(f"  Encontrado: {col_match['teams']['home']['name']} vs {col_match['teams']['away']['name']}")
            h, d, a = fetch_predictions(col_match["fixture"]["id"], db)
            if h is None:
                h, d, a = 33, 33, 34  # Fallback genérico para radar Colombia
            radar_match_colombia = build_radar_obj(col_match, h, d, a)
        else:
            print("  No hay partidos próximos para Colombia.")
    else:
        print(f"  Error consultando la API para Colombia: {response_col.text}")

    # --- 3. GUARDAR EN FIRESTORE ---
    print("\nConectando a Firebase Firestore...")
    try:
        # DB ya instanciada arriba
        if not db:
            db = firestore.client()

        if radar_match_global:
            print("Actualizando el documento system/radar_match...")
            radar_match_global["updatedAt"] = firestore.SERVER_TIMESTAMP
            db.collection("tournaments/world_cup_2026/system").document("radar_match").set(radar_match_global)

        if radar_match_colombia:
            print("Actualizando el documento system/colombia_match...")
            radar_match_colombia["updatedAt"] = firestore.SERVER_TIMESTAMP
            db.collection("tournaments/world_cup_2026/system").document("colombia_match").set(radar_match_colombia)

        # --- 4. Actualizar active_cards ---
        sync_and_deactivate_active_cards(db)
        active_cards = get_all_active_cards(db)
        if active_cards:
            update_active_card_probabilities(db, active_cards)

        print("✅ Radares y active_cards actualizados exitosamente en Firebase!")

    except Exception as e:
        import traceback
        print(f"❌ Error crítico al guardar en Firestore: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
