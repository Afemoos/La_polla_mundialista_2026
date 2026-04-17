import streamlit as st
from components.auth import require_login
from components.ui_helpers import render_header
from core.logic import validate_and_submit_principal

# 1. Verificar Autenticación. Si no hay, detiene la ejecución.
require_login()

# 2. Renderizar Interfaz
st.set_page_config(page_title="Principal - Polla Mundialista", page_icon="🏆")
render_header()

st.header("🎟️ Registro Principal")
st.write("Acá ingresas tu participación principal para la ronda de Colombia y otros eventos fijos del mundial.")

user_email = st.session_state.get("user_email")
if user_email:
    st.info(f"Registrando bajo la cuenta: **{user_email}**")

with st.form("registro_principal_form"):
    nombre = st.text_input("Ingresa tu Nombre / Apodo (Para mostrar en la tabla):")
    # Ejemplo de predicción general
    campeon = st.selectbox("¿Quién será el campeón del mundial?", ["Colombia", "Argentina", "Brasil", "Francia", "España", "Otro"])
    
    col1, col2 = st.columns(2)
    with col1:
         partidos_ganados_col_fase_grupos = st.number_input("Partidos ganados por Colombia (Fase de grupos)", min_value=0, max_value=3, step=1)
    
    # Campo unificado para el marcador "predicho" como string
    marcador_final_str = f"Campeón: {campeon} | PG (Col): {partidos_ganados_col_fase_grupos}"
    
    submit_btn = st.form_submit_button("Efectuar Registro (20.000 COP)")
    
    if submit_btn:
        if not nombre.strip():
            st.error("Por favor, ingresa tu nombre o apodo antes de enviar.")
        else:
            success, err_msg = validate_and_submit_principal(user_email, nombre, marcador_final_str)
            if success:
                 st.success("¡Predicción enviada con éxito! 🎉")
                 st.info("⚠️ ESTADO DE PAGO: PENDIENTE. Por favor realiza tu transferencia por Nequi para activar esta predicción.")
                 st.balloons()
            else:
                 st.error(f"Error: {err_msg}")
