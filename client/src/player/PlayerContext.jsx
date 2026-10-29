import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { tracksApi } from '../api/index.js';
import { needsSeek } from '../lib/sync.js';

const PlayerContext = createContext(null);
const VOLUME_KEY = 'streamify:volume';
const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';

const streamSrc = (track) =>
  track.streamUrl.startsWith('/') ? `${API_ORIGIN}${track.streamUrl}` : track.streamUrl;

function readVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null
      ? v
      : 0.8;
  } catch {
    return 0.8;
  }
}

function mediaErrorMessage(mediaError) {
  switch (mediaError?.code) {
    case 2:
      return 'Network error while streaming. Check your connection and retry.';
    case 3:
      return 'This audio file could not be decoded.';
    case 4:
      return 'This track could not be loaded. You may need to sign in again.';
    default:
      return 'Playback failed. Please retry.';
  }
}

const isTypingTarget = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName));

/**
 * Owns the single <audio> element for the whole app.
 *
 * Two modes:
 * - local: the user's own queue (playQueue / next / prev ...).
 * - remote: a listening room drives playback through syncTo(), and user actions
 *   are forwarded to the room controller (which emits Socket.IO events).
 */
export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused | error
  const [error, setError] = useState(null);
  const [time, setTime] = useState({ current: 0, duration: 0, buffered: 0 });
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false); // browser autoplay policy blocked play()
  const [remote, setRemote] = useState(null);

  const loadedIdRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const reportedRef = useRef(null);
  const latest = useRef({});
  latest.current = { queue, index, remote };

  const current = index >= 0 ? (queue[index] ?? null) : null;

  const attemptPlay = useCallback(async () => {
    const a = audioRef.current;
    if (!a?.src) return;
    try {
      await a.play();
      setBlocked(false);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setBlocked(true);
        setStatus('paused');
      }
      // AbortError: a newer load() interrupted this play() call, which is expected.
    }
  }, []);

  const load = useCallback(
    (track, { autoplay = true, startAt = 0 } = {}) => {
      const a = audioRef.current;
      loadedIdRef.current = track.id;
      pendingSeekRef.current = startAt > 0 ? startAt : null;
      setError(null);
      setStatus('loading');
      setTime({ current: startAt, duration: track.durationSec ?? 0, buffered: 0 });
      a.src = streamSrc(track);
      if (autoplay) attemptPlay();
    },
    [attemptPlay],
  );

  const unload = useCallback(() => {
    const a = audioRef.current;
    a.pause();
    a.removeAttribute('src');
    a.load();
    loadedIdRef.current = null;
    setQueue([]);
    setIndex(-1);
    setStatus('idle');
    setError(null);
    setTime({ current: 0, duration: 0, buffered: 0 });
  }, []);

  // ---- Local queue actions --------------------------------------------------------
  const playQueue = useCallback(
    (tracks, startIndex = 0) => {
      if (latest.current.remote || !tracks.length) return false;
      setQueue(tracks);
      setIndex(startIndex);
      load(tracks[startIndex]);
      return true;
    },
    [load],
  );

  const jumpTo = useCallback(
    (i) => {
      const { queue: q, remote: r } = latest.current;
      if (r || !q[i]) return;
      setIndex(i);
      load(q[i]);
    },
    [load],
  );

  const next = useCallback(() => {
    const { queue: q, index: i, remote: r } = latest.current;
    if (r) return r.canControl && r.next();
    if (i < q.length - 1) jumpTo(i + 1);
  }, [jumpTo]);

  const prev = useCallback(() => {
    const { index: i, remote: r } = latest.current;
    if (r) return r.canControl && r.prev();
    const a = audioRef.current;
    if (a.currentTime > 3 || i <= 0) a.currentTime = 0;
    else jumpTo(i - 1);
  }, [jumpTo]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    const { remote: r } = latest.current;
    if (!a.src) return;
    if (r) {
      if (!r.canControl) return;
      return a.paused ? r.play(a.currentTime) : r.pause(a.currentTime);
    }
    if (a.paused) attemptPlay();
    else a.pause();
  }, [attemptPlay]);

  const seek = useCallback((sec) => {
    const a = audioRef.current;
    const { remote: r } = latest.current;
    if (!a.src) return;
    if (r) return r.canControl && r.seek(sec);
    a.currentTime = sec;
    setTime((t) => ({ ...t, current: sec }));
  }, []);

  const addToQueue = useCallback(
    (track) => {
      const { queue: q, remote: r } = latest.current;
      if (r) return false;
      if (!q.length) return playQueue([track]);
      setQueue([...q, track]);
      return true;
    },
    [playQueue],
  );

  const removeFromQueue = useCallback((i) => {
    const { index: cur } = latest.current;
    if (i === cur) return;
    setQueue((q) => q.filter((_, j) => j !== i));
    if (i < cur) setIndex(cur - 1);
  }, []);

  const clearQueue = useCallback(() => {
    const { queue: q, index: cur } = latest.current;
    if (cur < 0) return;
    setQueue([q[cur]]);
    setIndex(0);
  }, []);

  const retry = useCallback(() => {
    const { queue: q, index: i } = latest.current;
    const a = audioRef.current;
    if (q[i]) load(q[i], { startAt: a.currentTime || 0 });
  }, [load]);

  const setVolume = useCallback((v) => {
    const vol = Math.min(1, Math.max(0, v));
    audioRef.current.volume = vol;
    setVolumeState(vol);
    setMuted(vol === 0);
    try {
      localStorage.setItem(VOLUME_KEY, String(vol));
    } catch {
      /* storage may be unavailable (private mode); volume just isn't remembered */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    a.muted = !a.muted;
    setMuted(a.muted);
  }, []);

  // ---- Remote (listening room) API -------------------------------------------------
  /** Make the local <audio> match the room's state. Called on every room update. */
  const syncTo = useCallback(
    ({ track, positionSec, isPlaying }) => {
      const a = audioRef.current;
      if (!track) {
        if (loadedIdRef.current) unload();
        return;
      }
      if (loadedIdRef.current !== track.id) {
        setQueue([track]);
        setIndex(0);
        load(track, { autoplay: isPlaying, startAt: positionSec });
        return;
      }
      if (a.readyState >= 1) {
        if (needsSeek(a.currentTime, positionSec)) a.currentTime = positionSec;
      } else {
        pendingSeekRef.current = positionSec;
      }
      if (isPlaying && a.paused) attemptPlay();
      if (!isPlaying && !a.paused) a.pause();
    },
    [attemptPlay, load, unload],
  );

  const attachRemote = useCallback(
    (controller) => {
      if (!latest.current.remote) unload(); // entering a room replaces the local queue
      latest.current.remote = controller; // visible to handlers before the re-render
      setRemote(controller);
    },
    [unload],
  );

  const detachRemote = useCallback(() => {
    latest.current.remote = null;
    setRemote(null);
    unload();
  }, [unload]);

  const getPosition = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  // ---- <audio> element events ------------------------------------------------------
  const handlers = {
    onWaiting: () => setStatus('loading'),
    onPlaying: () => {
      setStatus('playing');
      const id = loadedIdRef.current;
      if (id && reportedRef.current !== id) {
        reportedRef.current = id;
        tracksApi.recordPlay(id).catch(() => {});
      }
    },
    onPause: () => setStatus((s) => (s === 'error' ? s : 'paused')),
    onLoadedMetadata: (e) => {
      const a = e.currentTarget;
      if (pendingSeekRef.current !== null) {
        a.currentTime = Math.min(pendingSeekRef.current, a.duration || Infinity);
        pendingSeekRef.current = null;
      }
      setTime((t) => ({ ...t, duration: a.duration || t.duration }));
      if (a.paused) setStatus('paused');
    },
    onTimeUpdate: (e) => {
      const a = e.currentTarget;
      setTime((t) => ({ ...t, current: a.currentTime }));
    },
    onProgress: (e) => {
      const a = e.currentTarget;
      if (a.buffered.length) {
        const end = a.buffered.end(a.buffered.length - 1);
        setTime((t) => ({ ...t, buffered: end }));
      }
    },
    onEnded: () => {
      const { remote: r, queue: q, index: i } = latest.current;
      if (r) return r.onEnded();
      if (i < q.length - 1) jumpTo(i + 1);
      else setStatus('paused');
    },
    onError: (e) => {
      const a = e.currentTarget;
      if (!a.getAttribute('src')) return; // unload() clears src; not an error
      setStatus('error');
      setError(mediaErrorMessage(a.error));
    },
  };

  useEffect(() => {
    audioRef.current.volume = volume;
    // Only on mount: later changes go through setVolume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts (ignored while typing or when a control has focus).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const a = audioRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight' && e.shiftKey) next();
      else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
      else if (e.key === 'ArrowRight') seek(Math.min(a.duration || 0, a.currentTime + 5));
      else if (e.key === 'ArrowLeft') seek(Math.max(0, a.currentTime - 5));
      else if (e.key.toLowerCase() === 'm') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, next, prev, seek, toggleMute]);

  // OS media controls (lock screen, hardware keys) via the Media Session API.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
      });
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
    } catch {
      /* unsupported action in this browser */
    }
  }, [current, toggle, next, prev]);

  const value = useMemo(
    () => ({
      queue,
      index,
      current,
      status,
      error,
      time,
      volume,
      muted,
      blocked,
      remote,
      playQueue,
      jumpTo,
      next,
      prev,
      toggle,
      seek,
      addToQueue,
      removeFromQueue,
      clearQueue,
      retry,
      setVolume,
      toggleMute,
      unlock: attemptPlay,
      syncTo,
      attachRemote,
      detachRemote,
      getPosition,
    }),
    [
      queue,
      index,
      current,
      status,
      error,
      time,
      volume,
      muted,
      blocked,
      remote,
      playQueue,
      jumpTo,
      next,
      prev,
      toggle,
      seek,
      addToQueue,
      removeFromQueue,
      clearQueue,
      retry,
      setVolume,
      toggleMute,
      attemptPlay,
      syncTo,
      attachRemote,
      detachRemote,
      getPosition,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" {...handlers} />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
