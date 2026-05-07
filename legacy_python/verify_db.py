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
    creds_path = 'credenciales_gcp.json' if os.path.exists('credenciales_gcp.json') else '../credenciales_gcp.json'
    creds = credentials.Certificate(creds_path)
    firebase_admin.initialize_app(creds)

db = firestore.client()

print('=' * 70)
print('VERIFICACION: /Teams/world_cup_2026')
print('=' * 70)

# Documento raiz
t_doc = db.document('Teams/world_cup_2026').get()
if t_doc.exists:
    t = t_doc.to_dict()
    print(f'\n[TOURNAMENT] {t["tournament"]} | Season: {t["season"]}')
else:
    print('\n[x] world_cup_2026 no encontrado')
    exit(1)

groups = ['A','B','C','D','E','F','G','H','I','J','K','L']
total_teams = 0
total_players = 0

for g in groups:
    docs = list(db.collection(f'Teams/world_cup_2026/Group_{g}').stream())
    print(f'\n--- Grupo {g} ({len(docs)} equipos) ---')
    for doc in docs:
        d = doc.to_dict()
        v = d.get('venue', {})
        host = ' [ANFITRION]' if d.get('host') else ''
        print(f'  {d["position"]}. {d["name"]} ({d["code"]}){host}')
        print(f'     venue: {v.get("name","?")} ({v.get("city","?")})')

        # Jugadores
        p_docs = list(db.collection(f'Teams/world_cup_2026/Group_{g}/{doc.id}/Players').stream())
        if p_docs:
            positions = {}
            for p in p_docs:
                pd = p.to_dict()
                pos = pd.get('position', '?')
                positions[pos] = positions.get(pos, 0) + 1
            pos_s = ', '.join(f'{k}={c}' for k, c in sorted(positions.items()))
            print(f'     players: {len(p_docs)} ({pos_s})')
            total_players += len(p_docs)
        total_teams += 1

print(f'\n{"=" * 70}')
print(f'TOTAL: {total_teams}/48 equipos | {total_players} jugadores')
print(f'{"=" * 70}')
