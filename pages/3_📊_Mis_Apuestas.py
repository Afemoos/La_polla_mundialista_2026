import streamlit as st
import pandas as pd
from components.auth import require_login
from components.ui_helpers import render_header
from core.sheets_db import db

require_login()

st.set_page_config(page_title="Mis Apuestas - Polla Mundialista", page_icon="📊", layout="wide")
render_header()

st.header("📊 Mis Apuestas y Registros")

user_email = st.session_state.get("user_email")
if not user_email:
    st.stop()
st.write(f"Aquí puedes ver el historial y estado de todas las predicciones enviadas por: **{user_email}**")

@st.cache_data(ttl=30, show_spinner=False)
def fetch_user_data(email):
    """Obtiene los datos filtrados por email de ambas hojas con un ligero caché para velocidad."""
    principal_sheet = db.get_sheet("Registro_Principal")
    micro_sheet = db.get_sheet("Micro_Eventos")
    
    principal_data = []
    micro_data = []
    
    if principal_sheet:
        try:
            all_p = principal_sheet.get_all_records()
            principal_data = [r for r in all_p if str(r.get("Email_Usuario", "")).strip().lower() == email.strip().lower()]
        except:
             pass
             
    if micro_sheet:
        try:
            all_m = micro_sheet.get_all_records()
            micro_data = [r for r in all_m if str(r.get("Email_Usuario", "")).strip().lower() == email.strip().lower()]
        except:
            pass
            
    return principal_data, micro_data

col1, col2 = st.columns([1, 1])
if st.button("🔄 Refrescar Datos"):
    fetch_user_data.clear()

with st.spinner("Cargando historial desde la nube..."):
    principal_data, micro_data = fetch_user_data(user_email)

st.markdown("---")
st.subheader("🏆 Registro Principal")
if principal_data:
    df_p = pd.DataFrame(principal_data)
    # Formatear la tabla visualmente si tiene columnas esperadas
    st.dataframe(df_p, use_container_width=True, hide_index=True)
else:
    st.info("Aún no tienes predicciones enviadas en el evento principal.")

st.subheader("⚡ Micro-Eventos (Partidos)")
if micro_data:
    df_m = pd.DataFrame(micro_data)
    st.dataframe(df_m, use_container_width=True, hide_index=True)
else:
     st.info("Aún no has participado en partidos relámpago.")
