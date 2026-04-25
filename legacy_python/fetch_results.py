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

# IDs
COLOMBIA_TEAM_ID = 8   # Colombia (mismo ID que fetch_matches.py)
CHAMPIONS_LEAGUE_ID = 2  # UEFA Champions League
WORLD_CUP_ID = 1  # FIFA World Cup
WORLD_CUP_SEASON = 2026  # Temporada del Mundial
CHAMPIONS_SEASON = 2025  # Temporada Champions

def update_api_status(db, response_headers):
    """Extrae las cabeceras de rate limit y las guarda en Firestore."""
    if 'x-ratelimit-requests-current' in response_headers:
        current_req = response_headers['x-ratelimit-requests-current']
        limit_req = response_headers.get('x-ratelimit-requests-limit', '7500')
        try:
            db.collection("system").document("api_status").set({
                "requests_current": int(current_req),
                "requests_limit": int(limit_req),
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True)
        except Exception as e:
            print(f"Error actualizando api_status: {e}")

def get_recent_matches(league_or_team, is_team=False):
    """Obtiene los últimos 10 partidos finalizados (FT, AET, PEN)."""
    # Si es equipo, traemos sus últimos 10 partidos en todas las competiciones (o podemos filtrar).
    # Como solo queremos 10, usamos el parametro 'last=10'
    
    if is_team:
        url = f"https://v3.football.api-sports.io/fixtures?team={league_or_team}&last=10&status=FT-AET-PEN"
    else:
        season = WORLD_CUP_SEASON if league_or_team == WORLD_CUP_ID else CHAMPIONS_SEASON
        url = f"https://v3.football.api-sports.io/fixtures?league={league_or_team}&season={season}&last=10&status=FT-AET-PEN"
        
    time.sleep(0.5)
    response = requests.get(url, headers=HEADERS)
    db = firestore.client()
    
    if response.status_code == 200:
        update_api_status(db, response.headers)
        data = response.json()
        matches = []
        if data.get("response"):
            for item in data["response"]:
                matches.append({
                    "fixtureId": item["fixture"]["id"],
                    "date": item["fixture"]["date"],
                    "homeTeam": item["teams"]["home"]["name"],
                    "homeFlag": item["teams"]["home"]["logo"],
                    "awayTeam": item["teams"]["away"]["name"],
                    "awayFlag": item["teams"]["away"]["logo"],
                    "goalsHome": item["goals"]["home"],
                    "goalsAway": item["goals"]["away"],
                    "status": item["fixture"]["status"]["short"]
                })
        # Invertimos para mostrar el más reciente primero (por defecto last=10 los trae cronológicamente ascendente)
        return sorted(matches, key=lambda x: x["date"], reverse=True)
    else:
        print(f"Error obteniendo resultados: {response.text}")
        return []

def main():
    print("Iniciando Robot de Resultados...")
    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada.")
        return

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

        print("Consultando Colombia...")
        colombia_results = get_recent_matches(COLOMBIA_TEAM_ID, is_team=True)
        
        print("Consultando Champions League...")
        champions_results = get_recent_matches(CHAMPIONS_LEAGUE_ID, is_team=False)
        
        print("Consultando World Cup...")
        worldcup_results = get_recent_matches(WORLD_CUP_ID, is_team=False)

        # Guardar en Firestore
        db.collection("system").document("recent_results").set({
            "colombia": colombia_results,
            "champions": champions_results,
            "worldcup": worldcup_results,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        
        print("✅ Resultados guardados en Firestore.")

    except Exception as e:
        import traceback
        print(f"❌ Error crítico: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
