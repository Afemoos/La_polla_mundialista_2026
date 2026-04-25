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

def update_api_status(db, response_headers):
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

def check_match_status(fixture_id, db=None):
    """
    Consulta la API para obtener el estado y el marcador del partido.
    Retorna (is_finished, final_score)
    """
    url = f"https://v3.football.api-sports.io/fixtures?id={fixture_id}"
    time.sleep(0.5) # Prevención de Rate Limit (R/S)
    response = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        if db: update_api_status(db, response.headers)
        data = response.json()
        if data.get("response") and len(data["response"]) > 0:
            fixture_data = data["response"][0]
            status = fixture_data["fixture"]["status"]["short"]
            
            # FT: Tiempo regular, AET: Tiempo extra, PEN: Penales
            if status in ["FT", "AET", "PEN"]:
                # La opción elegida por el usuario incluye Tiempo Extra, pero IGNORA Penales.
                # Si hubo tiempo extra, usamos el score de extratime, si no, el de fulltime.
                goals_home = fixture_data["score"]["extratime"]["home"]
                goals_away = fixture_data["score"]["extratime"]["away"]
                
                if goals_home is None or goals_away is None:
                    # No hubo goles extra o no llegó a tiempo extra, usamos el tiempo completo (90m)
                    goals_home = fixture_data["score"]["fulltime"]["home"]
                    goals_away = fixture_data["score"]["fulltime"]["away"]
                
                # Por si acaso la API no tiene 'fulltime' pero el partido dice FT (sucede si se cancela a veces o es un error)
                if goals_home is None or goals_away is None:
                    # Fallback a los goles totales
                    goals_home = fixture_data["goals"]["home"]
                    goals_away = fixture_data["goals"]["away"]
                    
                if goals_home is not None and goals_away is not None:
                    final_score = f"{goals_home} - {goals_away}"
                    return True, final_score
            return False, None
    print(f"  Error consultando la API para fixture {fixture_id}: {response.text}")
    return False, None

def main():
    print("Iniciando Robot Auditor...")
    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY no está configurada.")
        return

    print("Conectando a Firebase Firestore...")
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

        # 1. Obtener predicciones que no tienen resultado y que tienen fixtureId
        preds_ref = db.collection("predictions")
        
        # Filtramos por las que NO tienen result (result is null, pero Firestore no permite hacer '==' null en algunas consultas simples, así que traemos todas y filtramos localmente para evitar crear índices complejos).
        docs = preds_ref.get()
        
        pending_audits = {} # Dict para agrupar apuestas por fixtureId
        
        for doc in docs:
            data = doc.to_dict()
            # Si no tiene fixtureId o ya tiene result, la ignoramos.
            if not data.get("fixtureId") or data.get("result"):
                continue
            
            f_id = data["fixtureId"]
            if f_id not in pending_audits:
                pending_audits[f_id] = []
            pending_audits[f_id].append({"id": doc.id, "prediction": data.get("prediction")})
            
        if not pending_audits:
            print("No hay apuestas pendientes con fixtureId por auditar.")
            return

        print(f"Se encontraron apuestas pendientes agrupadas en {len(pending_audits)} partidos diferentes.")

        # 2. Auditar cada partido
        for f_id, bets in pending_audits.items():
            print(f"Consultando estado del partido ID: {f_id}...")
            is_finished, final_score = check_match_status(f_id, db)
            
            if is_finished and final_score:
                print(f"  ✅ El partido ha finalizado. Marcador oficial (incluyendo Tiempos Extra, sin penales): {final_score}")
                print(f"  Procediendo a sellar {len(bets)} apuestas...")
                
                # Sellar cada apuesta
                batch = db.batch()
                winners = 0
                for bet in bets:
                    bet_ref = db.collection("predictions").document(bet["id"])
                    is_winner = "GANADA" if bet["prediction"] == final_score else "PERDIDA"
                    if is_winner == "GANADA":
                        winners += 1
                    batch.update(bet_ref, {"result": is_winner, "finalScore": final_score})
                
                batch.commit()
                print(f"  ✅ Partidas auditadas. {winners} ganadores.")
            else:
                print(f"  ⏳ El partido {f_id} aún no ha finalizado o no tiene marcador definitivo.")

    except Exception as e:
        import traceback
        print(f"❌ Error crítico en el auditor: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
