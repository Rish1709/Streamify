import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MAX_LEN = 500;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function RoomChat({ messages, onSend, hasOlder, onLoadOlder, disabled }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stickRef = useRef(true);

  // Auto-scroll on new messages only if the user is already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    const res = await onSend(trimmed);
    setSending(false);
    if (res.ok) {
      setText('');
      setError(null);
      stickRef.current = true;
    } else {
      setError(res.error.message);
    }
  };

  return (
    <section className="panel chat" aria-labelledby="chat-heading">
      <h2 id="chat-heading" className="panel__title">
        Chat
      </h2>
      <div
        className="chat__list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasOlder && (
          <button className="btn btn--ghost btn--sm chat__older" onClick={onLoadOlder}>
            Load earlier messages
          </button>
        )}
        {messages.length === 0 ? (
          <p className="muted chat__empty">No messages yet. Say hi 👋</p>
        ) : (
          <ol className="chat__messages" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <li key={m.id} className={`chat__msg ${m.userId === user?.id ? 'is-mine' : ''}`}>
                <span className="chat__author">{m.username}</span>
                <time className="chat__time" dateTime={m.createdAt}>
                  {timeFmt.format(new Date(m.createdAt))}
                </time>
                <p className="chat__text">{m.text}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          value={text}
          maxLength={MAX_LEN}
          placeholder={disabled ? 'Reconnecting…' : 'Send a message'}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'chat-error' : undefined}
          autoComplete="off"
        />
        <button
          className="icon-btn icon-btn--primary"
          disabled={disabled || sending || !text.trim()}
          aria-label="Send message"
        >
          <Icon name="send" size={18} />
        </button>
      </form>
      {error && (
        <p id="chat-error" className="field__error chat__error" role="alert">
          {error}
        </p>
      )}
      {text.length > MAX_LEN - 50 && (
        <p className="muted small chat__count">{MAX_LEN - text.length} characters left</p>
      )}
    </section>
  );
}
