// In-memory presence: which users are connected to which room, across tabs/sockets.
// A user with two tabs counts once and only "leaves" when their last socket leaves.
//
// Limitation: this lives in one Node process. Running several API instances would
// need a shared store (e.g. Redis hashes) plus the Socket.IO Redis adapter.
const rooms = new Map(); // code -> Map<userId, { username, sockets: Set<socketId> }>

export function addPresence(code, user, socketId) {
  if (!rooms.has(code)) rooms.set(code, new Map());
  const members = rooms.get(code);
  const entry = members.get(user.id) ?? { username: user.username, sockets: new Set() };
  const isNewUser = entry.sockets.size === 0;
  entry.sockets.add(socketId);
  members.set(user.id, entry);
  return isNewUser;
}

/** Returns true when the user's last socket left the room. */
export function removePresence(code, userId, socketId) {
  const members = rooms.get(code);
  const entry = members?.get(userId);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) return false;
  members.delete(userId);
  if (members.size === 0) rooms.delete(code);
  return true;
}

export function listParticipants(code) {
  return [...(rooms.get(code)?.entries() ?? [])].map(([id, e]) => ({ id, username: e.username }));
}

export const participantCount = (code) => rooms.get(code)?.size ?? 0;

export function clearRoomPresence(code) {
  rooms.delete(code);
}

export function resetPresence() {
  rooms.clear();
}
