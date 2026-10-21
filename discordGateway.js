// ============ DISCORD: постоянное подключение бота (Gateway) ============
// Чтобы модерировать чат, бот должен видеть сообщения в момент отправки —
// это даёт только Gateway (WebSocket), обычных HTTP-запросов тут мало.
// Здесь только транспорт: пульс (heartbeat), вход (identify), продолжение
// сессии после обрыва (resume) и переподключение с паузой. Что делать с
// событиями, решает discordBot.js.
// DISCORD_GATEWAY_URL подменяют только тесты. opts.relay — посредник в
// Cloudflare (cloudflare/discord-relay.mjs), если сам хостинг до Discord не
// достаёт: подключение идёт к нему, а он соединяет с нужным хостом Discord.
'use strict';
const EventEmitter = require('events');
const WebSocket = require('ws');

const DEFAULT_URL = 'wss://gateway.discord.gg';
// коды закрытия, после которых переподключаться бессмысленно
const FATAL = { 4004: 'token rejected', 4010: 'invalid shard', 4011: 'sharding required',
                4012: 'invalid API version', 4013: 'invalid intents' };
const BACKOFF = [1000, 2000, 5000, 10000, 30000, 60000];

class Gateway extends EventEmitter {
  constructor(opts) {
    super();
    this.token = opts.token;
    this.intents = opts.intents;
    this.presence = opts.presence || null;
    this.baseUrl = String(opts.url || process.env.DISCORD_GATEWAY_URL || DEFAULT_URL).replace(/\/+$/, '');
    this.relay = opts.relay && opts.relay.url && opts.relay.key ? opts.relay : null;
    this.ws = null;
    this.seq = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.beat = null;
    this.acked = true;
    this.fails = 0;
    this.stopped = false;
    this.retryTimer = null;
    this.connTimer = null;
    // открытое, но так и не «вошедшее» соединение (нет HELLO или READY) через столько рвётся и открывается заново
    this.readyMs = Number(opts.readyMs || process.env.DISCORD_GW_READY_MS) || 30000;
    // для страницы состояния (/discord/status): что сейчас и что было последним
    this.state = 'idle';
    this.lastClose = null;
    this.lastError = null;
  }

  url(resume) {
    const target = resume && this.resumeUrl ? this.resumeUrl : this.baseUrl;
    let u;
    if (this.relay) {
      // через посредника: он сам подключится к этому хосту Discord
      u = new URL(this.relay.url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/gateway');
      u.searchParams.set('host', new URL(target).hostname);
    } else u = new URL(target);
    u.searchParams.set('v', '10');
    u.searchParams.set('encoding', 'json');
    return u.toString();
  }

  connect() {
    if (this.stopped) return;
    const resume = !!(this.sessionId && this.seq !== null);
    let ws;
    // family:4 — как у HTTP-запросов (discordApi.js): IPv6 у хостинга битый,
    // и без этого подключение к Discord просто висело, бот был «не в сети»
    this.state = 'connecting';
    const opts = { handshakeTimeout: 15000, family: 4 };
    if (this.relay) opts.headers = { 'x-relay-key': this.relay.key };
    try { ws = new WebSocket(this.url(resume), opts); }
    catch (e) { this.lastError = { message: e.message, at: Date.now() }; this.retry('connect failed: ' + e.message); return; }
    this.ws = ws;
    this.acked = true;
    this.stopConn();
    this.connTimer = setTimeout(() => { if (ws === this.ws && this.state !== 'ready') this.drop(4903, 'not ready in ' + this.readyMs + ' ms'); }, this.readyMs);
    if (this.connTimer.unref) this.connTimer.unref();
    ws.on('message', data => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch (e) { return; }
      this.onPayload(ws, msg, resume);
    });
    ws.on('close', (code, reason) => {
      if (ws !== this.ws) return;              // старое соединение, уже заменили
      this.stopBeat();
      this.stopConn();
      this.ws = null;
      this.state = 'closed';
      this.lastClose = { code, reason: reason && reason.length ? String(reason) : '', at: Date.now() };
      if (this.stopped) return;
      if (FATAL[code]) {
        this.stopped = true;
        this.state = 'stopped';
        this.emit('fatal', code, FATAL[code]);
        return;
      }
      if (code === 4014) {                     // привилегированные intents не включены
        this.emit('disallowed');
        return;
      }
      // 4007 (неверный seq) и 4009 (сессия истекла) — только новая сессия
      if (code === 4007 || code === 4009) { this.sessionId = null; this.seq = null; }
      this.retry('closed ' + code + (reason && reason.length ? ' ' + String(reason) : ''));
    });
    ws.on('error', e => {
      this.lastError = { message: e.message, at: Date.now() };
      this.emit('debug', 'socket error: ' + e.message);
    });
  }

