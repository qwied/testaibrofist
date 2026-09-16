// ============ СВОДКА УВЕДОМЛЕНИЙ ДЛЯ ШАПКИ ============
/* Один запрос на всё, что подсвечивается в боковом меню: непрочитанные
   личные сообщения и новые карты друзей. Шапка (shell.js) висит на
   каждой странице, поэтому важно, чтобы это был ОДИН лёгкий запрос, а не
   по одному на каждый значок — и чтобы он не тянул тексты сообщений и
   данные карт, только числа и имена.

   Считаем на лету по тем же данным, что уже лежат в messages.js и
   maps.js: отдельного хранилища уведомлений нет, а значит нечему и
   разъезжаться с действительностью. */
'use strict';

function register(app, acc) {
  const { currentUser, save } = acc;
  const messages = require('./messages.js');
  const maps = require('./maps.js');

  app.get('/notifications', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ guest: true, messages: { total: 0, from: [] },
                              maps: { count: 0, authors: [] } });
    const un = messages.unreadFor(u.name);
    const nm = maps.newFromFriends(u);
    res.json({
      guest: false,
      messages: { total: un.total, from: un.from.slice(0, 8), threads: un.threads },
      maps: { count: nm.count, authors: nm.authors.slice(0, 8) }
    });
  });

  /* Игрок открыл Maps Browser — значит новые карты он увидел. Двигаем
     метку вперёд, но не дальше текущего момента: иначе карта, выложенная
     в ту же секунду, пропала бы из счётчика непрочитанных. */
  app.post('/maps/seen', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.json({ status: 'success', saved: false });
    u.mapsSeenAt = Date.now();
    save();
    res.json({ status: 'success', saved: true });
  });
}

module.exports = { register, reload: () => {} };
