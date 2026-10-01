import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
// جميع الملفات في جذر المستودع لتسهيل رفعها من GitHub.
const publicRoot = root;
const rooms = new Map();
const uid = () => crypto.randomUUID();
const token = () => crypto.randomBytes(24).toString('hex');
const clean = (v, n = 24) => String(v ?? '').trim().slice(0, n);
const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const randomCode = () => crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
const resources = ['oil', 'gas', 'gold', 'iron'];
const resourceNames = { oil: 'النفط', gas: 'الغاز', gold: 'الذهب', iron: 'الحديد' };

const ships = [
  { id: 'energy', name: 'ناقلة الطاقة', need: { oil: 45, gas: 22, gold: 8, iron: 12 } },
  { id: 'treasure', name: 'سفينة الكنوز', need: { oil: 22, gas: 15, gold: 25, iron: 12 } },
  { id: 'industry', name: 'السفينة الصناعية', need: { oil: 30, gas: 20, gold: 14, iron: 32 } }
];
const missions = [
  { id: 'scholar', title: 'العقل الجريء', text: 'أجب عن سؤال متوسط أو صعب إجابة صحيحة.', reward: '2,500 ريال + قطعتا ذهب' },
  { id: 'broker', title: 'شيخ السوق', text: 'أنجز صفقتين مع القباطنة.', reward: '3,000 ريال + وحدتا غاز' },
  { id: 'oilKing', title: 'ملك النفط', text: 'اجمع 18 برميل نفط.', reward: '2,500 ريال + 3 حديد' },
  { id: 'investor', title: 'المستثمر الخفي', text: 'امتلك 5 أسهم في وقت واحد.', reward: '3,000 ريال + برميلا نفط' }
];
const landNames = ['صحراء الفجر', 'هضبة العنبر', 'جزيرة السارية', 'وادي النحاس', 'ساحل المرجان', 'أرض السراب', 'ميناء الريح', 'خليج اللؤلؤ', 'هضبة النورس', 'جزيرة النحاس', 'ساحل الدانة'];

