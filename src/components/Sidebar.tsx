import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, ListChecks, LogOut, CalendarDays, Settings, Globe, Moon, Sun, Coins, Swords, Crown, Target, Star, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const authCounter = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tokens, setTokens] = useState(0);
  const [pollaOpen, setPollaOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!authCounter?.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', authCounter.currentUser.uid), (snap) => {
      if (snap.exists()) {
        setTokens(snap.data().tokens || 0);
      }
    });
    return () => unsub();
  }, [authCounter?.currentUser]);

  // AI-NOTE: Auto-expandir menu Polla cuando estemos en una subpagina
  useEffect(() => {
    if (location.pathname.startsWith('/polla-mundialista')) {
      setPollaOpen(true);
    }
  }, [location.pathname]);

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        🏆 La Polla
      </div>

      <div className="nav-links">
        <NavLink
          to="/"
          end
          onClick={handleLinkClick}
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <Trophy size={20} /> Principal
        </NavLink>

        {/* Polla mundialista — menú colapsable */}
        <button
          className={`nav-item nav-collapse-btn ${pollaOpen ? 'open' : ''}`}
          onClick={() => setPollaOpen(!pollaOpen)}
        >
          <Globe size={20} /> Polla mundialista
          <ChevronDown size={16} className={`collapse-arrow ${pollaOpen ? 'rotated' : ''}`} />
        </button>

        {pollaOpen && (
          <div className="nav-submenu">
            <NavLink
              to="/polla-mundialista/mi-polla"
              onClick={handleLinkClick}
              className={({ isActive }) => isActive ? 'nav-item sub active' : 'nav-item sub'}
            >
              <Trophy size={18} /> Mi Polla
            </NavLink>
            <NavLink
              to="/polla-mundialista/mis-16"
              onClick={handleLinkClick}
              className={({ isActive }) => isActive ? 'nav-item sub active' : 'nav-item sub'}
            >
              <Swords size={18} /> Mis 16
            </NavLink>
            <NavLink
              to="/polla-mundialista/mi-campeon"
              onClick={handleLinkClick}
              className={({ isActive }) => isActive ? 'nav-item sub active' : 'nav-item sub'}
            >
              <Crown size={18} /> Mi Campeón
            </NavLink>
            <NavLink
              to="/polla-mundialista/mi-goleador"
              onClick={handleLinkClick}
              className={({ isActive }) => isActive ? 'nav-item sub active' : 'nav-item sub'}
            >
              <Target size={18} /> Mi Goleador
            </NavLink>
          </div>
        )}

        <NavLink
          to="/champions"
          onClick={handleLinkClick}
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <Star size={20} /> Champions
        </NavLink>

        <NavLink
          to="/resultados"
          onClick={handleLinkClick}
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <CalendarDays size={20} /> Resultados
        </NavLink>

        <NavLink
          to="/mis-apuestas"
          onClick={handleLinkClick}
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <ListChecks size={20} /> Mis apuestas
        </NavLink>

        {authCounter?.isAdmin && (
          <NavLink
            to="/admin"
            onClick={handleLinkClick}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <Settings size={20} /> Admin
          </NavLink>
        )}
      </div>

      <div className="user-profile">
        <button 
          onClick={toggleTheme} 
          className="nav-item" 
          style={{ width: '100%', marginBottom: '0.5rem', justifyContent: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          {theme === 'dark' ? <><Sun size={18} /> Tema Claro</> : <><Moon size={18} /> Tema Oscuro</>}
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          background: 'var(--color-warning-bg)',
          border: '1px solid var(--primary)',
          borderRadius: '20px',
          padding: '6px 16px',
          marginBottom: '0.75rem'
        }}>
          <Coins size={16} />
          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{tokens} Tokens</span>
        </div>

        <div className="user-email">👤 {authCounter?.currentUser?.email}</div>
        <button onClick={authCounter?.logout} className="logout-btn">
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}
