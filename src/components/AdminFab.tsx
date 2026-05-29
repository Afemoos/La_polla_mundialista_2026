import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AdminFabProps {
  onClick: () => void;
  disabled?: boolean;
}

export default function AdminFab({ onClick, disabled }: AdminFabProps) {
  const [hasNewCards, setHasNewCards] = useState(false);
  const { isAdmin } = useAuth() || {};

  useEffect(() => {
    if (!isAdmin) return;
    const lastVisit = localStorage.getItem('lastVisit');
    const now = Date.now();
    if (!lastVisit) {
      localStorage.setItem('lastVisit', now.toString());
      return;
    }
    setHasNewCards(true);
    localStorage.setItem('lastVisit', now.toString());
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <button
      className="admin-fab"
      onClick={onClick}
      disabled={disabled}
      aria-label="Crear nueva tarjeta"
    >
      <Plus size={24} />
      {hasNewCards && <span className="fab-badge" />}
    </button>
  );
}
