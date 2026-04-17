import streamlit as st

def render_header():
    """Renderiza la cabecera principal y estilos globales atractivos"""
    st.markdown(
        """
        <style>
        .main-title {
            font-size: 3rem;
            color: #1E3A8A;
            text-align: center;
            font-weight: 800;
            margin-bottom: 0px;
        }
        .main-subtitle {
            font-size: 1.2rem;
            color: #64748B;
            text-align: center;
            margin-bottom: 2rem;
        }
        </style>
        <h1 class="main-title">🏆 La Polla Mundialista</h1>
        <p class="main-subtitle">Predice, compite y gana con tus amigos</p>
        """,
        unsafe_allow_html=True
    )

def partido_card(equipo1, equipo2, date):
    """Genera una tarjeta atractiva para visualizar un partido"""
    st.markdown(f"**⚽ {equipo1} vs {equipo2}**")
    st.caption(f"🗓️ {date}")
