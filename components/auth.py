import streamlit as st
# from streamlit_google_auth import Authenticate
import os

def init_auth():
    """
    Inicializa el módulo de autenticación de Google y administra la sesión del usuario.
    """
    # Para desarrollo, asumiremos que usamos variables de entorno
    # o un .streamlit/secrets.toml en producción
    
    # Si las credenciales no están configuradas aún, mostrar un entorno provisional intermedio o aviso
    client_id = os.getenv("GOOGLE_CLIENT_ID") or ("st.secrets" in dir(st) and "GOOGLE_CLIENT_ID" in st.secrets)
    
    if "user_email" not in st.session_state:
        st.session_state["user_email"] = None
        st.session_state["user_name"] = None

    if not client_id:
        st.warning("⚠️ Configuración de Google OAuth incompleta. Se ha habilitado un login de prueba temporal.")
        # TODO: Quitar entrada de prueba temporal cuando las credenciales estén listas
        correo_prueba = st.text_input("Ingresa tu correo temporal para probar:")
        if st.button("Simular Login"):
            st.session_state["user_email"] = correo_prueba
            st.rerun()
        return

    # TODO: Implementar integración formal cuando se configuren credenciales
    # authenticator = Authenticate(
    #     secret_credentials_path="credenciales_gcp.json",
    #     cookie_name="polla_cookie",
    #     cookie_key="ruta_secreta",
    #     redirect_uri=os.getenv("REDIRECT_URI", "http://localhost:8501")
    # )
    #
    # authenticator.check_authentification()
    # authenticator.login()
    # 
    # if st.session_state['connected']:
    #     st.session_state["user_email"] = st.session_state['user_info'].get('email')
    #     st.session_state["user_name"] = st.session_state['user_info'].get('name')


def require_login():
    """Valida que haya una sesión para cargar la página. Usa esto en pages/*.py"""
    if not st.session_state.get("user_email"):
        st.error("🔒 Debes iniciar sesión en la página principal (Home) para acceder a esta sección.")
        st.stop()
