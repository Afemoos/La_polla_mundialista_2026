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

    def connect(self):
        """Intenta conectarse a Google Sheets usando gspread"""
        # TODO: Implementar usando credenciales al configurarse
        # creds = ServiceAccountCredentials.from_json_keyfile_name("credenciales_gcp.json", self.scope)
        # self.client = gspread.authorize(creds)
        pass

    def get_sheet(self, worksheet_name):
        if not self.client:
             st.warning("⚠️ Base de datos no conectada. Simulación activa.")
             return None
        # sheet = self.client.open(self.spreadsheet_name).worksheet(worksheet_name)
        # return sheet
        return None

    def check_if_user_registered(self, worksheet_name, email, id_partido=None):
        """Verifica si un correo ya registro una predicción para evitar duplicados"""
        # sheet = self.get_sheet(worksheet_name)
        # if not sheet: return False
        # registros = sheet.get_all_records()
        # for r in registros:
        #     if r.get('Email_Usuario') == email:
        #         if id_partido is None or str(r.get('ID_Partido')) == str(id_partido):
        #              return True
        return False

    def append_record(self, worksheet_name, record_data):
        """Guarda una nueva prediccion en Google Sheets"""
        # sheet = self.get_sheet(worksheet_name)
        # si sheet no existe, no hace nada (simulado)
        # sheet.append_row(record_data)
        st.success("✅ Registro simulado guardado exitosamente.")
        return True

# Instancia global (Singleton-like behavior para este módulo)
db = SheetsDB()
