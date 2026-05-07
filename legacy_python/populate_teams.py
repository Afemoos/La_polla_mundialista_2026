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
# AI-NOTE: Cargar .env local si la variable no está en el entorno
if not API_KEY:
    for env_path in [".env", "../.env"]:
        try:
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")
            break
        except FileNotFoundError:
            continue
    API_KEY = os.environ.get("API_FOOTBALL_KEY", "")
CREDENTIALS_FILE = "credenciales_gcp.json"

HEADERS = {
    'x-rapidapi-host': "v3.football.api-sports.io",
    'x-rapidapi-key': API_KEY
}

# AI-NOTE: Tabla de equivalencias para nombres que la API puede devolver diferente
TEAM_NAME_ALIASES = {
    "DR Congo": ["Congo DR", "Democratic Republic of Congo"],
    "Ivory Coast": ["C\u00f4te d'Ivoire"],
    "Curacao": ["Cura\u00e7ao"],
    "South Korea": ["Korea Republic"],
    "Czech Republic": ["Czechia"],
    "Bosnia and Herzegovina": ["Bosnia & Herzegovina", "Bosnia-Herzegovina"],
    "Cape Verde": ["Cabo Verde", "Cape Verde Islands"],
    "United States": ["USA"],
    "Turkey": ["T\u00fcrkiye"],
}

# AI-NOTE: Mapeo oficial de grupos del Mundial 2026 (datos FIFA)
# Formato: (grupo, posici\u00f3n, nombre_en_api, c\u00f3digo_fifa, es_anfitri\u00f3n)
GROUP_MAPPING = [
    # Grupo A
    ("A", 1, "Mexico", "MEX", True),
    ("A", 2, "South Africa", "RSA", False),
    ("A", 3, "South Korea", "KOR", False),
    ("A", 4, "Czech Republic", "CZE", False),
    # Grupo B
    ("B", 1, "Canada", "CAN", True),
    ("B", 2, "Bosnia and Herzegovina", "BIH", False),
    ("B", 3, "Qatar", "QAT", False),
    ("B", 4, "Switzerland", "SUI", False),
    # Grupo C
    ("C", 1, "Brazil", "BRA", False),
    ("C", 2, "Morocco", "MAR", False),
    ("C", 3, "Haiti", "HAI", False),
    ("C", 4, "Scotland", "SCO", False),
    # Grupo D
    ("D", 1, "United States", "USA", True),
    ("D", 2, "Paraguay", "PAR", False),
    ("D", 3, "Australia", "AUS", False),
    ("D", 4, "Turkey", "TUR", False),
    # Grupo E
    ("E", 1, "Germany", "GER", False),
    ("E", 2, "Curacao", "CUW", False),
    ("E", 3, "Ivory Coast", "CIV", False),
    ("E", 4, "Ecuador", "ECU", False),
    # Grupo F
    ("F", 1, "Netherlands", "NED", False),
    ("F", 2, "Japan", "JPN", False),
    ("F", 3, "Sweden", "SWE", False),
    ("F", 4, "Tunisia", "TUN", False),
    # Grupo G
    ("G", 1, "Belgium", "BEL", False),
    ("G", 2, "Egypt", "EGY", False),
    ("G", 3, "Iran", "IRN", False),
    ("G", 4, "New Zealand", "NZL", False),
    # Grupo H
    ("H", 1, "Spain", "ESP", False),
    ("H", 2, "Cape Verde", "CPV", False),
    ("H", 3, "Saudi Arabia", "KSA", False),
    ("H", 4, "Uruguay", "URU", False),
    # Grupo I
    ("I", 1, "France", "FRA", False),
    ("I", 2, "Senegal", "SEN", False),
    ("I", 3, "Iraq", "IRQ", False),
    ("I", 4, "Norway", "NOR", False),
    # Grupo J
    ("J", 1, "Argentina", "ARG", False),
    ("J", 2, "Algeria", "ALG", False),
    ("J", 3, "Austria", "AUT", False),
    ("J", 4, "Jordan", "JOR", False),
    # Grupo K
    ("K", 1, "Portugal", "POR", False),
    ("K", 2, "DR Congo", "COD", False),
    ("K", 3, "Uzbekistan", "UZB", False),
    ("K", 4, "Colombia", "COL", False),
    # Grupo L
    ("L", 1, "England", "ENG", False),
    ("L", 2, "Croatia", "CRO", False),
    ("L", 3, "Ghana", "GHA", False),
    ("L", 4, "Panama", "PAN", False),
]