  onPayload(ws, msg, resume) {
    if (msg.s !== null && msg.s !== undefined) this.seq = msg.s;
    switch (msg.op) {
      case 10: {                               // HELLO
        const every = msg.d && msg.d.heartbeat_interval || 41250;
        this.stopBeat();
        // первый пульс — в случайный момент интервала, как просит Discord
        this.beat = setTimeout(() => {
          this.heartbeat();
          this.beat = setInterval(() => this.heartbeat(), every);
        }, Math.floor(every * Math.random()));
        if (resume) this.send({ op: 6, d: { token: this.token, session_id: this.sessionId, seq: this.seq } });
        else this.identify();
        break;
      }
      case 11: this.acked = true; break;      // пульс принят
      case 1: this.heartbeat(true); break;     // Discord просит пульс сейчас
      case 7:                                  // просит переподключиться
        this.drop(4900, 'reconnect requested');
        break;
      case 9:                                  // сессия недействительна
        if (!msg.d) { this.sessionId = null; this.seq = null; }
        setTimeout(() => this.drop(4901, 'invalid session'), 1000 + Math.floor(Math.random() * 4000));
        break;
      case 0:
        if (msg.t === 'READY' || msg.t === 'RESUMED') this.stopConn();
        if (msg.t === 'READY') {
          this.sessionId = msg.d.session_id;
          this.resumeUrl = msg.d.resume_gateway_url || null;
          this.fails = 0;
          this.state = 'ready';
        } else if (msg.t === 'RESUMED') {
          this.fails = 0;
          this.state = 'ready';
        }
        this.emit('dispatch', msg.t, msg.d);
        break;
    }
  }

  identify() {
    this.send({ op: 2, d: {
      token: this.token,
      intents: this.intents,
      properties: { os: 'linux', browser: 'aibrofist', device: 'aibrofist' },
      presence: this.presence || undefined
    } });
  }

  heartbeat(forced) {
    // прошлый пульс без ответа — соединение «зависло», переподключаемся
    if (!forced && !this.acked) { this.drop(4902, 'heartbeat not acknowledged'); return; }
    this.acked = false;
    this.send({ op: 1, d: this.seq });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  stopBeat() {
    if (this.beat) { clearTimeout(this.beat); clearInterval(this.beat); this.beat = null; }
  }

  stopConn() {
    if (this.connTimer) { clearTimeout(this.connTimer); this.connTimer = null; }
  }

  // закрыть текущее соединение кодом не 1000 — тогда сессию можно продолжить
  drop(code, why) {
    const ws = this.ws;
    if (!ws) return;
    this.emit('debug', why);
    try { ws.close(code, why); } catch (e) { /* уже закрыто */ }
    // если сокет не закрылся сам за 5 с — рвём
    setTimeout(() => { try { ws.terminate(); } catch (e) {} }, 5000).unref();
  }

  retry(why) {
    if (this.stopped || this.retryTimer) return;
    const wait = BACKOFF[Math.min(this.fails, BACKOFF.length - 1)];
    this.fails++;
    this.emit('debug', why + ', reconnecting in ' + wait + ' ms');
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, wait);
  }

  destroy() {
    this.stopped = true;
    this.stopBeat();
    this.stopConn();
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.ws) { try { this.ws.close(1000); } catch (e) {} this.ws = null; }
  }
}

module.exports = { Gateway };
