"""Limpia documentos con deletedAt > 30 días usando Admin SDK."""
import os, json, firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta

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
    cutoff = datetime.now() - timedelta(days=30)
    total = 0

    # Limpiar predicciones
    for doc in db.collection_group('predictions').stream():
        data = doc.to_dict()
        if data.get('deletedAt') and data['deletedAt'].datetime < cutoff:
            doc.reference.delete()
            total += 1
            if total % 50 == 0:
                print(f'  {total} documentos eliminados...')

    # Limpiar brackets/campeon/goleador
    for pick_type in ['bracket', 'campeon', 'goleador']:
        for doc in db.collection_group(pick_type).stream():
            data = doc.to_dict()
            if data.get('deletedAt') and data['deletedAt'].datetime < cutoff:
                doc.reference.delete()
                total += 1

    # Limpiar profiles
    for doc in db.collection_group('profile').stream():
        data = doc.to_dict()
        if data.get('deletedAt') and data['deletedAt'].datetime < cutoff:
            doc.reference.delete()
            total += 1

    print(f'Total eliminados físicamente: {total}')

if __name__ == '__main__':
    main()
