import { http } from './http.js';

export const authApi = {
  me: () => http('/auth/me'),
  login: (body) => http('/auth/login', { method: 'POST', body }),
  register: (body) => http('/auth/register', { method: 'POST', body }),
  logout: () => http('/auth/logout', { method: 'POST' }),
};

export const tracksApi = {
  list: (query, signal) => http('/tracks', { query, signal }),
  genres: () => http('/tracks/genres'),
  liked: (query) => http('/tracks/liked', { query }),
  likedIds: () => http('/tracks/liked/ids'),
  like: (id) => http(`/tracks/${id}/like`, { method: 'PUT' }),
  unlike: (id) => http(`/tracks/${id}/like`, { method: 'DELETE' }),
  recordPlay: (id) => http(`/tracks/${id}/play`, { method: 'POST' }),
};

export const playlistsApi = {
  mine: (query) => http('/playlists', { query }),
  get: (id) => http(`/playlists/${id}`),
  create: (body) => http('/playlists', { method: 'POST', body }),
  update: (id, body) => http(`/playlists/${id}`, { method: 'PATCH', body }),
  remove: (id) => http(`/playlists/${id}`, { method: 'DELETE' }),
  addTrack: (id, trackId) => http(`/playlists/${id}/tracks`, { method: 'POST', body: { trackId } }),
  removeTrack: (id, trackId) => http(`/playlists/${id}/tracks/${trackId}`, { method: 'DELETE' }),
  reorder: (id, trackIds) => http(`/playlists/${id}/tracks`, { method: 'PUT', body: { trackIds } }),
};

export const roomsApi = {
  list: (query) => http('/rooms', { query }),
  mine: (query) => http('/rooms/mine', { query }),
  get: (code) => http(`/rooms/${code}`),
  create: (body) => http('/rooms', { method: 'POST', body }),
  update: (code, body) => http(`/rooms/${code}`, { method: 'PATCH', body }),
  remove: (code) => http(`/rooms/${code}`, { method: 'DELETE' }),
  messages: (code, query) => http(`/rooms/${code}/messages`, { query }),
};
