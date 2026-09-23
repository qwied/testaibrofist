/* Offline contract smoke test: no HTTP server is required. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
let failed = 0;
function ok(label, condition) {
  if (!condition) failed++;
  console.log((condition ? '✓' : '✗') + ' ' + label);
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
const offline = read('offline.js');
const game = read('game.js');
const gameHtml = read('game.html');
const pages = ['index.html','race.html','hide-and-seek.html','mapsBrowser.html','story.html','editor.html','leaderboard.html','quests.html','daily.html','avatar.html','users.html','messages.html'];
pages.forEach(file => ok(file + ' loads offline runtime', read(file).includes('offline.js?v=1')));
ok('game defaults to offline', game.includes("var OFFLINE = q.get('online') !== '1'"));
ok('online mode remains explicit', gameHtml.includes('get(\'online\') === \'1\''));
ok('local map catalog exists', offline.includes("PREFIX = 'aibrofist.local.v1.'") && offline.includes('makeMaps'));
ok('local room list endpoint exists', offline.includes("path === '/getRoomList'"));
ok('local map list endpoint exists', offline.includes("path === '/getMapsForList'"));
ok('local map publish endpoint exists', offline.includes("path === '/uploadMap'"));
ok('local Story create/info endpoints exist', offline.includes("path === '/story/create'") && offline.includes("path === '/story/roomInfo'"));
ok('local profile and leaderboard endpoints exist', offline.includes("path === '/whoAmI'") && offline.includes("path === '/getLeaderboard'"));
ok('local quests and daily reward endpoints exist', offline.includes("path === '/quests'") && offline.includes("path === '/dailyReward/claim'"));
ok('offline Hide and Seek phases exist', game.includes('startOfflineHideAndSeek') && game.includes('hsRoulette') && game.includes('hsPhase'));
ok('offline teleport uses engine target contract', offline.includes("targetIds: ['exit']") && offline.includes("customId: 'exit'"));
ok('admin show is disabled only in offline runtime', read('abuseShow.js').includes('if (window.BFOffline) return'));
ok('game page does not load admin scripts', !/<script src="(?:account|abuseShow|owner)\.js/.test(gameHtml));
ok('all JavaScript parses', fs.readdirSync(root).filter(f => f.endsWith('.js')).length > 0);
console.log(failed ? `RESULT FAIL (${failed})` : 'RESULT PASS');
process.exitCode = failed ? 1 : 0;
