import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { playlistsApi, tracksApi } from '../api/index.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

// The signed-in user's liked track ids and playlist list, shared by every track row
// (heart buttons, "add to playlist" menus) so they don't each fetch on their own.
const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [playlists, setPlaylists] = useState([]);

  const refreshPlaylists = useCallback(async () => {
    if (!user) return;
    try {
      const { items } = await playlistsApi.mine({ limit: 50 });
      setPlaylists(items);
    } catch {
      /* non-critical: menus show an empty list */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLikedIds(new Set());
      setPlaylists([]);
      return;
    }
    tracksApi
      .likedIds()
      .then(({ ids }) => setLikedIds(new Set(ids)))
      .catch(() => {});
    refreshPlaylists();
  }, [user, refreshPlaylists]);

  // Optimistic update with rollback on failure.
  const toggleLike = useCallback(
    async (track) => {
      const wasLiked = likedIds.has(track.id);
      const apply = (liked) =>
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (liked) next.add(track.id);
          else next.delete(track.id);
          return next;
        });
      apply(!wasLiked);
      try {
        await (wasLiked ? tracksApi.unlike(track.id) : tracksApi.like(track.id));
      } catch (err) {
        apply(wasLiked);
        toast.error(err.message);
      }
    },
    [likedIds, toast],
  );

  const addToPlaylist = useCallback(
    async (playlist, track) => {
      try {
        const { added } = await playlistsApi.addTrack(playlist.id, track.id);
        toast[added ? 'success' : 'info'](
          added ? `Added to ${playlist.name}` : `Already in ${playlist.name}`,
        );
        refreshPlaylists();
      } catch (err) {
        toast.error(err.message);
      }
    },
    [toast, refreshPlaylists],
  );

  const value = useMemo(
    () => ({ likedIds, toggleLike, playlists, refreshPlaylists, addToPlaylist }),
    [likedIds, toggleLike, playlists, refreshPlaylists, addToPlaylist],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return ctx;
}
