import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, ListChecks, LogOut, Star } from 'lucide-react';

export default function Sidebar() {
  const authCounter = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        🏆 La Polla
      </div>

      <div className="nav-links">
        <NavLink 
          to="/" 
          end
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <Trophy size={20} /> Principal
        </NavLink>

        <NavLink 
          to="/resultados" 
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <Star size={20} /> Podio Ganadores
        </NavLink>
        

        <NavLink 
          to="/mis-apuestas" 
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          <ListChecks size={20} /> Mis Apuestas
        </NavLink>

        {authCounter?.isAdmin && (
          <NavLink 
            to="/admin" 
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <Settings size={20} /> Admin
          </NavLink>
        )}
      </div>

      <div className="user-profile">
        <div className="user-email">👤 {authCounter?.currentUser?.email}</div>
        <button onClick={authCounter?.logout} className="logout-btn">
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}
