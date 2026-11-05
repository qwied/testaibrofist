/* Discord-бот AIBrofist сам по себе, без игрового сервера (server.js): когда сайт не работает,
   бот всё равно в сети — правила, автомодерация, предупреждения, /language, /servers и /account.
   Игровых данных здесь нет: /servers показывает пустые комнаты, /account — только игроков,
   чья база лежит рядом в data/. Запускает его .github/workflows/discord-bot.yml.

   DISCORD_BOT_TOKEN — токен бота (обязателен); SITE_URL — куда ведут кнопки «Play»/профиль;
   BOT_RUN_MINUTES — через сколько минут аккуратно выйти (сохранив состояние), 0 — работать всегда. */
'use strict';
const bot = require('./discordBot.js');

if (!String(process.env.DISCORD_BOT_TOKEN || '').trim()) {
  console.error('[bot] DISCORD_BOT_TOKEN is not set — nothing to run');
  process.exit(1);
}

let stopping = false;
function shutdown(why) {
  if (stopping) return;
  stopping = true;
  console.log('[bot] stopping: ' + why);
  try { bot.stop(); } catch (e) { console.error('[bot] stop failed:', e.message); }
  // дать дописаться файлам состояния (сохранение идёт с небольшой задержкой)
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', e => console.error('[bot] unhandled:', e && e.message || e));

bot.start();

const minutes = Number(process.env.BOT_RUN_MINUTES) || 0;
if (minutes > 0) setTimeout(() => shutdown('run time is over (' + minutes + ' min)'), minutes * 60000);

// раз в 10 минут — короткая строка в лог, чтобы было видно, что бот жив
setInterval(() => {
  const s = bot.statusBrief ? bot.statusBrief() : {};
  console.log('[bot] alive · ' + (s.mode || '?') + ' · servers: ' + (s.guilds || 0));
}, 10 * 60000);
