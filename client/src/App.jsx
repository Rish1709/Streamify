import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { BrowsePage } from './pages/BrowsePage.jsx';
import { LibraryPage } from './pages/LibraryPage.jsx';
import { LikedPage } from './pages/LikedPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { PlaylistPage } from './pages/PlaylistPage.jsx';
import { RoomPage } from './pages/RoomPage.jsx';
import { RoomsPage } from './pages/RoomsPage.jsx';

const guard = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<AppShell />}>
        <Route index element={<BrowsePage />} />
        <Route path="library" element={guard(<LibraryPage />)} />
        <Route path="library/liked" element={guard(<LikedPage />)} />
        <Route path="playlists/:id" element={guard(<PlaylistPage />)} />
        <Route path="rooms" element={guard(<RoomsPage />)} />
        <Route path="rooms/:code" element={guard(<RoomPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
