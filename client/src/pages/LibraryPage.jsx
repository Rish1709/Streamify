import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { playlistsApi } from '../api/index.js';
import { Cover, hueFromId } from '../components/Cover.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Icon } from '../components/Icon.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { PlaylistForm } from '../components/PlaylistForm.jsx';
import { EmptyState, ErrorState, PageLoader } from '../components/States.jsx';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { plural } from '../lib/format.js';

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const toast = useToast();
  const { likedIds, refreshPlaylists } = useLibrary();
  const creating = params.get('new') === '1';
  const playlists = useAsync(() => playlistsApi.mine({ page, limit: 24 }), [page]);

  const setCreating = (open) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const create = async (values) => {
    const { playlist } = await playlistsApi.create(values);
    toast.success(`Created “${playlist.name}”`);
    refreshPlaylists();
    navigate(`/playlists/${playlist.id}`);
  };

  return (
    <div className="page">
      <header className="page__header page__header--row">
        <div>
          <h1>Your library</h1>
          <p className="muted">Playlists you’ve made and songs you’ve liked.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} /> New playlist
        </button>
      </header>

      <div className="card-grid">
        <Link to="/library/liked" className="card card--liked">
          <div className="card__art card__art--liked">
            <Icon name="heartFilled" size={40} />
          </div>
          <h2 className="card__title">Liked Songs</h2>
          <p className="muted">{plural(likedIds.size, 'song')}</p>
        </Link>
        {playlists.data?.items.map((p) => (
          <Link key={p.id} to={`/playlists/${p.id}`} className="card">
            <Cover hue={hueFromId(p.id)} size="100%" className="card__art" rounded={12} />
            <h2 className="card__title">{p.name}</h2>
            <p className="muted">
              {p.isPublic ? 'Public' : 'Private'} · {plural(p.trackCount, 'track')}
            </p>
          </Link>
        ))}
      </div>

      {playlists.loading && !playlists.data && <PageLoader label="Loading playlists" />}
      {playlists.error && <ErrorState error={playlists.error} onRetry={playlists.reload} />}
      {playlists.data?.items.length === 0 && (
        <EmptyState
          icon="library"
          title="No playlists yet"
          action={
            <button className="btn btn--secondary" onClick={() => setCreating(true)}>
              Create your first playlist
            </button>
          }
        >
          Collect tracks for every mood, then play them in order or shuffle them into a room.
        </EmptyState>
      )}
      <Pagination
        pagination={playlists.data?.pagination}
        onChange={setPage}
        label="Playlist pages"
      />

      <Dialog open={creating} onClose={() => setCreating(false)} title="New playlist">
        <PlaylistForm submitLabel="Create" onSubmit={create} onCancel={() => setCreating(false)} />
      </Dialog>
    </div>
  );
}
