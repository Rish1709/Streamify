import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PlayerBar } from '../player/PlayerBar.jsx';
import { Icon } from './Icon.jsx';
import { Menu } from './Menu.jsx';

const NAV = [
  { to: '/', label: 'Browse', icon: 'home', end: true },
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/rooms', label: 'Rooms', icon: 'radio' },
];

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Streamify home">
      <img src="/favicon.svg" alt="" width="28" height="28" />
      <span>Streamify</span>
    </Link>
  );
}

function UserArea() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (!user) {
    return (
      <div className="user-area">
        <Link className="btn btn--ghost btn--sm" to="/register">
          Sign up
        </Link>
        <Link className="btn btn--primary btn--sm" to="/login">
          Log in
        </Link>
      </div>
    );
  }
  return (
    <div className="user-area">
      <Menu
        buttonLabel={`Account menu for ${user.username}`}
        buttonClassName="avatar-btn"
        buttonContent={
          <>
            <span className="avatar" aria-hidden="true">
              {user.username[0].toUpperCase()}
            </span>
            <span className="avatar-btn__name">{user.username}</span>
          </>
        }
        items={[
          { heading: user.email },
          {
            label: 'Log out',
            onSelect: async () => {
              await logout();
              toast.success('Logged out');
              navigate('/');
            },
          },
        ]}
      />
    </div>
  );
}

export function AppShell() {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Primary">
        <Logo />
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className="nav-link">
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebar__footer muted">
          Demo catalogue: original CC0 audio generated for this project.
        </p>
      </aside>

      <header className="topbar">
        <span className="topbar__logo">
          <Logo />
        </span>
        <UserArea />
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <PlayerBar />

      <nav className="tabbar" aria-label="Primary mobile">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tabbar__link">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
