import { useNavigate } from 'react-router';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useRequireAuth } from '../hooks/useRequireAuth.js';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../player/PlayerContext.jsx';
import { Cover } from './Cover.jsx';
import { Icon } from './Icon.jsx';
import { Menu } from './Menu.jsx';

export function LikeButton({ track, size = 18 }) {
  const { likedIds, toggleLike } = useLibrary();
  const guard = useRequireAuth();
  const liked = likedIds.has(track.id);
  return (
    <button
      className={`icon-btn like-btn ${liked ? 'is-active' : ''}`}
      aria-pressed={liked}
      aria-label={
        liked ? `Remove ${track.title} from Liked Songs` : `Save ${track.title} to Liked Songs`
      }
      onClick={guard(() => toggleLike(track), 'Log in to like songs')}
    >
      <Icon name={liked ? 'heartFilled' : 'heart'} size={size} />
    </button>
  );
}

function TrackMenu({ track, extraItems = [] }) {
  const { playlists, addToPlaylist } = useLibrary();
  const player = usePlayer();
  const toast = useToast();
  const navigate = useNavigate();
  const guard = useRequireAuth();
  const items = [
    {
      label: 'Add to queue',
      disabled: Boolean(player.remote),
      onSelect: guard(() => {
        if (player.addToQueue(track)) toast.success(`Queued “${track.title}”`);
      }, 'Log in to play music'),
    },
    { divider: true },
    { heading: 'Add to playlist' },
    ...(playlists.length
      ? playlists.map((p) => ({ label: p.name, onSelect: guard(() => addToPlaylist(p, track)) }))
      : [{ label: 'Create a playlist…', onSelect: guard(() => navigate('/library?new=1')) }]),
    ...extraItems,
  ];
  return (
    <Menu
      buttonLabel={`More options for ${track.title}`}
      buttonContent={<Icon name="more" />}
      items={items}
    />
  );
}

/**
 * Track table. `onPlay(index)` defaults to playing the whole list from that index.
 * `rowActions(track, index)` renders extra controls (e.g. remove from playlist).
 */
export function TrackList({
  tracks,
  onPlay,
  rowActions,
  menuItems,
  startIndex = 0,
  label = 'Tracks',
}) {
  const player = usePlayer();
  const guard = useRequireAuth();
  const toast = useToast();

  const play = guard((i) => {
    if (onPlay) return onPlay(i);
    if (!player.playQueue(tracks, i))
      toast.info('Leave the listening room to play your own music.');
  }, 'Log in to play music');

  return (
    <ol className="track-list" aria-label={label}>
      {tracks.map((t, i) => {
        const isCurrent = player.current?.id === t.id;
        const isPlaying = isCurrent && player.status === 'playing';
        return (
          <li key={`${t.id}-${i}`} className={`track-row ${isCurrent ? 'is-current' : ''}`}>
            <span className="track-row__index">
              <span className="track-row__num" aria-hidden="true">
                {isPlaying ? <span className="eq" /> : startIndex + i + 1}
              </span>
              <button
                className="icon-btn track-row__play"
                aria-label={isPlaying ? `Pause ${t.title}` : `Play ${t.title} by ${t.artist}`}
                onClick={() => (isCurrent && !player.remote ? player.toggle() : play(i))}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
              </button>
            </span>
            <Cover hue={t.coverHue} size={44} />
            <span className="track-row__meta">
              <span className="track-row__title">{t.title}</span>
              <span className="track-row__artist">
                {t.artist}
                <span className="track-row__genre"> · {t.genre}</span>
              </span>
            </span>
            <span className="track-row__album">{t.album}</span>
            <span className="track-row__actions">
              <LikeButton track={t} />
              {rowActions?.(t, i)}
              <TrackMenu track={t} extraItems={menuItems?.(t, i)} />
            </span>
            <span className="track-row__duration">{formatTime(t.durationSec)}</span>
          </li>
        );
      })}
    </ol>
  );
}
