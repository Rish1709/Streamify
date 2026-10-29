import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { roomsApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { estimateClockOffset, expectedPosition } from '../lib/sync.js';
import { usePlayer } from '../player/PlayerContext.jsx';

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined; // same origin by default
const DRIFT_CHECK_MS = 4000;
const ACK_TIMEOUT_MS = 5000;
const MAX_MESSAGES = 300;

/**
 * Connects to a listening room over Socket.IO and keeps the shared player in sync.
 *
 * Sync model: the server stores { positionSec, updatedAt, isPlaying } for the room.
 * Each client estimates its clock offset to the server, extrapolates the live position,
 * and seeks only when local playback drifts beyond a tolerance. On reconnect the
 * client simply re-joins and receives a full fresh state.
 */
export function useRoom(code) {
  const player = usePlayer();
  const { user } = useAuth();
  const toast = useToast();
  const [conn, setConn] = useState('connecting'); // connecting | joined | reconnecting | notfound | error | closed
  const [error, setError] = useState(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [rttMs, setRttMs] = useState(null);

  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const offsetRef = useRef(0);
  const playerRef = useRef(player);
  playerRef.current = player;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const resync = useCallback(() => {
    const state = roomRef.current;
    if (!state) return;
    const pb = state.playback;
    playerRef.current.syncTo({
      track: pb.track,
      isPlaying: pb.isPlaying,
      positionSec: expectedPosition(pb, {
        clockOffsetMs: offsetRef.current,
        durationSec: pb.track?.durationSec,
      }),
    });
  }, []);

  const applyState = useCallback(
    (state) => {
      roomRef.current = state;
      setRoom(state);
      resync();
    },
    [resync],
  );

  /** Emit with an ack and a timeout; resolves to the ack payload or a synthetic error. */
  const request = useCallback((event, payload) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: { message: 'Not connected to the room' } });
    }
    return socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck(event, payload)
      .catch(() => ({ ok: false, error: { message: 'The server did not respond in time' } }));
  }, []);

  const sendAction = useCallback(
    async (action) => {
      const res = await request('playback:action', action);
      if (!res.ok) toastRef.current.error(res.error.message);
      return res;
    },
    [request],
  );

  useEffect(() => {
    const socket = io(SOCKET_URL, { withCredentials: true, autoConnect: false });
    socketRef.current = socket;
    // Take over the shared player (clears the local queue) before any state arrives.
    playerRef.current.attachRemote({
      code,
      roomName: 'room',
      canControl: false,
      play() {},
      pause() {},
      seek() {},
      next() {},
      prev() {},
      onEnded() {},
    });

    const syncClock = async () => {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const sentAt = Date.now();
        try {
          const res = await socket.timeout(2000).emitWithAck('time:sync');
          samples.push({ sentAt, receivedAt: Date.now(), serverTime: res.serverTime });
        } catch {
          /* ignore a lost sample */
        }
      }
      const { offsetMs, rttMs: rtt } = estimateClockOffset(samples);
      offsetRef.current = offsetMs;
      setRttMs(rtt);
    };

    const join = async () => {
      const res = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('room:join', { code })
        .catch(() => null);
      if (!res) {
        setConn('reconnecting');
        return;
      }
      if (!res.ok) {
        setError(res.error);
        setConn(res.error.code === 'NOT_FOUND' ? 'notfound' : 'error');
        return;
      }
      setParticipants(res.participants);
      setMessages(res.messages);
      setOlderCursor(res.messages.length >= 30 ? res.messages[0].id : null);
      setError(null);
      setConn('joined');
      applyState(res.state);
    };

    socket.on('connect', async () => {
      await syncClock();
      await join();
    });
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') setConn('reconnecting');
    });
    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        setError({ message: 'Your session has expired. Please log in again.' });
        setConn('error');
        socket.disconnect();
      } else {
        setConn('reconnecting');
      }
    });
    socket.on('room:state', applyState);
    socket.on('room:participants', ({ participants: list }) => setParticipants(list));
    socket.on('chat:message', (m) =>
      setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m].slice(-MAX_MESSAGES))),
    );
    socket.on('room:closed', ({ reason }) => {
      setConn('closed');
      setError({ message: reason });
      roomRef.current = null;
      playerRef.current.detachRemote();
    });

    socket.connect();
    // Periodic drift correction while playing (covers buffering stalls, sleep, etc.).
    const timer = setInterval(
      () => roomRef.current?.playback.isPlaying && resync(),
      DRIFT_CHECK_MS,
    );

    return () => {
      clearInterval(timer);
      socket.emit('room:leave');
      socket.disconnect();
      socketRef.current = null;
      roomRef.current = null;
      playerRef.current.detachRemote();
    };
  }, [code, applyState, resync]);

  const isHost = Boolean(room && user && room.hostId === user.id);
  const canControl = Boolean(room && (isHost || room.controlMode === 'everyone'));

  // Route the global player bar's controls through the room while joined.
  useEffect(() => {
    if (!room) return;
    playerRef.current.attachRemote({
      code,
      roomName: room.name,
      canControl,
      play: (pos) => sendAction({ type: 'play', positionSec: pos }),
      pause: (pos) => sendAction({ type: 'pause', positionSec: pos }),
      seek: (pos) => sendAction({ type: 'seek', positionSec: pos }),
      next: () => sendAction({ type: 'next' }),
      prev: () => sendAction({ type: 'prev' }),
      onEnded: () => {
        const pb = roomRef.current?.playback;
        // Any participant may report the end; the server dedupes by state version.
        if (pb?.track)
          request('playback:action', { type: 'ended', trackId: pb.track.id, version: pb.version });
      },
    });
  }, [code, room?.name, canControl, sendAction, request]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback((text) => request('chat:send', { text }), [request]);

  const loadOlder = useCallback(async () => {
    if (!olderCursor) return;
    try {
      const res = await roomsApi.messages(code, { before: olderCursor, limit: 30 });
      setMessages((ms) => [...res.items, ...ms]);
      setOlderCursor(res.nextCursor);
    } catch (err) {
      toastRef.current.error(err.message);
    }
  }, [code, olderCursor]);

  const setControlMode = useCallback(
    async (controlMode) => {
      const res = await request('room:settings', { controlMode });
      if (!res.ok) toastRef.current.error(res.error.message);
    },
    [request],
  );

  return {
    conn,
    error,
    room,
    participants,
    messages,
    hasOlder: Boolean(olderCursor),
    rttMs,
    isHost,
    canControl,
    sendAction,
    sendMessage,
    loadOlder,
    setControlMode,
  };
}
