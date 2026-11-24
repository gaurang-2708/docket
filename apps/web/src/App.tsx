import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './api';
import Shell from './components/Shell';
import SignIn from './pages/SignIn';
import Upload from './pages/Upload';
import DocumentPage from './pages/DocumentPage';
import Documents from './pages/Documents';
import Health from './pages/Health';

export default function App() {
  const s = useSession();
  const loc = useLocation();
  if (!s) return loc.pathname === '/sign-in' ? <SignIn /> : <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return (
    <Routes>
      <Route path="/sign-in" element={<Navigate to="/upload" replace />} />
      <Route element={<Shell />}>
        <Route path="/upload" element={<Upload />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/:id" element={<DocumentPage />} />
        <Route path="/admin/health" element={s.user.role === 'ADMIN' ? <Health /> : <Navigate to="/upload" replace />} />
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Route>
    </Routes>
  );
}
