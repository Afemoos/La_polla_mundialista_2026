import os, json, firebase_admin
from firebase_admin import credentials, firestore

for env_path in ['.env', '../.env']:
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip('"').strip("'")
        break
    except FileNotFoundError:
        continue

if not firebase_admin._apps:
    p = 'credenciales_gcp.json' if os.path.exists('credenciales_gcp.json') else '../credenciales_gcp.json'
    firebase_admin.initialize_app(credentials.Certificate(p))
db = firestore.client()

# Test flat_players search
print("=== Searching flat_players for 'Me' ===")
players_ref = db.collection('flat_players')
docs = list(players_ref.order_by('name').start_at({'name': 'Me'}).end_at({'name': 'Me\uf8ff'}).limit(5).stream())
print(f"Results: {len(docs)}")
for d in docs:
    p = d.to_dict()
    print(f"  {p['name']} ({p['teamName']})")

# Test Teams access
print("\n=== Teams Group A ===")
teams_ref = db.collection('Teams/world_cup_2026/Group_A')
team_docs = list(teams_ref.limit(4).stream())
print(f"Teams: {len(team_docs)}")
for d in team_docs:
    t = d.to_dict()
    print(f"  {t['name']} - {t['code']}")

# Test bracket access
print("\n=== brackets collection ===")
brackets_ref = db.collection('brackets')
bracket_docs = list(brackets_ref.limit(2).stream())
print(f"Brackets: {len(bracket_docs)}")
