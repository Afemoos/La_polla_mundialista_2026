import os
import json
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

CREDENTIALS_FILE = "credenciales_gcp.json"

def main():
    print("=== LIMPIEZA DE PREDICCIONES OBSOLETAS ===")
    print("Este script eliminara documentos con status CANCELADA o PENDIENTE.")

    try:
        if "GCP_CREDENTIALS" in os.environ:
            creds_dict = json.loads(os.environ["GCP_CREDENTIALS"])
            firebase_creds = credentials.Certificate(creds_dict)
        else:
            credentials_path = CREDENTIALS_FILE if os.path.exists(CREDENTIALS_FILE) else f"../{CREDENTIALS_FILE}"
            firebase_creds = credentials.Certificate(credentials_path)

        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_creds)
        db = firestore.client()

        predictions_ref = db.collection("predictions")
        docs = predictions_ref.stream()

        borrados = 0
        omitidos = 0
        batch = db.batch()
        batch_count = 0

        for doc in docs:
            data = doc.to_dict()
            status = data.get("status")

            if status in ("CANCELADA", "PENDIENTE"):
                batch.delete(doc.reference)
                batch_count += 1
                borrados += 1
                print(f"  🗑️ Marcado para borrar: {doc.id} (status={status})")

                if batch_count >= 450:
                    batch.commit()
                    print(f"  ✅ Lote de {batch_count} documentos eliminado.")
                    batch = db.batch()
                    batch_count = 0
            else:
                omitidos += 1

        if batch_count > 0:
            batch.commit()
            print(f"  ✅ Ultimo lote de {batch_count} documentos eliminado.")

        print(f"\n=== RESULTADO ===")
        print(f"  Documentos eliminados: {borrados}")
        print(f"  Documentos conservados: {omitidos}")

    except Exception as e:
        import traceback
        print(f"Error critico: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
