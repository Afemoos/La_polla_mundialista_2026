import streamlit as st
from components.auth import init_auth
from components.ui_helpers import render_header
from core.football_api import fetch_colombia_next_match, fetch_fixture_predictions, fetch_fixture_lineups
from datetime import datetime
import dateutil.parser

def main():
    st.set_page_config(
        page_title="Polla Mundialista 2026",
        page_icon="🏆",
        layout="centered",
        initial_sidebar_state="expanded"
    )

    render_header()
    
    # Inicializar el componente de autenticación
    init_auth()

    # Mensajes dependiendo del estado
    if st.session_state.get("user_email"):
        st.success(f"Sesión iniciada exitosamente: {st.session_state['user_email']}")
        st.markdown("### ¡Bienvenido a La Polla Mundialista! ⚽")
        st.write("⬅️ Selecciona una opción en la barra lateral izquierda para enviar tus predicciones.")
        
        # --- WIDGET EN VIVO DE COLOMBIA ---
        st.markdown("---")
        st.subheader("🇨🇴 Radar Tricolor en Vivo")
        with st.spinner("Conectando con satélites deportivos..."):
            match = fetch_colombia_next_match()
            
        if match:
             fix = match["fixture"]
             teams = match["teams"]
             
             # Formato fecha
             fecha_dt = dateutil.parser.isoparse(fix["date"])
             fecha_str = fecha_dt.strftime("%d de %B %Y - %H:%M")
             
             colA, colB, colC = st.columns([1, 2, 1])
             with colA:
                  st.image(teams["home"]["logo"], width=80)
                  st.write(f"**{teams['home']['name']}**")
             with colB:
                  st.markdown(f"<h3 style='text-align: center;'>VS</h3>", unsafe_allow_html=True)
                  st.markdown(f"<p style='text-align: center; color: gray;'>{fecha_str}</p>", unsafe_allow_html=True)
                  st.markdown(f"<p style='text-align: center; color: gray;'>{fix['venue']['name']} ({fix['venue']['city']})</p>", unsafe_allow_html=True)
             with colC:
                  st.image(teams["away"]["logo"], width=80)
                  st.write(f"**{teams['away']['name']}**")
                  
             # Predicciones
             preds = fetch_fixture_predictions(fix["id"])
             if preds:
                  win_probs = preds["predictions"]["percent"]
                  st.write("**Probabilidades de Victoria (Inteligencia Artificial):**")
                  st.progress(int(win_probs["home"].replace('%', '')), text=f"🏠 Local ({win_probs['home']})")
                  st.progress(int(win_probs["away"].replace('%', '')), text=f"✈️ Visitante ({win_probs['away']})")
                  st.progress(int(win_probs["draw"].replace('%', '')), text=f"🤝 Empate ({win_probs['draw']})")
             
             # Plantillas
             st.write("**Plantillas confirmadas:**")
             lineups = fetch_fixture_lineups(fix["id"])
             if lineups:
                  # Si hay plantillas
                  for l in lineups:
                       with st.expander(f"👕 Formación {l['team']['name']} ({l['formation']})"):
                            st.write("Entrenador: " + l['coach']['name'])
                            st.write(", ".join([p['player']['name'] for p in l['startXI']]))
             else:
                  st.info("Plantillas aún no disponibles (se activan ~1 hora antes del partido).")
                  
        else:
             st.info("No hay información de próximos partidos disponible en este momento.")

    else:
        st.info("Por favor inicia sesión con tu cuenta de Google usando el panel lateral.")

if __name__ == "__main__":
    main()
