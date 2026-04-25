import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import MisApuestas from './pages/MisApuestas';
import Resultados from './pages/Resultados';
import Admin from './pages/Admin';
import PollaMundialista from './pages/PollaMundialista';
import { useAuth } from './contexts/AuthContext';
import { Menu } from 'lucide-react';
import './index.css';

function App() {
  const authContext = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!authContext?.currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>🏆 La Polla Mundialista</h1>
          <p>Predice, compite y gana con tus amigos</p>
          <button className="google-btn" onClick={authContext?.loginWithGoogle}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '24px', height: '24px' }} />
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        {/* Header móvil visible solo en < 768px */}
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={28} />
          </button>
          <div className="mobile-logo">🏆 La Polla</div>
        </div>

        {/* Overlay oscuro para cerrar el menú */}
        {isSidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
        )}

        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/polla-mundialista" element={<PollaMundialista />} />
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
