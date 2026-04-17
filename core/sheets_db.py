import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os
import streamlit as st

class SheetsDB:
    def __init__(self):
        self.scope = ["https://spreadsheets.google.com/feeds", 'https://www.googleapis.com/auth/spreadsheets',
         "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"]
        self.spreadsheet_name = os.getenv("SPREADSHEET_NAME", "Polla Mundialista")
        self.client = None
        self.connect()

    def connect(self):
        """Intenta conectarse a Google Sheets usando gspread"""
        try:
            # Opción 1: Archivo local (Desarrollo)
            if os.path.exists("credenciales_gcp.json"):
                creds = ServiceAccountCredentials.from_json_keyfile_name("credenciales_gcp.json", self.scope)
                self.client = gspread.authorize(creds)
            # Opción 2: Streamlit Cloud Secrets (Producción)
            elif "gcp_service_account" in st.secrets:
                creds = ServiceAccountCredentials.from_json_keyfile_dict(st.secrets["gcp_service_account"], self.scope)
                self.client = gspread.authorize(creds)
            else:
                 st.error("No se encontraron 'credenciales_gcp.json' ni secrets.")
        except Exception as e:
            st.error(f"Error conectando a Google Sheets: {e}")

    def get_sheet(self, worksheet_name):
        if not self.client:
             st.warning("⚠️ Base de datos no conectada.")
             return None
        try:
            sheet = self.client.open(self.spreadsheet_name).worksheet(worksheet_name)
            return sheet
        except Exception as e:
            st.error(f"Error accediendo a la hoja '{worksheet_name}': {e}. Revisa el nombre y permisos.")
            return None

    def check_if_user_registered(self, worksheet_name, email, id_partido=None):
        """Verifica si un correo ya registro una predicción para evitar duplicados"""
        sheet = self.get_sheet(worksheet_name)
        if not sheet: return False
        try:
            registros = sheet.get_all_records()
            for r in registros:
                if str(r.get('Email_Usuario', '')).strip().lower() == email.strip().lower():
                    if id_partido is None or str(r.get('ID_Partido', '')).strip() == str(id_partido).strip():
                         return True
            return False
        except Exception as e:
            # Puede fallar si la tabla no tiene encabezados o está vacía
            return False

    def append_record(self, worksheet_name, record_data):
        """Guarda una nueva prediccion en Google Sheets"""
        sheet = self.get_sheet(worksheet_name)
        if sheet is None: return False
        try:
            sheet.append_row(record_data)
            return True
        except Exception as e:
            st.error(f"Error al guardar: {e}")
            return False

# Instancia global (Singleton-like behavior para este módulo)
db = SheetsDB()
