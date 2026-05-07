import { Outlet } from 'react-router-dom';

export default function PollaLayout() {
  return (
    <div className="polla-layout">
      <Outlet />
    </div>
  );
}
