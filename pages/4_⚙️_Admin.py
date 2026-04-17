import streamlit as st
import pandas as pd
import os
from components.auth import require_login
from components.ui_helpers import render_header
from core.sheets_db import db

require_login()

st.set_page_config(page_title="Admin - Polla Mundialista", page_icon="⚙️", layout="wide")

# Validacion de admin maestros
admin_emails = os.getenv("ADMIN_EMAILS", "afemos027@gmail.com").replace(" ", "").split(",")
try:
    if "ADMIN_EMAILS" in st.secrets:
        admin_emails = st.secrets["ADMIN_EMAILS"].replace(" ", "").split(",")
except FileNotFoundError:
    pass

user_email = st.session_state.get("user_email", "")

if user_email.strip().lower() not in [e.strip().lower() for e in admin_emails]:
    st.error("⛔ Acceso denegado. Solo acceso nivel Administrador.")
    st.stop()

render_header()
st.header("⚙️ Torre de Control (Área Segura)")
st.write("Bienvenido Administrador. Usa este panel para cambiar cobros de PENDIENTE a PAGADO.")

@st.cache_data(ttl=15, show_spinner=False)
def fetch_all_data():
    """Busca temporalmente todos los registros para la vista de administrador."""
    principal_sheet = db.get_sheet("Registro_Principal")
    micro_sheet = db.get_sheet("Micro_Eventos")
    
    principal_data = []
    micro_data = []
    
    if principal_sheet:
        try:
             principal_data = principal_sheet.get_all_records()
        except: pass
    if micro_sheet:
        try:
             micro_data = micro_sheet.get_all_records()
        except: pass
        
    return principal_data, micro_data

principal_data, micro_data = fetch_all_data()

st.markdown("---")
st.subheader("🏆 Registros Principales Generales")

if principal_data:
    df_p = pd.DataFrame(principal_data)
    
    # Creamos un pequeño truco visual cambiando colores si esta pendiente
    def color_status(val):
        color = 'green' if val == 'PAGADO' else 'red'
        return f'color: {color}'
        
    # Mostramos los datos de manera nativa editable (data_editor) es interactivo
    st.dataframe(df_p.style.map(color_status, subset=['Estado_Pago']) if 'Estado_Pago' in df_p.columns else df_p, use_container_width=True)

    # Formulario para actualizar el estado
    with st.expander("📝 Cambiar Estado de Pago (Principal)"):
         with st.form("form_update_principal"):
              col1, col2, col3 = st.columns(3)
              with col1:
                   t_stamp = st.selectbox("Selecciona el Timestamp del registro:", df_p['Timestamp'].tolist() if 'Timestamp' in df_p.columns else [])
              with col2:
                   if t_stamp:
                        f_email = df_p[df_p['Timestamp'] == t_stamp]['Email_Usuario'].iloc[0]
                        st.info(f"Usuario: {f_email}")
                   else:
                        f_email = ""
              with col3:
                   new_status = st.selectbox("Nuevo Estado:", ["PAGADO", "PENDIENTE"])
              
              if st.form_submit_button("Actualizar y Guardar en Sheets"):
                  if t_stamp and f_email:
                       if db.update_payment_status("Registro_Principal", t_stamp, f_email, new_status):
                            st.success(f"Dato de {f_email} actualizado a {new_status}")
                            fetch_all_data.clear()
                            st.rerun()
                  else:
                       st.warning("Selecciona al menos un registro.")
else:
    st.info("Sin registros.")


st.markdown("---")
st.subheader("⚡ Registros en Partidos Rápidos (Micro Eventos)")

if micro_data:
    df_m = pd.DataFrame(micro_data)
    st.dataframe(df_m, use_container_width=True)
    
    with st.expander("📝 Cambiar Estado de Pago (Micro-Eventos)"):
         with st.form("form_update_micro"):
              col1, col2, col3 = st.columns(3)
              with col1:
                   t_stamp_m = st.selectbox("Selecciona el Timestamp:", df_m['Timestamp'].tolist() if 'Timestamp' in df_m.columns else [])
              with col2:
                   if t_stamp_m:
                        f_email_m = df_m[df_m['Timestamp'] == t_stamp_m]['Email_Usuario'].iloc[0]
                        st.info(f"Usuario: {f_email_m}")
                   else:
                        f_email_m = ""
              with col3:
                   new_status_m = st.selectbox("Nuevo Estado (Micro):", ["PAGADO", "PENDIENTE"])
              
              if st.form_submit_button("Actualizar y Guardar"):
                  if t_stamp_m and f_email_m:
                       if db.update_payment_status("Micro_Eventos", t_stamp_m, f_email_m, new_status_m):
                            st.success(f"Dato de {f_email_m} actualizado a {new_status_m}")
                            fetch_all_data.clear()
                            st.rerun()
                  else:
                       st.warning("Ningún registro válido.")
else:
    st.info("Sin registros.")
