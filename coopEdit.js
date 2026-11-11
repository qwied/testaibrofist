// ============ СОВМЕСТНЫЙ РЕДАКТОР КАРТ (идея игроков «co-op editor») ============
/* Сеанс — комната сокетов 'coop:<код>'. Сервер ничего не хранит и карту не проверяет: он только
   пересылает правки (ops: изменённые/удалённые объекты) остальным участникам, снимок карты —
   новичку от того, кто уже в сеансе, и курсоры. Публикует карту, как и раньше, каждый сам. */
'use strict';
const CODE = /^[a-z0-9]{6}$/;
const MAX_MEMBERS = 6;
const MAX_OPS = 600;

function register(io, nameOf) {
  io.on('connection', (socket) => {
    let code = null;
    const room = () => 'coop:' + code;
    const members = () => { const s = io.sockets.adapter.rooms.get(room()); return s ? Array.from(s) : []; };
    const roster = () => members().map(id => { const s = io.sockets.sockets.get(id); return { id, name: (s && s.data.coopName) || 'Builder' }; });
    let lastOps = 0, lastCur = 0;
    socket.on('coopJoin', (d) => {
      const c = String(d && d.code || '').toLowerCase();
      if (!CODE.test(c) || code) return;
      const s = io.sockets.adapter.rooms.get('coop:' + c);
      if (s && s.size >= MAX_MEMBERS) return socket.emit('coopDenied', { reason: 'full' });
      code = c;
      socket.data.coopName = String((nameOf && nameOf(socket)) || (d && d.name) || 'Builder').replace(/[<>]/g, '').slice(0, 24) || 'Builder';
      socket.join(room());
      const others = members().filter(id => id !== socket.id);
      socket.emit('coopJoined', { code, first: !others.length, members: roster() });
      socket.to(room()).emit('coopRoster', { members: roster(), joined: socket.data.coopName });
      // снимок карты новичку — у первого из тех, кто уже в сеансе
      if (others.length) io.to(others[0]).emit('coopNeedSnap', { to: socket.id });
    });
    socket.on('coopSnap', (d) => {
      if (!code || !d || typeof d.to !== 'string' || members().indexOf(d.to) === -1) return;
      if (!Array.isArray(d.objects) || d.objects.length > 5000) return;
      io.to(d.to).emit('coopSnap', { objects: d.objects, mode: String(d.mode || '').slice(0, 20), from: socket.data.coopName });
    });
    socket.on('coopOps', (d) => {
      if (!code || !d || !Array.isArray(d.ops) || d.ops.length > MAX_OPS) return;
      const now = Date.now();
      if (now - lastOps < 80) return;
      lastOps = now;
      const ops = d.ops.filter(o => o && (o.op === 'set' ? o.obj && typeof o.obj === 'object' && Number.isFinite(o.obj.id) : o.op === 'del' && Number.isFinite(o.id)));
      if (ops.length) socket.to(room()).emit('coopOps', { ops, by: socket.data.coopName });
    });
    socket.on('coopCursor', (d) => {
      if (!code || !d) return;
      const now = Date.now();
      if (now - lastCur < 60) return;
      lastCur = now;
      const x = Number(d.x), y = Number(d.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      socket.to(room()).emit('coopCursor', { id: socket.id, name: socket.data.coopName, x: Math.round(x), y: Math.round(y) });
    });
    const leave = () => {
      if (!code) return;
      const r = room(), name = socket.data.coopName;
      socket.leave(r);
      io.to(r).emit('coopRoster', { members: roster(), left: name, leftId: socket.id });
      code = null;
    };
    socket.on('coopLeave', leave);
    socket.on('disconnect', leave);
  });
}
module.exports = { register };
