import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, ListChecks, LogOut, CalendarDays, Settings, Globe, Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const authCounter = useAuth();
  const { theme, toggleTheme } = useTheme();

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

        <NavLink
          to="/polla-mundialista"
          onClick={handleLinkClick}
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <Globe size={20} /> Polla mundialista
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
          style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          {theme === 'dark' ? <><Sun size={18} /> Tema Claro</> : <><Moon size={18} /> Tema Oscuro</>}
        </button>
        <div className="user-email">👤 {authCounter?.currentUser?.email}</div>
        <button onClick={authCounter?.logout} className="logout-btn">
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}
