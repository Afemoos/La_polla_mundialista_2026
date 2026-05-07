import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import MisApuestas from './pages/MisApuestas';
import Resultados from './pages/Resultados';
import Admin from './pages/Admin';
import PollaMundialista from './pages/PollaMundialista';
import PollaLayout from './pages/PollaLayout';
import Mis16 from './pages/Mis16';
import MiCampeon from './pages/MiCampeon';
import MiGoleador from './pages/MiGoleador';
import Champions from './pages/Champions';
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
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={28} />
          </button>
          <div className="mobile-logo">🏆 La Polla</div>
        </div>

        {isSidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
        )}

        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/polla-mundialista" element={<PollaLayout />}>
              <Route index element={<Navigate to="mi-polla" replace />} />
              <Route path="mi-polla" element={<PollaMundialista />} />
              <Route path="mis-16" element={<Mis16 />} />
              <Route path="mi-campeon" element={<MiCampeon />} />
              <Route path="mi-goleador" element={<MiGoleador />} />
            </Route>
            <Route path="/champions" element={<Champions />} />
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
