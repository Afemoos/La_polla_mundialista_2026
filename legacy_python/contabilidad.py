import os
import json
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import gspread
from google.oauth2.service_account import Credentials

# --- CONFIGURACION ---
SHEET_ID = "1F6cHIW0gCb3G0vFFhnQkTLwrRtrdnBJXIOsCgkKOCb4"
CREDENTIALS_FILE = "credenciales_gcp.json"

def main():
    print("Iniciando sincronización de contabilidad...")
    
    # 1. Autenticación unificada para Firebase y Google Sheets
    # Usamos el mismo archivo credenciales_gcp.json para ambos servicios
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    
    try:
        # Si estamos en GitHub Actions, leemos desde una variable de entorno
        if "GCP_CREDENTIALS" in os.environ:
            print("Entorno Nube detectado. Cargando credenciales desde secretos...")
            creds_dict = json.loads(os.environ["GCP_CREDENTIALS"])
            firebase_creds = credentials.Certificate(creds_dict)
            gspread_creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        else:
            print("Entorno Local detectado. Cargando archivo JSON...")
            firebase_creds = credentials.Certificate(CREDENTIALS_FILE)
            gspread_creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)

        # 2. Inicializar Firebase
        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_creds)
        db = firestore.client()

        # 3. Inicializar Google Sheets
        client = gspread.authorize(gspread_creds)
        sheet = client.open_by_key(SHEET_ID)
        
        try:
            ws_resumen = sheet.worksheet("Resumen Financiero")
            ws_auditoria = sheet.worksheet("Auditoria")
        except gspread.exceptions.WorksheetNotFound:
            print("Creando pestañas faltantes en el Google Sheet...")
            # Si las pestañas no existen, las creamos
            ws_resumen = sheet.sheet1
            ws_resumen.update_title("Resumen Financiero")
            ws_auditoria = sheet.add_worksheet(title="Auditoria", rows="1000", cols="20")

        # 4. Descargar apuestas de Firestore
        print("Descargando datos de Firestore...")
        predictions_ref = db.collection("predictions")
        docs = predictions_ref.stream()
        
        all_bets = []
        total_pagado = 0
        total_pendiente = 0
        bolsa_ganadores = 0
        
        # Precio por apuesta (asumimos 5000 COP, ajusta si es necesario)
        VALOR_APUESTA = 5000
        COMISION_CASA = 0 # 0% de comisión por defecto
        
        for doc in docs:
            data = doc.to_dict()
            bet = {
                "id": doc.id,
                "email": data.get("email", "Desconocido"),
                "partido": data.get("matchDetails", "Desconocido"),
                "prediccion": data.get("prediction", ""),
                "estado": data.get("status", "PENDIENTE"),
                "resultado": data.get("result", "En Juego")
            }
            all_bets.append(bet)
            
            if bet["estado"] == "PAGADO":
                total_pagado += VALOR_APUESTA
            else:
                total_pendiente += VALOR_APUESTA
                
            if bet["resultado"] == "GANADOR" and bet["estado"] == "PAGADO":
                # Si ganó y pagó, tiene derecho a parte de la bolsa (se calculará globalmente luego)
                pass

        bolsa_repartir = total_pagado * (1 - COMISION_CASA)
        ganancia_casa = total_pagado * COMISION_CASA

        # 5. Escribir Auditoria
        print("Actualizando pestaña 'Auditoria'...")
        auditoria_data = [["ID Ticket", "Email", "Partido", "Predicción", "Estado de Pago", "Resultado"]]
        for b in all_bets:
            auditoria_data.append([b["id"], b["email"], b["partido"], b["prediccion"], b["estado"], b["resultado"]])
        
        ws_auditoria.clear()
        ws_auditoria.update(values=auditoria_data, range_name="A1")
        
        # 6. Escribir Resumen
        print("Actualizando pestaña 'Resumen Financiero'...")
        resumen_data = [
            ["Métrica", "Valor (COP)", "Notas"],
            ["Total Dinero en Caja (Pagado)", total_pagado, "Dinero real recolectado"],
            ["Dinero Faltante (Pendiente)", total_pendiente, "Deudas de usuarios"],
            ["Bolsa a Repartir", bolsa_repartir, f"Restando {COMISION_CASA*100}% de comisión"],
            ["Ganancia Administrador", ganancia_casa, "Para la casa"],
            ["Total Tickets Auditados", len(all_bets), ""]
        ]
        ws_resumen.clear()
        ws_resumen.update(values=resumen_data, range_name="A1")

        print("¡Sincronización Completada con Éxito!")

    except Exception as e:
        import traceback
        print(f"Error crítico durante la sincronización: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
