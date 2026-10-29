// Lets REST handlers broadcast to Socket.IO rooms without importing the socket server
// (avoids a circular dependency and keeps HTTP handlers testable without sockets).
let io = null;

export const setIo = (instance) => {
  io = instance;
};
export const socketRoom = (code) => `room:${code}`;
export const emitToRoom = (code, event, payload) => io?.to(socketRoom(code)).emit(event, payload);
export const closeSocketRoom = (code) => io?.in(socketRoom(code)).socketsLeave(socketRoom(code));
