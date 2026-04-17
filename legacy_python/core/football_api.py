import requests
import streamlit as st
import os

def get_api_key():
    """Obtiene la llave desde variables de entorno, o local, o quemada por defecto temporalmente."""
    api_key_env = os.getenv("API_SPORTS_KEY")
    if api_key_env: return api_key_env
    
    try:
         if "API_SPORTS_KEY" in st.secrets:
              return st.secrets["API_SPORTS_KEY"]
    except:
         pass
         
    return "2e50ba06b5048e14a2393f917ea9299e"

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_colombia_next_match():
    """Obtiene el próximo partido de la selección Colombia (Team ID: 8)"""
    url = "https://v3.football.api-sports.io/fixtures?team=8&next=1"
    headers = {'x-apisports-key': get_api_key()}
    try:
        response = requests.get(url, headers=headers)
        data = response.json()
        if data.get("response") and len(data["response"]) > 0:
            return data["response"][0]
        return None
    except Exception as e:
        return None

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_fixture_predictions(fixture_id):
    """Obtiene datos pre-partido probabilísticos para un ID de encuentro."""
    url = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
    headers = {'x-apisports-key': get_api_key()}
    try:
        response = requests.get(url, headers=headers)
        data = response.json()
        if data.get("response") and len(data["response"]) > 0:
            return data["response"][0]
        return None
    except Exception:
        return None

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_fixture_lineups(fixture_id):
    """Obtiene las formaciones si ya están disponibles (típicamente 1hr antes del partido)."""
    url = f"https://v3.football.api-sports.io/fixtures/lineups?fixture={fixture_id}"
    headers = {'x-apisports-key': get_api_key()}
    try:
        response = requests.get(url, headers=headers)
        data = response.json()
        if data.get("response") and len(data["response"]) > 0:
            return data["response"]
        return None
    except Exception:
        return None