async function loadQuestions() {
  const source = await readFile(path.join(publicRoot, 'questions.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(`${source};this.bank=QUESTION_BANK`, sandbox);
  return sandbox.bank;
}
const questionBank = await loadQuestions();

function newPlayer(name) {
  return { id: uid(), token: token(), name, cash: 5000, res: { oil: 0, gas: 0, gold: 0, iron: 0 }, stocks: { oil: 0, gas: 0, gold: 0, iron: 0 }, ship: null, mission: null, missionDone: false, advancedCorrect: 0, deals: 0, connected: true, readyAt: null, question: null, answered: false, bidDone: false };
}

function createRoom(usedIds = []) {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room = {
    code, hostToken: token(), phase: 'lobby', round: 1, players: [], createdAt: Date.now(), deadline: 0,
    usedQuestions: new Set(Array.isArray(usedIds) ? usedIds.map(String) : []),
    prices: { oil: 650, gas: 850, gold: 1900, iron: 1000 }, stockPrices: { oil: 250, gas: 300, gold: 500, iron: 350 },
    lastChanges: { oil: -13.4, gas: 6.8, gold: 2.1, iron: -4.7 }, auction: null, trades: [], news: [], winner: null, message: 'بانتظار انضمام القباطنة'
  };
  rooms.set(code, room);
  return room;
}

function phase(room, name, seconds, message) {
  room.phase = name;
  room.deadline = seconds ? Date.now() + seconds * 1000 : 0;
  if (message) room.message = message;
}

function startGame(room) {
  room.players.forEach((p, index) => {
    p.mission = missions[index % missions.length];
    p.missionDone = false;
  });
  phase(room, 'ship', 75, 'كل قبطان يختار باخرته السرية');
}

function startAuction(room) {
  const offset = (room.round - 1) % room.players.length;
  const order = [...room.players.slice(offset), ...room.players.slice(0, offset)].map(p => p.id);
  room.auction = { order, turn: 0, offers: [], results: [], allocated: false };
  room.players.forEach(p => p.bidDone = false);
  phase(room, 'auction', 35, `الدور على ${playerById(room, order[0]).name}`);
}

function resolveAuction(room) {
  const winners = [];
  for (let index = 0; index < room.players.length + 1; index++) {
    const bids = room.auction.offers.filter(o => o.landIndex === index).sort((a, b) => b.amount - a.amount || a.order - b.order);
    if (bids[0]) winners.push(bids[0]);
  }
  const winnerIds = new Set(winners.map(w => w.playerId));
  const wonLands = new Set(winners.map(w => w.landIndex));
  const available = landNames.map((name, index) => ({ name, index })).filter(x => !wonLands.has(x.index));
  for (const p of room.players) {
    let win = winners.find(w => w.playerId === p.id);
    if (!win) {
      const fallback = available.shift() || { name: landNames[crypto.randomInt(landNames.length)], index: -1 };
      win = { playerId: p.id, name: p.name, landIndex: fallback.index, land: fallback.name, amount: 500, fallback: true };
      winners.push(win);
    }
    const price = Math.min(p.cash, win.amount);
    p.cash -= price;
    p.land = win.land;
    p.landPrice = price;
    p.loot = { oil: 3 + crypto.randomInt(8), gas: 2 + crypto.randomInt(6), gold: 1 + crypto.randomInt(4), iron: 2 + crypto.randomInt(7) };
    resources.forEach(k => p.res[k] += p.loot[k]);
    checkMission(room, p);
  }
  room.auction.results = winners;
  room.auction.allocated = true;
  room.news.push('اكتملت مزايدات الأراضي وتوزعت مواقع الاستخراج على القباطنة.');
  room.players.forEach(p => { p.question = null; p.answered = false; p.difficulty = null; });
  phase(room, 'questionSelect', 35, 'اختر مستوى السؤال');
}

function unusedQuestions(room, level) { return questionBank[level].filter(q => !room.usedQuestions.has(q.id)); }

function assignQuestion(room, player, level) {
  let pool = unusedQuestions(room, level);
  if (!pool.length) pool = Object.values(questionBank).flat().filter(q => !room.usedQuestions.has(q.id));
  if (!pool.length) return null;
  const question = pool[crypto.randomInt(pool.length)];
  room.usedQuestions.add(question.id);
  player.question = question;
  player.difficulty = level;
  player.prize = level === 'hard' ? 5000 : level === 'medium' ? 3000 : 1000;
  return question;
}

function startQuestions(room) {
  for (const p of room.players) if (!p.question) assignQuestion(room, p, 'easy');
  phase(room, 'question', 35, 'أجيبوا عن الأسئلة الآن');
}

function startMarket(room) {
  room.trades = [];
  phase(room, 'market', 150, 'السوق العالمي ومقايضات القباطنة مفتوحة');
}

function startStocks(room) { phase(room, 'stocks', 90, 'بورصة الموارد مفتوحة'); }

function startNews(room) {
  for (const key of resources) {
    const change = Number((Math.random() * 31 - 13.5).toFixed(1));
    room.lastChanges[key] = change;
    room.stockPrices[key] = Math.max(100, Math.round(room.stockPrices[key] * (1 + change / 100)));
    room.prices[key] = Math.max(350, Math.round(room.prices[key] * (1 + change / 180)));
  }
  const biggest = [...resources].sort((a, b) => Math.abs(room.lastChanges[b]) - Math.abs(room.lastChanges[a]))[0];
  room.news.push(`سهم ${resourceNames[biggest]} هو الأكثر حركة؛ ${room.lastChanges[biggest] >= 0 ? 'ارتفع' : 'انخفض'} بنسبة ${Math.abs(room.lastChanges[biggest]).toFixed(1)}%.`);
  phase(room, 'news', 35, 'نشرة أرض النفط على الهواء');
}

function nextRound(room) {
  const ready = room.players.filter(p => isShipComplete(p)).sort((a, b) => (a.readyAt || Infinity) - (b.readyAt || Infinity));
  if (ready.length) {
    room.winner = ready[0].id;
    return phase(room, 'finished', 0, `فاز القبطان ${ready[0].name}`);
  }
  room.round++;
  room.news = [];
  room.players.forEach(p => { p.cash += 500; p.question = null; p.answered = false; p.loot = null; p.land = null; p.readyAt = null; });
  startAuction(room);
}

function isShipComplete(player) {
  if (!player.ship) return false;
  const ship = ships.find(x => x.id === player.ship);
  return resources.every(k => player.res[k] >= ship.need[k]);
}

function checkReady(player) { if (isShipComplete(player) && !player.readyAt) player.readyAt = Date.now(); }

function checkMission(room, p) {
  if (!p.mission || p.missionDone) return;
  const done = { scholar: p.advancedCorrect >= 1, broker: p.deals >= 2, oilKing: p.res.oil >= 18, investor: Object.values(p.stocks).reduce((a, b) => a + b, 0) >= 5 }[p.mission.id];
  if (!done) return;
  p.missionDone = true;
  if (p.mission.id === 'scholar') { p.cash += 2500; p.res.gold += 2; }
  if (p.mission.id === 'broker') { p.cash += 3000; p.res.gas += 2; }
  if (p.mission.id === 'oilKing') { p.cash += 2500; p.res.iron += 3; }
  if (p.mission.id === 'investor') { p.cash += 3000; p.res.oil += 2; }
  room.news.push('أنجز أحد القباطنة مهمة سرية وحصل على مكافأة كبيرة.');
  checkReady(p);
}

function playerById(room, id) { return room.players.find(p => p.id === id); }

function tick(room) {
  if (!room.deadline || Date.now() < room.deadline) return;
  if (room.phase === 'ship') {
    room.players.forEach(p => { if (!p.ship) p.ship = ships[crypto.randomInt(ships.length)].id; });
    return startAuction(room);
  }
  if (room.phase === 'auction') {
    while (room.auction.turn < room.auction.order.length) {
      const p = playerById(room, room.auction.order[room.auction.turn]);
      room.auction.offers.push({ playerId: p.id, name: p.name, landIndex: room.auction.turn, land: landNames[room.auction.turn], amount: 500, order: room.auction.turn });
      room.auction.turn++;
    }
    return resolveAuction(room);
  }
  if (room.phase === 'questionSelect') { room.players.forEach(p => { if (!p.question) assignQuestion(room, p, 'easy'); }); return startQuestions(room); }
  if (room.phase === 'question') { room.players.forEach(p => { if (!p.answered) p.answered = true; }); return startMarket(room); }
  if (room.phase === 'market') return startStocks(room);
  if (room.phase === 'stocks') return startNews(room);
  if (room.phase === 'news') return nextRound(room);
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, connected: p.connected, shipChosen: !!p.ship, bidDone: !!p.bidDone, answered: !!p.answered, ready: !!p.readyAt };
}

function view(room, accessToken) {
  tick(room);
  const host = accessToken === room.hostToken;
  const p = room.players.find(x => x.token === accessToken);
  const me = p ? {
    id: p.id, name: p.name, cash: p.cash, res: p.res, stocks: p.stocks, ship: p.ship, mission: p.mission, missionDone: p.missionDone,
    loot: p.loot, land: p.land, landPrice: p.landPrice, question: room.phase === 'question' && p.question ? { id: p.question.id, q: p.question.q, a: p.question.a } : null,
    answered: p.answered, difficulty: p.difficulty, prize: p.prize, incomingTrades: room.trades.filter(t => t.to === p.id && t.status === 'pending'), outgoingTrades: room.trades.filter(t => t.from === p.id && t.status === 'pending')
  } : null;
  const auction = room.auction ? { turn: room.auction.turn, order: room.auction.order, offers: room.auction.offers, results: room.auction.results, currentPlayerId: room.auction.order[room.auction.turn] || null, allocated: room.auction.allocated } : null;
  return { code: room.code, host, phase: room.phase, round: room.round, deadline: room.deadline, message: room.message, players: room.players.map(publicPlayer), prices: room.prices, stockPrices: room.stockPrices, lastChanges: room.lastChanges, ships, lands: landNames.slice(0, room.players.length + 1), auction, news: room.news.slice(-8), winner: room.winner, me, usedQuestionIds: host ? [...room.usedQuestions] : undefined };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw Error('too large'); }
  return raw ? JSON.parse(raw) : {};
}

