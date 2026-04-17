import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import MisApuestas from './pages/MisApuestas';
import Resultados from './pages/Resultados';
import Admin from './pages/Admin';
import { useAuth } from './contexts/AuthContext';
import './index.css';

function App() {
  const authContext = useAuth();

  if (!authContext?.currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>🏆 La Polla Mundialista</h1>
          <p>Predice, compite y gana con tus amigos</p>
          <button className="google-btn" onClick={authContext?.loginWithGoogle}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" />
            Iniciar Sesión con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/resultados" element={<Resultados />} />
            <Route path="/mis-apuestas" element={<MisApuestas />} />
            {authContext.isAdmin && (
              <Route path="/admin" element={<Admin />} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
