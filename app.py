import streamlit as st
from components.auth import init_auth
from components.ui_helpers import render_header

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
    else:
        st.info("Por favor inicia sesión con tu cuenta de Google usando el botón superior para ingresar tus marcadores.")

if __name__ == "__main__":
    main()