function requirePlayer(room, t) {
  const p = room.players.find(x => x.token === t);
  if (!p) throw Object.assign(Error('رمز اللاعب غير صحيح'), { status: 403 });
  return p;
}

function ensureResource(key) { if (!resources.includes(key)) throw Object.assign(Error('المورد غير صحيح'), { status: 400 }); }

async function gameApi(req, res) {
  const b = await body(req);
  const action = clean(b.action, 30);
  if (action === 'create') {
    const room = createRoom(b.usedQuestionIds);
    return send(res, 201, { code: room.code, token: room.hostToken, state: view(room, room.hostToken) });
  }
  const code = clean(b.code, 5).toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(res, 404, { error: 'الغرفة غير موجودة أو أُغلقت' });
  tick(room);
  const t = clean(b.token, 64);
  const host = t === room.hostToken;
  if (action === 'join') {
    if (room.phase !== 'lobby') return send(res, 409, { error: 'بدأت اللعبة بالفعل' });
    if (room.players.length >= 10) return send(res, 409, { error: 'اكتمل عدد القباطنة' });
    const name = clean(b.name);
    if (!name) return send(res, 400, { error: 'اكتب اسم القبطان' });
    if (room.players.some(p => p.name === name)) return send(res, 409, { error: 'الاسم مستخدم' });
    const p = newPlayer(name);
    room.players.push(p);
    room.message = `انضم القبطان ${name}`;
    return send(res, 201, { token: p.token, state: view(room, p.token) });
  }
  if (action === 'state') return send(res, 200, view(room, t));
  if (action === 'start') {
    if (!host) return send(res, 403, { error: 'البدء للمضيف فقط' });
    if (room.players.length < 2) return send(res, 400, { error: 'يلزم قبطانان على الأقل' });
    startGame(room);
    return send(res, 200, view(room, t));
  }
  if (action === 'advance') {
    if (!host) return send(res, 403, { error: 'التحكم للمضيف فقط' });
    room.deadline = Date.now() - 1;
    tick(room);
    return send(res, 200, view(room, t));
  }
  const p = requirePlayer(room, t);
  if (action === 'chooseShip') {
    if (room.phase !== 'ship' || !ships.some(x => x.id === b.ship)) return send(res, 409, { error: 'اختيار الباخرة غير متاح' });
    p.ship = b.ship;
    if (room.players.every(x => x.ship)) startAuction(room);
  } else if (action === 'bid') {
    if (room.phase !== 'auction' || room.auction.order[room.auction.turn] !== p.id) return send(res, 409, { error: 'ليس دورك في المزاد' });
    const landIndex = Number(b.landIndex), amount = Math.floor(Number(b.amount) / 500) * 500;
    if (!Number.isInteger(landIndex) || landIndex < 0 || landIndex >= room.players.length + 1) return send(res, 400, { error: 'اختر أرضًا صحيحة' });
    if (amount < 500 || amount > p.cash) return send(res, 400, { error: 'قيمة العرض غير صحيحة' });
    room.auction.offers.push({ playerId: p.id, name: p.name, landIndex, land: landNames[landIndex], amount, order: room.auction.turn });
    p.bidDone = true;
    room.auction.turn++;
    if (room.auction.turn >= room.auction.order.length) resolveAuction(room);
    else { room.deadline = Date.now() + 35_000; room.message = `الدور على ${playerById(room, room.auction.order[room.auction.turn]).name}`; }
  } else if (action === 'chooseQuestion') {
    if (room.phase !== 'questionSelect' || p.question) return send(res, 409, { error: 'الاختيار غير متاح' });
    const level = ['easy', 'medium', 'hard'].includes(b.level) ? b.level : 'easy';
    assignQuestion(room, p, level);
    if (room.players.every(x => x.question)) startQuestions(room);
  } else if (action === 'answer') {
    if (room.phase !== 'question' || p.answered || !p.question) return send(res, 409, { error: 'الإجابة غير متاحة' });
    const correct = Number(b.index) === p.question.c;
    p.answered = true;
    p.answerCorrect = correct;
    if (correct) { p.cash += p.prize; if (p.difficulty !== 'easy') p.advancedCorrect++; room.news.push('أجاب أحد القباطنة إجابة صحيحة وربح مكافأة.'); }
    else room.news.push('لم يوفق أحد القباطنة في سؤال هذه الجولة.');
    p.correctAnswer = p.question.a[p.question.c];
    checkMission(room, p);
    if (room.players.every(x => x.answered)) startMarket(room);
  } else if (action === 'marketOrder') {
    if (room.phase !== 'market') return send(res, 409, { error: 'السوق مغلق' });
    const key = String(b.resource); ensureResource(key);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(b.quantity))));
    const side = b.side === 'sell' ? 'sell' : 'buy';
    const unit = side === 'buy' ? room.prices[key] : Math.floor(room.prices[key] * .78);
    if (side === 'buy') { if (p.cash < unit * qty) return send(res, 400, { error: 'الرصيد لا يكفي' }); p.cash -= unit * qty; p.res[key] += qty; }
    else { if (p.res[key] < qty) return send(res, 400, { error: 'الكمية غير متوفرة' }); p.res[key] -= qty; p.cash += unit * qty; }
    room.news.push(`نُفذ أمر ${side === 'buy' ? 'شراء' : 'بيع'} على ${resourceNames[key]} بكمية ${qty}.`);
    checkMission(room, p); checkReady(p);
  } else if (action === 'createTrade') {
    if (room.phase !== 'market') return send(res, 409, { error: 'المقايضة مغلقة' });
    const target = playerById(room, String(b.to));
    const give = String(b.give), want = String(b.want), giveQty = Math.max(1, Math.floor(Number(b.giveQty))), wantQty = Math.max(1, Math.floor(Number(b.wantQty)));
    ensureResource(give); ensureResource(want);
    if (!target || target.id === p.id || give === want) return send(res, 400, { error: 'العرض غير صحيح' });
    if (p.res[give] < giveQty) return send(res, 400, { error: 'لا تملك الكمية المعروضة' });
    room.trades.push({ id: uid(), from: p.id, fromName: p.name, to: target.id, give, giveQty, want, wantQty, status: 'pending', createdAt: Date.now() });
  } else if (action === 'respondTrade') {
    const trade = room.trades.find(x => x.id === b.tradeId && x.to === p.id && x.status === 'pending');
    if (!trade) return send(res, 404, { error: 'العرض غير موجود' });
    if (b.accept) {
      const sender = playerById(room, trade.from);
      if (!sender || sender.res[trade.give] < trade.giveQty || p.res[trade.want] < trade.wantQty) return send(res, 409, { error: 'تغيرت الموارد وتعذر تنفيذ الصفقة' });
      sender.res[trade.give] -= trade.giveQty; p.res[trade.give] += trade.giveQty;
      p.res[trade.want] -= trade.wantQty; sender.res[trade.want] += trade.wantQty;
      sender.deals++; p.deals++; trade.status = 'accepted'; room.news.push('تمت صفقة سرية بين قبطانين.');
      checkMission(room, sender); checkMission(room, p); checkReady(sender); checkReady(p);
    } else trade.status = 'rejected';
  } else if (action === 'stockOrder') {
    if (room.phase !== 'stocks') return send(res, 409, { error: 'البورصة مغلقة' });
    const key = String(b.resource); ensureResource(key);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(b.quantity))));
    const side = b.side === 'sell' ? 'sell' : 'buy', total = room.stockPrices[key] * qty;
    if (side === 'buy') { if (p.cash < total) return send(res, 400, { error: 'الرصيد لا يكفي' }); p.cash -= total; p.stocks[key] += qty; }
    else { if (p.stocks[key] < qty) return send(res, 400, { error: 'لا تملك الأسهم' }); p.stocks[key] -= qty; p.cash += total; }
    checkMission(room, p);
  } else return send(res, 400, { error: 'إجراء غير معروف' });
  return send(res, 200, view(room, t));
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, rooms: rooms.size });
    if (url.pathname === '/api/game' && req.method === 'POST') return await gameApi(req, res);
    if (url.pathname === '/api/qr') {
      const text = clean(url.searchParams.get('text'), 500);
      const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 280, color: { dark: '#08252d', light: '#ffffff' } });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' });
      return res.end(svg);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const safe = path.normalize(file).replace(/^\.\.(\/|\\)/, '');
    const data = await readFile(path.join(publicRoot, safe));
    res.writeHead(200, { 'Content-Type': types[path.extname(safe)] || 'application/octet-stream', 'Cache-Control': safe === 'index.html' ? 'no-store' : 'public, max-age=3600' });
    res.end(data);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, error.status || 500, { error: error.message || 'تعذر تشغيل اللعبة' });
  }
});

setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.createdAt < cutoff) rooms.delete(code);
}, 30 * 60 * 1000).unref();

server.listen(process.env.PORT || 3000, () => console.log('Oil Land online ready'));
