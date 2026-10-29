import { useState } from 'react';
import { Link } from 'react-router';
import { tracksApi } from '../api/index.js';
import { Icon } from '../components/Icon.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { EmptyState, ErrorState, TrackListSkeleton } from '../components/States.jsx';
import { TrackList } from '../components/TrackList.jsx';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { plural } from '../lib/format.js';
import { usePlayer } from '../player/PlayerContext.jsx';

const PAGE_SIZE = 20;

export function LikedPage() {
  const [page, setPage] = useState(1);
  const { likedIds } = useLibrary();
  const player = usePlayer();
  const liked = useAsync(() => tracksApi.liked({ page, limit: PAGE_SIZE }), [page]);
  // Hide tracks un-liked on this page without refetching.
  const items = liked.data?.items.filter((t) => likedIds.has(t.id)) ?? [];

  return (
    <div className="page">
      <header className="hero">
        <div
          className="hero__art card__art--liked"
          style={{ width: 160, height: 160, borderRadius: 16 }}
        >
          <Icon name="heartFilled" size={56} />
        </div>
        <div className="hero__info">
          <p className="eyebrow">Collection</p>
          <h1>Liked Songs</h1>
          <p className="muted small">{plural(likedIds.size, 'song')}</p>
          <div className="hero__actions">
            <button
              className="btn btn--primary"
              disabled={!items.length}
              onClick={() => player.playQueue(items)}
            >
              <Icon name="play" size={18} /> Play
            </button>
          </div>
        </div>
      </header>
      {liked.error ? (
        <ErrorState error={liked.error} onRetry={liked.reload} />
      ) : liked.loading && !liked.data ? (
        <TrackListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon="heart"
          title="Songs you like will appear here"
          action={
            <Link className="btn btn--secondary" to="/">
              Find something to love
            </Link>
          }
        >
          Tap the heart on any track to save it.
        </EmptyState>
      ) : (
        <>
          <TrackList tracks={items} startIndex={(page - 1) * PAGE_SIZE} label="Liked songs" />
          <Pagination pagination={liked.data.pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}
