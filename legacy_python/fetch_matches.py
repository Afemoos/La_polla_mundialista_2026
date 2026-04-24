import os
import json
import requests
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

def fetch_predictions(fixture_id):
    print(f"Obteniendo probabilidades para el partido {fixture_id}...")
    pred_url = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
    pred_response = requests.get(pred_url, headers=HEADERS)
    
    prob_home = 33
    prob_draw = 33
    prob_away = 34
    
    if pred_response.status_code == 200:
        pred_data = pred_response.json()
        if pred_data.get("response") and len(pred_data["response"]) > 0:
            percents = pred_data["response"][0]["predictions"]["percent"]
            prob_home = int(percents.get("home", "33%").replace("%", ""))
            prob_draw = int(percents.get("draw", "33%").replace("%", ""))
            prob_away = int(percents.get("away", "34%").replace("%", ""))
            print(f"  Probabilidades -> Local: {prob_home}% | Empate: {prob_draw}% | Visitante: {prob_away}%")
    return prob_home, prob_draw, prob_away

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

def main():
    print("Iniciando búsqueda de próximos partidos...")
    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada en las variables de entorno.")
        return

    # --- 1. BUSCAR PARTIDO GLOBAL (MUNDIAL/CHAMPIONS) ---
    upcoming_fixtures = []
    for league in LEAGUES_TO_CHECK:
        print(f"Buscando el próximo partido para la liga: {league['name']}...")
        url = f"https://v3.football.api-sports.io/fixtures?league={league['id']}&season={league['season']}&next=1"
        response = requests.get(url, headers=HEADERS)
        if response.status_code == 200:
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
        h, d, a = fetch_predictions(next_match["fixture"]["id"])
        radar_match_global = build_radar_obj(next_match, h, d, a)

    # --- 2. BUSCAR PARTIDO DE COLOMBIA ---
    print("\nBuscando el próximo partido para Colombia...")
    radar_match_colombia = None
    url_col = f"https://v3.football.api-sports.io/fixtures?team={COLOMBIA_TEAM_ID}&next=1"
    response_col = requests.get(url_col, headers=HEADERS)
    if response_col.status_code == 200:
        data_col = response_col.json()
        if data_col.get("errors") and "plan" in data_col["errors"]:
            print(f"  [ALERTA DE PAGO] API-Football bloqueó la consulta de equipo: {data_col['errors']['plan']}")
        elif data_col.get("response") and len(data_col["response"]) > 0:
            col_match = data_col["response"][0]
            print(f"  Encontrado: {col_match['teams']['home']['name']} vs {col_match['teams']['away']['name']}")
            h, d, a = fetch_predictions(col_match["fixture"]["id"])
            radar_match_colombia = build_radar_obj(col_match, h, d, a)
        else:
            print("  No hay partidos próximos para Colombia.")
    else:
        print(f"  Error consultando la API para Colombia: {response_col.text}")

    # --- 3. GUARDAR EN FIRESTORE ---
    print("\nConectando a Firebase Firestore...")
    try:
        # Intenta usar la ruta segura si el archivo falta en la raiz
        credentials_path = CREDENTIALS_FILE if os.path.exists(CREDENTIALS_FILE) else f"../{CREDENTIALS_FILE}"

        if "GCP_CREDENTIALS" in os.environ:
            creds_dict = json.loads(os.environ["GCP_CREDENTIALS"])
            firebase_creds = credentials.Certificate(creds_dict)
        else:
            firebase_creds = credentials.Certificate(credentials_path)

        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_creds)
        db = firestore.client()

        if radar_match_global:
            print("Actualizando el documento system/radar_match...")
            radar_match_global["updatedAt"] = firestore.SERVER_TIMESTAMP
            db.collection("system").document("radar_match").set(radar_match_global)

        if radar_match_colombia:
            print("Actualizando el documento system/colombia_match...")
            radar_match_colombia["updatedAt"] = firestore.SERVER_TIMESTAMP
            db.collection("system").document("colombia_match").set(radar_match_colombia)
        
        print("✅ ¡Ambos radares actualizados exitosamente en Firebase!")

    except Exception as e:
        import traceback
        print(f"❌ Error crítico al guardar en Firestore: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
