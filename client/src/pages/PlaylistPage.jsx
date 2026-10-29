import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { playlistsApi } from '../api/index.js';
import { Cover, hueFromId } from '../components/Cover.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Icon } from '../components/Icon.jsx';
import { PlaylistForm } from '../components/PlaylistForm.jsx';
import { EmptyState, ErrorState, PageLoader } from '../components/States.jsx';
import { TrackList } from '../components/TrackList.jsx';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatTotalDuration, plural } from '../lib/format.js';
import { usePlayer } from '../player/PlayerContext.jsx';

export function PlaylistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const player = usePlayer();
  const { refreshPlaylists } = useLibrary();
  const { data, error, loading, reload, setData } = useAsync(() => playlistsApi.get(id), [id]);
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete' | null
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader label="Loading playlist" />;
  if (error) {
    return error.status === 404 ? (
      <EmptyState
        icon="lock"
        title="Playlist not found"
        action={
          <Link className="btn btn--secondary" to="/library">
            Back to library
          </Link>
        }
      >
        It may have been deleted, or it’s private.
      </EmptyState>
    ) : (
      <ErrorState error={error} onRetry={reload} />
    );
  }

  const playlist = data.playlist;
  const total = playlist.tracks.reduce((s, t) => s + t.durationSec, 0);
  const apply = (res) => {
    setData({ playlist: res.playlist });
    refreshPlaylists();
  };

  const mutate = async (fn, success) => {
    setBusy(true);
    try {
      apply(await fn());
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const move = (i, dir) => {
    const ids = playlist.tracks.map((t) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    mutate(() => playlistsApi.reorder(playlist.id, ids));
  };

  const remove = async () => {
    setBusy(true);
    try {
      await playlistsApi.remove(playlist.id);
      toast.success(`Deleted “${playlist.name}”`);
      refreshPlaylists();
      navigate('/library');
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <Cover hue={hueFromId(playlist.id)} size={160} rounded={16} className="hero__art" />
        <div className="hero__info">
          <p className="eyebrow">
            <Icon name={playlist.isPublic ? 'globe' : 'lock'} size={14} />{' '}
            {playlist.isPublic ? 'Public' : 'Private'} playlist
          </p>
          <h1>{playlist.name}</h1>
          {playlist.description && <p className="muted">{playlist.description}</p>}
          <p className="muted small">
            By {playlist.ownerName} · {plural(playlist.trackCount, 'track')}
            {total > 0 && ` · ${formatTotalDuration(total)}`}
          </p>
          <div className="hero__actions">
            <button
              className="btn btn--primary"
              disabled={!playlist.tracks.length}
              onClick={() =>
                player.playQueue(playlist.tracks) ||
                toast.info('Leave the listening room to play your own music.')
              }
            >
              <Icon name="play" size={18} /> Play
            </button>
            {playlist.isOwner && (
              <>
                <button className="btn btn--secondary" onClick={() => setDialog('edit')}>
                  <Icon name="edit" size={16} /> Edit
                </button>
                <button className="btn btn--danger-ghost" onClick={() => setDialog('delete')}>
                  <Icon name="trash" size={16} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {playlist.tracks.length === 0 ? (
        <EmptyState
          icon="music"
          title="This playlist is empty"
          action={
            <Link className="btn btn--secondary" to="/">
              Browse tracks
            </Link>
          }
        >
          {playlist.isOwner
            ? 'Use the ••• menu on any track to add it here.'
            : 'The owner hasn’t added any tracks yet.'}
        </EmptyState>
      ) : (
        <TrackList
          tracks={playlist.tracks}
          label={`Tracks in ${playlist.name}`}
          rowActions={
            playlist.isOwner
              ? (t, i) => (
                  <span className="row-tools">
                    <button
                      className="icon-btn icon-btn--sm"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${t.title} up`}
                    >
                      <Icon name="up" size={16} />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm"
                      disabled={busy || i === playlist.tracks.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${t.title} down`}
                    >
                      <Icon name="down" size={16} />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm"
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          () => playlistsApi.removeTrack(playlist.id, t.id),
                          `Removed “${t.title}”`,
                        )
                      }
                      aria-label={`Remove ${t.title} from playlist`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                )
              : undefined
          }
        />
      )}

      <Dialog open={dialog === 'edit'} onClose={() => setDialog(null)} title="Edit playlist">
        <PlaylistForm
          initial={{
            name: playlist.name,
            description: playlist.description,
            isPublic: playlist.isPublic,
          }}
          submitLabel="Save"
          onCancel={() => setDialog(null)}
          onSubmit={async (values) => {
            apply(await playlistsApi.update(playlist.id, values));
            toast.success('Playlist updated');
            setDialog(null);
          }}
        />
      </Dialog>
      <Dialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete playlist?">
        <p>“{playlist.name}” will be permanently deleted. The tracks stay in the catalogue.</p>
        <div className="form__actions">
          <button className="btn btn--ghost" onClick={() => setDialog(null)}>
            Cancel
          </button>
          <button className="btn btn--danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