def init_firebase():
    """Inicializa Firebase Admin SDK usando el mismo patr\u00f3n de fetch_matches.py."""
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
        print("\u2705 Firebase inicializado correctamente.")
        return db
    except Exception as e:
        print(f"\u274c Error inicializando Firebase: {e}")
        return None


def fetch_all_teams(db):
    """Llama a /teams?league=1&season=2026 y retorna diccionario {nombre: datos}."""
    print("\n--- Obteniendo todos los equipos del Mundial 2026 ---")
    url = "https://v3.football.api-sports.io/teams?league=1&season=2026"
    time.sleep(1)
    response = requests.get(url, headers=HEADERS)

    if db and 'x-ratelimit-requests-current' in response.headers:
        try:
            db.collection("system").document("api_status").set({
                "requests_current": int(response.headers['x-ratelimit-requests-current']),
                "requests_limit": int(response.headers.get('x-ratelimit-requests-limit', '7500')),
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True)
        except Exception as e:
            print(f"  Error actualizando api_status: {e}")

    if response.status_code != 200:
        print(f"\u274c Error en la API: {response.status_code} - {response.text}")
        return {}

    data = response.json()
    if data.get("errors"):
        print(f"\u274c API report\u00f3 errores: {data['errors']}")
        return {}

    teams_list = data.get("response", [])
    if not teams_list:
        print("\u274c No se encontraron equipos en la respuesta.")
        return {}

    print(f"  API retorn\u00f3 {len(teams_list)} equipos.")

    # Construir diccionario de lookup por nombre
    team_dict = {}
    for entry in teams_list:
        team_data = entry.get("team", {})
        venue_data = entry.get("venue", {})
        name = team_data.get("name", "")
        team_dict[name] = {
            "team": team_data,
            "venue": venue_data,
        }

    return team_dict


def find_team_in_dict(group_name, team_dict):
    """Busca un equipo en el diccionario usando nombre directo + alias."""
    if group_name in team_dict:
        return team_dict[group_name]

    # Intentar con alias
    for canonical, aliases in TEAM_NAME_ALIASES.items():
        if group_name == canonical:
            for alias in aliases:
                if alias in team_dict:
                    return team_dict[alias]
        elif group_name in aliases:
            if canonical in team_dict:
                return team_dict[canonical]

    return None


def save_team_to_firestore(db, group, position, doc_id, team_entry, is_host):
    """Guarda un equipo en Firestore usando setDoc (idempotente)."""
    team_data = team_entry["team"]
    venue_data = team_entry["venue"]

    doc_data = {
        "apiId": team_data.get("id"),
        "name": team_data.get("name"),
        "code": team_data.get("code"),
        "country": team_data.get("country"),
        "logo": team_data.get("logo"),
        "founded": team_data.get("founded"),
        "national": team_data.get("national", True),
        "venue": {
            "apiId": venue_data.get("id"),
            "name": venue_data.get("name"),
            "address": venue_data.get("address"),
            "city": venue_data.get("city"),
            "capacity": venue_data.get("capacity"),
            "surface": venue_data.get("surface"),
            "image": venue_data.get("image"),
        },
        "group": group,
        "position": position,
        "host": is_host,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }

    path = f"Teams/world_cup_2026/Group_{group}/{doc_id}"
    db.document(path).set(doc_data)
    print(f"  \u2705 Guardado: {path}")


def fetch_and_save_squad(db, team_api_id, group, doc_id, team_entry):
    """Obtiene la plantilla de jugadores y la guarda en la subcoleccion Players y en la coleccion plana."""
    team_data = team_entry["team"]
    url = f"https://v3.football.api-sports.io/players/squads?team={team_api_id}"
    time.sleep(1)
    response = requests.get(url, headers=HEADERS)

    if response.status_code != 200:
        print(f"  \u26a0\ufe0f  Error obteniendo squad para team {team_api_id}: {response.status_code}")
        return 0

    data = response.json()
    if data.get("errors"):
        print(f"  \u26a0\ufe0f  API report\u00f3 errores para squad {team_api_id}: {data['errors']}")
        return 0

    players_list = data.get("response", [])
    if not players_list:
        print(f"  \u26a0\ufe0f  Sin jugadores para team {team_api_id} (plantilla no disponible a\u00fan)")
        return 0

    # La respuesta puede venir como lista de objetos con "team" y "players"
    total_saved = 0
    for entry in players_list:
        players = entry.get("players", [])
        for player in players:
            player_doc = {
                "apiId": player.get("id"),
                "name": player.get("name"),
                "age": player.get("age"),
                "number": player.get("number"),
                "position": player.get("position"),
                "photo": player.get("photo"),
            }
            player_id = str(player.get("id"))
            path = f"Teams/world_cup_2026/Group_{group}/{doc_id}/Players/{player_id}"
            db.document(path).set(player_doc)
            # AI-NOTE: Guardar tambien en coleccion plana para busqueda rapida (MiGoleador)
            flat_path = f"flat_players/{player_id}"
            db.document(flat_path).set({
                "apiId": player.get("id"),
                "name": player.get("name"),
                "age": player.get("age"),
                "number": player.get("number"),
                "position": player.get("position"),
                "photo": player.get("photo"),
                "teamApiId": team_api_id,
                "teamName": team_data.get("name"),
                "teamCode": team_data.get("code"),
                "teamLogo": team_data.get("logo"),
            })
            total_saved += 1

    print(f"  [Jugadores] {total_saved} guardados para {doc_id}")
    return total_saved


def main():
    print("=" * 60)
    print("POBLADO DE EQUIPOS DEL MUNDIAL 2026 EN FIRESTORE")
    print("=" * 60)

    if not API_KEY:
        print("\u274c ERROR: API_FOOTBALL_KEY no est\u00e1 configurada.")
        return

    # 1. Inicializar Firebase
    db = init_firebase()
    if not db:
        return

    # AI-NOTE: Crear documento intermedio explícitamente para que la consola
    # de Firestore muestre todas las subcolecciones (Groups A-L).
    db.document("Teams/world_cup_2026").set({
        "tournament": "FIFA World Cup 2026",
        "season": 2026,
        "totalTeams": 48,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    # 2. Obtener todos los equipos de la API
    team_dict = fetch_all_teams(db)
    if not team_dict:
        print("\u274c No se pudieron obtener los equipos. Abortando.")
        return

    # 3. Iterar sobre el mapeo de grupos y guardar cada equipo
    print("\n--- Guardando equipos en Firestore ---")
    teams_saved = 0
    players_saved = 0
    errors = []

    for group, position, name, code, is_host in GROUP_MAPPING:
        doc_id = f"wc_{group.lower()}_{position}_{code.lower()}_26"

        team_entry = find_team_in_dict(name, team_dict)
        if not team_entry:
            error_msg = f"No se encontr\u00f3 '{name}' en la respuesta de la API"
            print(f"  \u274c {error_msg}")
            errors.append(error_msg)
            continue

        try:
            # Guardar equipo
            save_team_to_firestore(db, group, position, doc_id, team_entry, is_host)
            teams_saved += 1

            # Obtener y guardar squad
            team_api_id = team_entry["team"].get("id")
            if team_api_id:
                p_count = fetch_and_save_squad(db, team_api_id, group, doc_id, team_entry)
                players_saved += p_count
            else:
                print(f"  \u26a0\ufe0f  Sin apiId para {name}, saltando squad")

        except Exception as e:
            error_msg = f"Error guardando {name}: {e}"
            print(f"  \u274c {error_msg}")
            errors.append(error_msg)

    # 4. Resumen final
    print("\n" + "=" * 60)
    print("RESUMEN FINAL")
    print("=" * 60)
    print(f"  Equipos guardados: {teams_saved}/{len(GROUP_MAPPING)}")
    print(f"  Jugadores guardados: {players_saved}")
    if errors:
        print(f"  Errores: {len(errors)}")
        for err in errors:
            print(f"    - {err}")
    else:
        print("  \u2705 Sin errores!")
    print("=" * 60)


if __name__ == "__main__":
    main()
