import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { roomsApi } from '../api/index.js';
import { Field, Toggle } from '../components/Field.jsx';
import { Icon } from '../components/Icon.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { EmptyState, ErrorState, PageLoader, Spinner } from '../components/States.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { plural, timeAgo } from '../lib/format.js';

function RoomCard({ room }) {
  return (
    <li>
      <Link to={`/rooms/${room.code}`} className="room-card">
        <span className="room-card__icon" aria-hidden="true">
          <Icon name="radio" size={22} />
        </span>
        <span className="room-card__body">
          <span className="room-card__name">{room.name}</span>
          <span className="muted small">
            Hosted by {room.hostName} · active {timeAgo(room.lastActiveAt)}
          </span>
        </span>
        <span className={`pill ${room.listeners ? 'pill--live' : ''}`}>
          {room.listeners ? <span className="live-dot" aria-hidden="true" /> : null}
          {plural(room.listeners, 'listener')}
        </span>
        {!room.isPublic && <Icon name="lock" size={16} title="Private room" />}
      </Link>
    </li>
  );
}

function RoomList({ load, empty, label }) {
  const [page, setPage] = useState(1);
  const rooms = useAsync(() => load({ page, limit: 10 }), [page]);
  if (rooms.loading && !rooms.data) return <PageLoader label={`Loading ${label}`} />;
  if (rooms.error) return <ErrorState error={rooms.error} onRetry={rooms.reload} />;
  if (!rooms.data.items.length) return empty;
  return (
    <>
      <ul className="room-list" aria-label={label}>
        {rooms.data.items.map((r) => (
          <RoomCard key={r.code} room={r} />
        ))}
      </ul>
      <Pagination pagination={rooms.data.pagination} onChange={setPage} label={`${label} pages`} />
    </>
  );
}

export function RoomsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', isPublic: true, controlMode: 'host' });
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormErrors({ name: 'Give your room a name' });
    setCreating(true);
    try {
      const { room } = await roomsApi.create({ ...form, name: form.name.trim() });
      toast.success(`Room created. Share code ${room.code}`);
      navigate(`/rooms/${room.code}`);
    } catch (err) {
      setFormErrors(err.fieldErrors?.() ?? {});
      toast.error(err.message);
      setCreating(false);
    }
  };

  const join = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return setJoinError('Room codes are 6 letters or numbers');
    navigate(`/rooms/${code}`);
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Listening rooms</h1>
        <p className="muted">
          Listen in sync with friends. The host picks the music, and everyone can chat.
        </p>
      </header>

      <div className="rooms-forms">
        <form className="panel form" onSubmit={create} noValidate aria-labelledby="create-room">
          <h2 id="create-room">Start a room</h2>
          <Field
            label="Room name"
            value={form.name}
            maxLength={60}
            placeholder="Friday night synthwave"
            error={formErrors.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }));
              setFormErrors({});
            }}
          />
          <Toggle
            label="List publicly"
            description="Private rooms are joinable by code only."
            checked={form.isPublic}
            onChange={(isPublic) => setForm((f) => ({ ...f, isPublic }))}
          />
          <Toggle
            label="Let everyone control playback"
            description="Off: only you (the host) can play, pause, seek and skip."
            checked={form.controlMode === 'everyone'}
            onChange={(on) => setForm((f) => ({ ...f, controlMode: on ? 'everyone' : 'host' }))}
          />
          <button className="btn btn--primary" disabled={creating}>
            {creating ? <Spinner size={16} label="Creating room" /> : 'Create room'}
          </button>
        </form>

        <form className="panel form" onSubmit={join} noValidate aria-labelledby="join-room">
          <h2 id="join-room">Join with a code</h2>
          <Field
            label="Room code"
            value={joinCode}
            maxLength={6}
            placeholder="DEMO42"
            autoCapitalize="characters"
            className="field--code"
            error={joinError}
            onChange={(e) => {
              setJoinCode(e.target.value);
              setJoinError(null);
            }}
          />
          <button className="btn btn--secondary">Join room</button>
        </form>
      </div>

      <section aria-labelledby="public-rooms">
        <h2 id="public-rooms" className="section-title">
          Public rooms
        </h2>
        <RoomList
          load={roomsApi.list}
          label="Public rooms"
          empty={
            <EmptyState icon="radio" title="No public rooms yet">
              Start one above and invite friends with the code.
            </EmptyState>
          }
        />
      </section>
      <section aria-labelledby="my-rooms">
        <h2 id="my-rooms" className="section-title">
          Rooms you host
        </h2>
        <RoomList
          load={roomsApi.mine}
          label="Your rooms"
          empty={<p className="muted">You haven’t created any rooms.</p>}
        />
      </section>
    </div>
  );
}
