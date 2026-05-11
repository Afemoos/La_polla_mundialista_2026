"""Formateo de fábrica: borra predicciones, brackets, resetea tokens."""
import os, json, time, firebase_admin
from firebase_admin import credentials, firestore

def main():
    for env_path in ['.env', '../.env']:
        try:
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")
            break
        except FileNotFoundError:
            continue

    creds_path = 'credenciales_gcp.json' if os.path.exists('credenciales_gcp.json') else '../credenciales_gcp.json'
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(creds_path))
    db = firestore.client()

    if input('¿Borrar TODAS las predicciones y brackets? (yes/no): ') != 'yes':
        print('Cancelado.')
        return

    deleted_preds = 0
    deleted_picks = 0
    tokens_reset = 0

    # 1. Eliminar predicciones
    print('Eliminando predicciones...')
    for doc in db.collection_group('predictions').stream():
        doc.reference.delete()
        deleted_preds += 1
        if deleted_preds % 100 == 0:
            print(f'  {deleted_preds}...')
            time.sleep(0.5)

    # 2. Eliminar brackets/campeon/goleador
    print('Eliminando picks...')
    for profile in db.collection_group('profile').stream():
        uid = profile.to_dict().get('uid')
        if not uid:
            continue
        for pick_type in ['bracket', 'campeon', 'goleador']:
            ref = db.document(f'users/{uid}/tournaments/world_cup_2026/{pick_type}/data')
            if ref.get().exists:
                ref.delete()
                deleted_picks += 1

    # 3. Resetear tokens
    print('Reseteando tokens...')
    for profile in db.collection_group('profile').stream():
        profile.reference.update({'tokens': 0})
        tokens_reset += 1

    # 4. Eliminar duplicados
    print('Eliminando duplicados...')
    by_email = {}
    for profile in db.collection_group('profile').stream():
        data = profile.to_dict()
        email = data.get('email', '')
        if email not in by_email:
            by_email[email] = []
        by_email[email].append({'ref': profile.reference, 'tokens': data.get('tokens', 0)})

    dupes_deleted = 0
    for email, entries in by_email.items():
        if len(entries) <= 1:
            continue
        entries.sort(key=lambda x: x['tokens'], reverse=True)
        for entry in entries[1:]:
            entry['ref'].delete()
            dupes_deleted += 1

    print(f'\n=== RESULTADO ===')
    print(f'Predicciones eliminadas: {deleted_preds}')
    print(f'Picks eliminados: {deleted_picks}')
    print(f'Tokens reseteados: {tokens_reset}')
    print(f'Duplicados eliminados: {dupes_deleted}')
    print('==================')

if __name__ == '__main__':
    main()
