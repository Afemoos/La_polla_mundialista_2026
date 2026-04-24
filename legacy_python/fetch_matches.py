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

def main():
    print("Iniciando búsqueda de próximos partidos...")
    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada en las variables de entorno.")
        return

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

    if not upcoming_fixtures:
        print("No se encontraron partidos próximos para las ligas configuradas. Terminando.")
        return

    # Ordenar todos los partidos encontrados por fecha para escoger el más inminente
    upcoming_fixtures.sort(key=lambda x: x["fixture"]["timestamp"])
    next_match = upcoming_fixtures[0]
    fixture_id = next_match["fixture"]["id"]

    print(f"\nEl partido más próximo en el calendario es:")
    print(f"{next_match['teams']['home']['name']} vs {next_match['teams']['away']['name']} (ID: {fixture_id})")

    # Consultar las predicciones/probabilidades
    print(f"Obteniendo probabilidades para el partido {fixture_id}...")
    pred_url = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
    pred_response = requests.get(pred_url, headers=HEADERS)
    
    # Valores por defecto en caso de no haber datos de predicción
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

    # Preparar el objeto Radar Tricolor para React
    radar_match = {
        "homeTeam": next_match['teams']['home']['name'],
        "homeFlag": next_match['teams']['home']['logo'],
        "awayTeam": next_match['teams']['away']['name'],
        "awayFlag": next_match['teams']['away']['logo'],
        "date": next_match['fixture']['date'],
        "stadium": next_match['fixture']['venue']['name'] or "Estadio por definir",
        "probHome": prob_home,
        "probDraw": prob_draw,
        "probAway": prob_away,
    }

    print("\nConectando a Firebase Firestore...")
    try:
        # Autenticación dual (Nube vs Local)
        if "GCP_CREDENTIALS" in os.environ:
            creds_dict = json.loads(os.environ["GCP_CREDENTIALS"])
            firebase_creds = credentials.Certificate(creds_dict)
        else:
            firebase_creds = credentials.Certificate(CREDENTIALS_FILE)

        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_creds)
        db = firestore.client()

        print("Actualizando el documento system/radar_match...")
        radar_ref = db.collection("system").document("radar_match")
        
        radar_match["updatedAt"] = firestore.SERVER_TIMESTAMP
        radar_ref.set(radar_match)
        
        print("✅ ¡El Radar Tricolor fue actualizado globalmente en Firebase!")

    except Exception as e:
        import traceback
        print(f"❌ Error crítico al guardar en Firestore: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
