import streamlit as st
from components.auth import require_login
from components.ui_helpers import render_header, partido_card
from core.logic import validate_and_submit_micro

require_login()

st.set_page_config(page_title="Micro Eventos - Partidos Diarios", page_icon="⚡")
render_header()

st.header("⚡ Partidos Relámpago (Micro-Eventos)")
st.write("Acumulado instantáneo por partido. Si le atinas al marcador exacto, ¡te llevas el premio que esté acumulado para este partido!")

user_email = st.session_state.get("user_email")

# Ejemplo: Datos quemados de los partidos (estos podrían venir del sheets eventualmente)
partidos_activos = [
    {"id": "M1", "eq1": "Colombia", "eq2": "Brasil", "date": "16 Junio 2026", "acceso": 5000},
    {"id": "M2", "eq1": "Inglaterra", "eq2": "Croacia", "date": "18 Junio 2026", "acceso": 2000}
]

# Un selector para que el usuario elija sobre qué partido quiere apostar hoy
selected_partido_title = st.selectbox("Selecciona un partido:", [f"{p['eq1']} vs {p['eq2']}" for p in partidos_activos])

# Encontrar el partido actual basado en la selección
partido_actual = next(p for p in partidos_activos if f"{p['eq1']} vs {p['eq2']}" == selected_partido_title)

# Mostrar la tarjeta visual del partido
st.markdown("---")
partido_card(partido_actual["eq1"], partido_actual["eq2"], partido_actual["date"])
st.metric(label="Valor Entrada al Micro-Evento", value=f"${partido_actual['acceso']} COP")
st.markdown("---")

st.subheader("Ingresa tu predicción obligatoria")
with st.form("form_micro_evento"):
    col1, col2, col3 = st.columns([2, 1, 2])
    with col1:
        goles_eq1 = st.number_input(f"Goles {partido_actual['eq1']}", min_value=0, max_value=15, step=1)
    with col2:
        st.markdown("<h2 style='text-align: center;'>-</h2>", unsafe_allow_html=True)
    with col3:
        goles_eq2 = st.number_input(f"Goles {partido_actual['eq2']}", min_value=0, max_value=15, step=1)
        
    submit = st.form_submit_button("Enviar Marcador")
    
    if submit:
        marcador = f"{goles_eq1} - {goles_eq2}"
        success, err = validate_and_submit_micro(user_email, partido_actual['id'], marcador)
        if success:
              st.success(f"Marcador **{marcador}** registrado para el partido **{partido_actual['eq1']} vs {partido_actual['eq2']}**.")
              st.info("⚠️ Recuerda validar el pago a Nequi de este micro-evento para que sea efectivo en la contabilidad final.")
        else:
              st.error(f"Error: {err}")
