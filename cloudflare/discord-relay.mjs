// ============ AIBROFIST: посредник бота Discord (Cloudflare Worker) ============
// С хостинга сайта не открываются адреса Discord кроме discord.com: файлы
// (cdn.discordapp.com) и живое подключение (gateway.discord.gg). Этот
// скрипт живёт в Cloudflare и ходит туда за бота:
//   GET /health                      — проверка: ответ «ok»
//   GET /cdn?url=<адрес на CDN>       — картинка с CDN Discord
//   /gateway?host=<хост>&v=10&...     — WebSocket живого подключения
// Пускает только с ключом (заголовок x-relay-key = секрет RELAY_KEY) и
// только к адресам Discord — чужим он бесполезен.
// Ставится вручную: Cloudflare -> Workers -> вставить этот код, секрет
// RELAY_KEY, свой домен (например relay.aibrofist.online). На хостинге —
// DISCORD_RELAY_URL и DISCORD_RELAY_KEY (см. discordBot.js).
const CDN = /^(?:cdn\.discordapp\.com|media\.discordapp\.net)$/;
const GATEWAY = /^(?:[a-z0-9-]+\.)*discord\.gg$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = request.headers.get('x-relay-key') || '';
    if (!env.RELAY_KEY || key !== env.RELAY_KEY) return new Response('forbidden', { status: 403 });

    if (url.pathname === '/health') return new Response('ok');

    if (url.pathname === '/cdn') {
      let target;
      try { target = new URL(url.searchParams.get('url') || ''); } catch (e) { return new Response('bad url', { status: 400 }); }
      if (target.protocol !== 'https:' || !CDN.test(target.hostname)) return new Response('bad url', { status: 400 });
      const r = await fetch(target.toString(), { headers: { 'user-agent': 'aibrofist-relay' } });
      return new Response(r.body, { status: r.status,
        headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } });
    }

    if (url.pathname === '/gateway') {
      if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 });
      const host = url.searchParams.get('host') || 'gateway.discord.gg';
      if (!GATEWAY.test(host)) return new Response('bad host', { status: 400 });
      const target = new URL('https://' + host + '/');
      url.searchParams.forEach((v, k) => { if (k !== 'host') target.searchParams.set(k, v); });
      // тот же запрос (с заголовками WebSocket), но без ключа — Cloudflare сам
      // соединит бота с Discord и будет передавать сообщения в обе стороны
      const upstream = new Request(target.toString(), request);
      upstream.headers.delete('x-relay-key');
      return fetch(upstream);
    }

    return new Response('not found', { status: 404 });
  }
};
