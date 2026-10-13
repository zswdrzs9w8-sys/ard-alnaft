import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
const rooms = new Map();
const uid = () => crypto.randomUUID();
const token = () => crypto.randomBytes(24).toString('hex');
const clean = (value, length = 24) => String(value ?? '').trim().slice(0, length);
const randomCode = () => crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
const resources = ['oil', 'gas', 'gold', 'iron'];
const resourceNames = { oil: 'النفط', gas: 'الغاز', gold: 'الذهب', iron: 'الحديد' };
const randomBetween = (min, max, step = 1) => min + crypto.randomInt(Math.floor((max - min) / step) + 1) * step;
const ships = [
  { id: 'energy', name: 'ناقلة الطاقة', need: { oil: 45, gas: 22, gold: 8, iron: 12 } },
  { id: 'treasure', name: 'سفينة الكنوز', need: { oil: 22, gas: 15, gold: 25, iron: 12 } },
  { id: 'industry', name: 'السفينة الصناعية', need: { oil: 30, gas: 20, gold: 14, iron: 32 } }
];
const missions = [
  { id: 'scholar', title: 'بطل الميناء', text: 'أنهِ تحدي الميناء بنجاح.', reward: '2,500 ريال + قطعتا ذهب + صندوق عشوائي' },
  { id: 'broker', title: 'شيخ السوق', text: 'أنجز صفقتين مع القباطنة.', reward: '3,000 ريال + وحدتا غاز + صندوق عشوائي' },
  { id: 'oilKing', title: 'ملك النفط', text: 'اجمع 18 برميل نفط.', reward: '2,500 ريال + 3 حديد + صندوق عشوائي' },
  { id: 'investor', title: 'المستثمر الخفي', text: 'امتلك 5 أسهم في وقت واحد.', reward: '3,000 ريال + برميلا نفط + صندوق عشوائي' }
];
const lands = [
  { name: 'صحراء الفجر', description: 'سهول رملية واسعة تشتهر بآبار النفط القريبة من السطح.' },
  { name: 'هضبة العنبر', description: 'هضبة صخرية غنية بالمعادن ويصعب الوصول إلى مكامنها.' },
  { name: 'جزيرة السارية', description: 'جزيرة تجارية تتوسط طرق السفن وحقول الغاز البحرية.' },
  { name: 'وادي النحاس', description: 'وادي قديم تحيط به مناجم الحديد والذهب من جهتين.' },
  { name: 'ساحل المرجان', description: 'ساحل هادئ يجمع بين مرفأ تصدير ومخزون نفطي واعد.' },
  { name: 'أرض السراب', description: 'منطقة غامضة؛ مواردها متقلبة لكن عوائدها قد تكون كبيرة.' },
  { name: 'ميناء الريح', description: 'ميناء سريع الحركة يخفض كلفة نقل الموارد إلى السوق.' },
  { name: 'خليج اللؤلؤ', description: 'خليج غني بالغاز والذهب ويجذب كبار المستثمرين.' },
  { name: 'هضبة النورس', description: 'مرتفعات ساحلية تحتوي على الحديد ومكامن نفط متوسطة.' },
  { name: 'جزيرة النحاس', description: 'جزيرة صناعية تجمع المعادن مع نقطة شحن استراتيجية.' },
  { name: 'ساحل الدانة', description: 'آخر الأراضي المعروضة، وميناؤها مناسب لتجميع الحمولة.' }
];

const challengeNames = {
  memory: 'ذاكرة الشحنة', order: 'رتّب الصناديق', estimate: 'التقدير السريع',
  price: 'السعر الصحيح', odd: 'الصندوق المختلف', deal: 'صفقة أو فخ'
};

function newPlayer(name, bot = false) {
  return {
    id: uid(), token: token(), name, bot, cash: 5000,
    res: { oil: 0, gas: 0, gold: 0, iron: 0 }, stocks: { oil: 0, gas: 0, gold: 0, iron: 0 },
    ship: null, shipNeed: null, mission: null, missionDone: false, missionRead: false, missionAssignedRound: 1, phaseDone: false,
    challengeWins: 0, deals: 0, connected: true, readyAt: null,
    challengeAnswer: null, challengeSuccess: false, challengeTime: null, challengeReward: 0, challengeRank: null,
    land: null, landIndex: null, landPrice: 0, lands: [], loot: null, auctionSeen: false, lastBox: null
  };
}

function createRoom() {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room = {
    code, hostToken: token(), phase: 'lobby', round: 1, difficulty: 'easy', players: [], createdAt: Date.now(), deadline: 0,
    prices: { oil: randomBetween(500, 800, 25), gas: randomBetween(650, 1050, 25), gold: randomBetween(1500, 2300, 50), iron: randomBetween(800, 1250, 25) },
    stockPrices: { oil: randomBetween(180, 340, 10), gas: randomBetween(220, 400, 10), gold: randomBetween(380, 650, 10), iron: randomBetween(250, 480, 10) },
    lastChanges: { oil: Number((Math.random() * 30 - 15).toFixed(1)), gas: Number((Math.random() * 30 - 15).toFixed(1)), gold: Number((Math.random() * 30 - 15).toFixed(1)), iron: Number((Math.random() * 30 - 15).toFixed(1)) },
    auction: null, challenge: null, trades: [], news: [], winner: null, message: 'بانتظار انضمام القباطنة'
  };
  rooms.set(code, room);
  return room;
}

function setPhase(room, name, seconds, message) {
  room.phase = name;
  room.deadline = seconds ? Date.now() + seconds * 1000 : 0;
  if (message) room.message = message;
}
function playerById(room, id) { return room.players.find(player => player.id === id); }
function all(room, predicate) { return room.players.length > 0 && room.players.every(predicate); }
function resetDone(room) { room.players.forEach(player => { player.phaseDone = false; }); }
function shipOptions(room) {
  const multiplier = room.difficulty === 'hard' ? 2 : 1;
  return ships.map(ship => ({ ...ship, need: Object.fromEntries(Object.entries(ship.need).map(([key, value]) => [key, value * multiplier])) }));
}
function assignShip(room, player, shipId) {
  const ship = shipOptions(room).find(item => item.id === shipId);
  if (!ship) return false;
  player.ship = ship.id; player.shipNeed = { ...ship.need };
  return true;
}

function assignMissions(room) {
  const shuffled = [...missions].sort(() => Math.random() - .5);
  room.players.forEach((player, index) => {
    player.mission = shuffled[index % shuffled.length];
    player.missionDone = false;
    player.missionRead = false;
    player.missionAssignedRound = room.round;
  });
}

function startGame(room) {
  assignMissions(room);
  setPhase(room, 'ship', 90, 'اختيار البواخر مفتوح؛ يبدأ المزاد عندما ينتهي الجميع');
}

function startAuction(room) {
  room.auction = { lands: lands.slice(0, 6), offers: [], results: [], resolved: false };
  room.players.forEach(player => {
    player.land = null; player.landIndex = null; player.landPrice = 0; player.lands = [];
    player.loot = null; player.auctionSeen = false; player.missionRead = false;
  });
  room.players.filter(player => player.bot).forEach(player => {
    const choices = [...Array(room.auction.lands.length).keys()].sort(() => Math.random() - .5).slice(0, crypto.randomInt(1, 4));
    for (const landIndex of choices) {
      const amount = Math.min(player.cash, 500 * crypto.randomInt(1, 4));
      if (amount < 500) break;
      player.cash -= amount;
      room.auction.offers.push({ playerId: player.id, amount, landIndex, at: Date.now() + crypto.randomInt(1000) });
    }
  });
  setPhase(room, 'auction', 30, 'أمامكم 30 ثانية لتوزيع عروضكم على الأراضي الست');
}
function grantLand(room, player, landIndex, amount) {
  const land = lands[landIndex];
  const loot = { oil: 3 + crypto.randomInt(8), gas: 2 + crypto.randomInt(6), gold: 1 + crypto.randomInt(4), iron: 2 + crypto.randomInt(7) };
  player.land = land.name; player.landIndex = landIndex; player.landPrice += amount;
  player.lands.push({ name: land.name, landIndex, amount, loot });
  player.loot = resources.reduce((total, key) => ({ ...total, [key]: (total[key] || 0) + loot[key] }), player.loot || {});
  resources.forEach(key => { player.res[key] += loot[key]; });
  room.auction.results.push({ playerId: player.id, name: player.name, landIndex, land: land.name, amount, loot });
  room.news.push(`رست ${land.name} على أحد القباطنة بقيمة ${amount} ريال.`);
  checkMission(room, player);
}
function finishAuction(room) {
  if (room.auction.resolved) return;
  room.auction.resolved = true;
  room.auction.lands.forEach((_, landIndex) => {
    const bids = room.auction.offers.filter(offer => offer.landIndex === landIndex).sort((a, b) => b.amount - a.amount || a.at - b.at);
    if (bids.length) grantLand(room, playerById(room, bids[0].playerId), landIndex, bids[0].amount);
    else room.auction.results.push({ landIndex, land: lands[landIndex].name, skipped: true });
  });
  room.players.forEach(player => { player.auctionSeen = !!player.bot; });
  setPhase(room, 'auctionResult', 60, 'كُشفت نتائج المزاد والموارد؛ اضغط «شاهدت النتائج» بعد مراجعتها');
}
function startMission(room) {
  room.players.forEach(player => { player.missionRead = !!player.bot; });
  setPhase(room, 'mission', 90, 'اقرأ مهمتك السرية واضغط «جاهز»؛ لن يبدأ تحدي الميناء حتى ينتهي الجميع');
}

function makeChallenge() {
  const type = Object.keys(challengeNames)[crypto.randomInt(6)];
  if (type === 'memory') {
    const oil = 3 + crypto.randomInt(7), gold = 1 + crypto.randomInt(5);
    return { type, title: challengeNames[type], prompt: `احفظ الشحنة: ${oil} نفط و${gold} ذهب`, instruction: 'اختر الشحنة المطابقة', options: [`${oil} نفط و${gold} ذهب`, `${oil+1} نفط و${gold} ذهب`, `${oil} نفط و${gold+1} ذهب`], correct: 0 };
  }
  if (type === 'order') return { type, title: challengeNames[type], prompt: 'رتّب الحمولات من الأخف إلى الأثقل', instruction: 'اختر الترتيب الصحيح', options: ['120 ← 350 ← 600', '350 ← 120 ← 600', '600 ← 350 ← 120'], correct: 0 };
  if (type === 'estimate') return { type, title: challengeNames[type], prompt: 'كم برميلًا ترى تقريبًا؟ 🛢️🛢️🛢️ 🛢️🛢️ 🛢️🛢️🛢️', instruction: 'اختر العدد الأقرب', options: ['6', '8', '11'], correct: 1 };
  if (type === 'price') return { type, title: challengeNames[type], prompt: 'سعر الحديد 1,000 وارتفع 20٪', instruction: 'اختر السعر الجديد', options: ['1,100', '1,200', '1,250'], correct: 1 };
  if (type === 'odd') return { type, title: challengeNames[type], prompt: 'اكتشف الصندوق المختلف', instruction: 'دقق جيدًا', options: ['📦', '📦', '🧰', '📦'], correct: 2 };
  return { type, title: challengeNames[type], prompt: 'أي صفقة تمنحك أعلى ربح؟', instruction: 'اختر الصفقة الأفضل', options: ['شراء 500 وبيع 700', 'شراء 800 وبيع 950', 'شراء 1,000 وبيع 1,120'], correct: 0 };
}
function startChallenge(room) {
  room.challenge = makeChallenge();
  room.players.forEach(player => { player.challengeAnswer=null; player.challengeSuccess=false; player.challengeTime=null; player.challengeReward=0; player.challengeRank=null; player.phaseDone=false; });
  room.players.filter(player => player.bot).forEach(player => {
    const success = Math.random() < (room.difficulty === 'hard' ? .55 : .72);
    player.challengeAnswer = success ? room.challenge.correct : (room.challenge.correct + 1) % room.challenge.options.length;
    player.challengeSuccess = success; player.challengeTime = 4500 + crypto.randomInt(15000);
  });
  setPhase(room, 'challenge', 30, 'تحدي الميناء بدأ للجميع؛ السرعة والدقة تحددان الترتيب');
}
function finishChallenge(room) {
  room.players.forEach(player => { if (player.challengeAnswer === null) { player.challengeSuccess=false; player.challengeTime=999999; } });
  const winners = room.players.filter(player => player.challengeSuccess).sort((a,b)=>a.challengeTime-b.challengeTime);
  winners.forEach((player,index) => {
    player.challengeRank=index+1;
    player.challengeReward=index===0?5000:index===1?3000:index===2?2000:1000;
    player.cash += player.challengeReward;
    if(index<3) openMysteryBox(room,player,'تحدي الميناء');
    player.challengeWins++;
    checkMission(room,player);
  });
  room.players.forEach(player => { player.phaseDone=!!player.bot; });
  setPhase(room,'challengeResult',0,'ظهرت نتائج تحدي الميناء؛ اضغط «جاهز» بعد مشاهدة ترتيبك');
}
function startMarket(room) {
  room.trades = [];
  resetDone(room);
  room.players.filter(player => player.bot).forEach(player => { player.phaseDone = true; });
  setPhase(room, 'market', 150, 'السوق مفتوح للجميع؛ اضغط «انتهيت» عند إكمال صفقاتك');
}
function startStocks(room) {
  resetDone(room);
  room.players.filter(player => player.bot).forEach(player => { player.phaseDone = true; });
  setPhase(room, 'stocks', 90, 'البورصة مفتوحة للجميع؛ اضغط «انتهيت» عند إكمال استثماراتك');
}
function startNews(room) {
  for (const key of resources) {
    const change = Number((Math.random() * 31 - 13.5).toFixed(1));
    room.lastChanges[key] = change;
    room.stockPrices[key] = Math.max(100, Math.round(room.stockPrices[key] * (1 + change / 100)));
    room.prices[key] = Math.max(350, Math.round(room.prices[key] * (1 + change / 180)));
  }
  const biggest = [...resources].sort((a, b) => Math.abs(room.lastChanges[b]) - Math.abs(room.lastChanges[a]))[0];
  room.news.push(`سهم ${resourceNames[biggest]} هو الأكثر حركة؛ ${room.lastChanges[biggest] >= 0 ? 'ارتفع' : 'انخفض'} بنسبة ${Math.abs(room.lastChanges[biggest]).toFixed(1)}%.`);
  room.players.forEach(player => { player.phaseDone = !!player.bot; });
  setPhase(room, 'news', 0, 'اقرأ نشرة أرض النفط ثم اضغط «جاهز للجولة التالية»');
}
function nextRound(room) {
  room.round++;
  room.news = [];
  room.players.forEach(player => {
    player.cash += 500; player.challengeAnswer = null; player.challengeSuccess = false;
    player.readyAt = null; player.phaseDone = false; player.missionRead = false;
  });
  if ((room.round - 1) % 2 === 0) assignMissions(room);
  startAuction(room);
}

function isShipComplete(player) {
  if (!player.ship || !player.shipNeed) return false;
  return resources.every(key => player.res[key] >= player.shipNeed[key]);
}
function checkReady(player) { if (isShipComplete(player) && !player.readyAt) player.readyAt = Date.now(); }
function openMysteryBox(room, player, source = 'السوق') {
  const roll = crypto.randomInt(100);
  let result;
  if (roll < 18) result = { type: 'empty', text: 'الصندوق فارغ… الحظ لم يحالفك هذه المرة!' };
  else if (roll < 38) { player.cash += 1500; result = { type: 'cash', text: 'وجدت 1,500 ريال داخل الصندوق!' }; }
  else if (roll < 58) { player.res.oil += 7; result = { type: 'oil', text: 'وجدت 7 براميل نفط!' }; }
  else if (roll < 75) { player.res.gas += 5; result = { type: 'gas', text: 'وجدت 5 وحدات غاز!' }; }
  else if (roll < 90) { player.res.iron += 5; result = { type: 'iron', text: 'وجدت 5 وحدات حديد!' }; }
  else { player.res.gold += 5; result = { type: 'gold', text: 'الجائزة الكبرى: 5 قطع ذهب!' }; }
  player.lastBox = { ...result, source, at: Date.now() };
  room.news.push(source === 'المهمة السرية' ? 'فاز أحد القباطنة بصندوق عشوائي بعد إنجاز مهمة سرية.' : 'خاطر أحد القباطنة واشترى صندوقًا عشوائيًا من السوق.');
  checkReady(player);
  return result;
}
function checkMission(room, player) {
  if (!player.mission || player.missionDone) return;
  const done = {
    scholar: player.challengeWins >= 1, broker: player.deals >= 2,
    oilKing: player.res.oil >= 18,
    investor: Object.values(player.stocks).reduce((sum, value) => sum + value, 0) >= 5
  }[player.mission.id];
  if (!done) return;
  player.missionDone = true;
  if (player.mission.id === 'scholar') { player.cash += 2500; player.res.gold += 2; }
  if (player.mission.id === 'broker') { player.cash += 3000; player.res.gas += 2; }
  if (player.mission.id === 'oilKing') { player.cash += 2500; player.res.iron += 3; }
  if (player.mission.id === 'investor') { player.cash += 3000; player.res.oil += 2; }
  openMysteryBox(room, player, 'المهمة السرية');
  room.news.push('أنجز أحد القباطنة مهمة سرية وحصل على مكافأة كبيرة.');
  checkReady(player);
}

function keepBotsReady(room) {
  for (const player of room.players.filter(item => item.bot)) {
    if (room.phase === 'ship' && !player.ship) assignShip(room, player, ships[crypto.randomInt(ships.length)].id);
    if (room.phase === 'auctionResult') player.auctionSeen = true;
    if (room.phase === 'mission') player.missionRead = true;
    if (room.phase === 'challenge' && player.challengeAnswer === null) {
      const success = Math.random() < (room.difficulty === 'hard' ? .55 : .72);
      player.challengeAnswer = success ? room.challenge.correct : (room.challenge.correct + 1) % room.challenge.options.length;
      player.challengeSuccess = success;
      player.challengeTime = 4500 + crypto.randomInt(15000);
    }
    if (['challengeResult', 'market', 'stocks', 'news'].includes(room.phase)) player.phaseDone = true;
  }
  if (room.phase === 'ship' && all(room, player => !!player.ship)) return startAuction(room);
  if (room.phase === 'auctionResult' && all(room, player => player.auctionSeen)) return startMission(room);
  if (room.phase === 'mission' && all(room, player => player.missionRead)) return startChallenge(room);
  if (room.phase === 'challenge' && all(room, player => player.challengeAnswer !== null)) return finishChallenge(room);
  if (room.phase === 'challengeResult' && all(room, player => player.phaseDone)) return startMarket(room);
  if (room.phase === 'market' && all(room, player => player.phaseDone)) return startStocks(room);
  if (room.phase === 'stocks' && all(room, player => player.phaseDone)) return startNews(room);
  if (room.phase === 'news' && all(room, player => player.phaseDone)) return nextRound(room);
}

function tick(room) {
  keepBotsReady(room);
  if (!room.deadline || Date.now() < room.deadline) return;
  if (room.phase === 'ship') return;
  if (room.phase === 'auction') return finishAuction(room);
  if (room.phase === 'auctionResult') return;
  if (room.phase === 'mission') return;
  if (room.phase === 'challenge') return finishChallenge(room);
  if (room.phase === 'market' || room.phase === 'stocks') return;
}

function publicPlayer(player) {
  return {
    id: player.id, name: player.name, bot: player.bot, connected: player.connected,
    shipChosen: !!player.ship, hasLand: player.lands.length > 0, land: player.land, landCount: player.lands.length,
    auctionSeen: !!player.auctionSeen,
    missionRead: !!player.missionRead, challengeDone: player.challengeAnswer !== null,
    stageDone: !!player.phaseDone, ready: !!player.readyAt
  };
}
function view(room, accessToken) {
  tick(room);
  const host = accessToken === room.hostToken;
  const player = room.players.find(item => item.token === accessToken);
  const me = player ? {
    id: player.id, name: player.name, cash: player.cash, res: player.res, stocks: player.stocks,
    ship: player.ship, mission: ['ship', 'auction'].includes(room.phase) ? null : player.mission,
    missionDone: player.missionDone, missionRead: player.missionRead,
    loot: player.loot, land: player.land, lands: player.lands, landPrice: player.landPrice, auctionSeen: player.auctionSeen,
    shipComplete: isShipComplete(player), lastBox: player.lastBox,
    challengeDone: player.challengeAnswer !== null, challengeSuccess: player.challengeSuccess,
    challengeTime: player.challengeTime, challengeReward: player.challengeReward, challengeRank: player.challengeRank,
    stageDone: player.phaseDone,
    incomingTrades: room.trades.filter(trade => trade.to === player.id && trade.status === 'pending'),
    outgoingTrades: room.trades.filter(trade => trade.from === player.id && trade.status === 'pending')
  } : null;
  const auction = room.auction ? {
    lands: room.auction.lands,
    offers: room.auction.offers.filter(offer => offer.playerId === player?.id),
    results: room.auction.results
  } : null;
  const finalStandings = room.phase === 'finished' ? room.players.map(item => {
    const ship = ships.find(candidate => candidate.id === item.ship);
    const need = item.shipNeed || ship?.need;
    const totalNeed = resources.reduce((sum, key) => sum + (need?.[key] || 0), 0);
    const loaded = resources.reduce((sum, key) => sum + Math.min(item.res[key], need?.[key] || 0), 0);
    return { id: item.id, name: item.name, ship: ship?.name, res: item.res, need, progress: totalNeed ? Math.round(loaded / totalNeed * 100) : 0 };
  }).sort((a, b) => b.progress - a.progress) : [];
  return {
    code: room.code, host, phase: room.phase, round: room.round, deadline: room.deadline,
    message: room.message, players: room.players.map(publicPlayer), prices: room.prices,
    stockPrices: room.stockPrices, lastChanges: room.lastChanges, ships: shipOptions(room), difficulty: room.difficulty, auction,
    challenge: room.challenge ? { type:room.challenge.type,title:room.challenge.title,prompt:room.challenge.prompt,instruction:room.challenge.instruction,options:room.challenge.options } : null,
    news: room.news.slice(-8), winner: room.winner, finalStandings, me,
  };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function parseBody(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw Error('too large'); }
  return raw ? JSON.parse(raw) : {};
}
function requirePlayer(room, accessToken) {
  const player = room.players.find(item => item.token === accessToken);
  if (!player) throw Object.assign(Error('رمز اللاعب غير صحيح'), { status: 403 });
  return player;
}
function ensureResource(key) { if (!resources.includes(key)) throw Object.assign(Error('المورد غير صحيح'), { status: 400 }); }

async function gameApi(req, res) {
  const body = await parseBody(req);
  const action = clean(body.action, 30);
  if (action === 'create') {
    const name = clean(body.name);
    if (!name) return send(res, 400, { error: 'اكتب اسم القبطان' });
    const room = createRoom();
    const creator = newPlayer(name);
    room.hostToken = creator.token;
    room.players.push(creator);
    return send(res, 201, { code: room.code, token: creator.token, state: view(room, creator.token) });
  }
  if (action === 'demo') {
    const room = createRoom();
    room.difficulty = body.difficulty === 'hard' ? 'hard' : 'easy';
    const human = newPlayer('القبطان التجريبي');
    room.hostToken = human.token;
    room.players.push(human, newPlayer('القبطان شاهين', true), newPlayer('القبطان نوخذة', true), newPlayer('القبطان مرجان', true));
    startGame(room);
    room.players.filter(player => player.bot).forEach((player, index) => { assignShip(room, player, ships[index % ships.length].id); });
    return send(res, 201, { code: room.code, token: human.token, state: view(room, human.token) });
  }
  const code = clean(body.code, 5).toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(res, 404, { error: 'الغرفة غير موجودة أو أُغلقت' });
  tick(room);
  const accessToken = clean(body.token, 64);
  const host = accessToken === room.hostToken;
  if (action === 'join') {
    if (room.phase !== 'lobby') return send(res, 409, { error: 'بدأت اللعبة بالفعل' });
    if (room.players.length >= 10) return send(res, 409, { error: 'اكتمل عدد القباطنة' });
    const name = clean(body.name);
    if (!name) return send(res, 400, { error: 'اكتب اسم القبطان' });
    if (room.players.some(player => player.name === name)) return send(res, 409, { error: 'الاسم مستخدم' });
    const player = newPlayer(name);
    room.players.push(player);
    room.message = `انضم القبطان ${name}`;
    return send(res, 201, { token: player.token, state: view(room, player.token) });
  }
  if (action === 'state') return send(res, 200, view(room, accessToken));
  if (action === 'start') {
    if (!host) return send(res, 403, { error: 'البدء للمضيف فقط' });
    if (room.players.length < 2) return send(res, 400, { error: 'يلزم قبطانان على الأقل' });
    startGame(room);
    return send(res, 200, view(room, accessToken));
  }
  if (action === 'setDifficulty') {
    if (!host || room.phase !== 'lobby') return send(res, 403, { error: 'تغيير الصعوبة متاح للمضيف قبل البدء فقط' });
    room.difficulty = body.difficulty === 'hard' ? 'hard' : 'easy';
    room.message = room.difficulty === 'hard' ? 'تم اختيار المستوى الصعب: متطلبات البواخر مضاعفة' : 'تم اختيار المستوى السهل: متطلبات البواخر الأساسية';
    return send(res, 200, view(room, accessToken));
  }
  if (action === 'advance') {
    return send(res, 403, { error: 'لا يمكن تجاوز المراحل؛ انتظر جاهزية الجميع أو انتهاء الوقت' });
  }

  const player = requirePlayer(room, accessToken);
  if (action === 'chooseShip') {
    if (room.phase !== 'ship' || player.ship || !ships.some(ship => ship.id === body.ship)) return send(res, 409, { error: 'اختيار الباخرة غير متاح' });
    assignShip(room, player, body.ship);
    if (all(room, item => !!item.ship)) startAuction(room);
  } else if (action === 'bid') {
    if (room.phase !== 'auction') return send(res, 409, { error: 'المزاد مغلق الآن' });
    const landIndex = Math.floor(Number(body.landIndex));
    if (landIndex < 0 || landIndex >= room.auction.lands.length) return send(res, 400, { error: 'اختر أرضًا صحيحة' });
    if (room.auction.offers.some(offer => offer.playerId === player.id && offer.landIndex === landIndex)) return send(res, 409, { error: 'أكدت عرضك على هذه الأرض بالفعل' });
    const amount = Math.floor(Number(body.amount) / 500) * 500;
    if (amount < 500 || amount > player.cash) return send(res, 400, { error: 'العرض يبدأ من 500 ريال ويجب أن يغطيه رصيدك' });
    player.cash -= amount;
    const bid = { playerId: player.id, amount, landIndex, at: Date.now() };
    room.auction.offers.push(bid);
    room.message = 'المزاد السري مستمر؛ تُحسم الأراضي عند انتهاء العداد';
  } else if (action === 'auctionSeen') {
    if (room.phase !== 'auctionResult') return send(res, 409, { error: 'نتائج المزاد غير متاحة الآن' });
    player.auctionSeen = true;
    if (all(room, item => item.auctionSeen)) startMission(room);
  } else if (action === 'missionRead') {
    if (room.phase !== 'mission') return send(res, 409, { error: 'مرحلة المهمة انتهت' });
    player.missionRead = true;
    if (all(room, item => item.missionRead)) startChallenge(room);
  } else if (action === 'challengeAnswer') {
    if (room.phase !== 'challenge' || player.challengeAnswer !== null) return send(res, 409, { error: 'انتهى تحديك' });
    const index = Math.floor(Number(body.index));
    if (index < 0 || index >= room.challenge.options.length) return send(res, 400, { error: 'اختر إجابة صحيحة' });
    player.challengeAnswer=index;
    player.challengeSuccess=index===room.challenge.correct;
    player.challengeTime=Math.max(1,Date.now()-(room.deadline-30000));
    if(all(room,item=>item.challengeAnswer!==null)) finishChallenge(room);
  } else if (action === 'readyPhase') {
    if (!['challengeResult','news'].includes(room.phase)) return send(res,409,{error:'لا يوجد زر جاهز في هذه المرحلة'});
    player.phaseDone=true;
    if(all(room,item=>item.phaseDone)) {
      if(room.phase==='challengeResult') startMarket(room); else nextRound(room);
    }
  } else if (action === 'finishPhase') {
    if (!['market', 'stocks'].includes(room.phase)) return send(res, 409, { error: 'لا يوجد إنهاء في هذه المرحلة' });
    player.phaseDone = true;
    if (all(room, item => item.phaseDone)) {
      if (room.phase === 'market') startStocks(room); else startNews(room);
    }
  } else if (action === 'marketOrder') {
    if (room.phase !== 'market' || player.phaseDone) return send(res, 409, { error: 'أنهيت دورك في السوق' });
    const key = String(body.resource); ensureResource(key);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(body.quantity))));
    const side = body.side === 'sell' ? 'sell' : 'buy';
    const unit = side === 'buy' ? room.prices[key] : Math.floor(room.prices[key] * .78);
    if (side === 'buy') {
      if (player.cash < unit * quantity) return send(res, 400, { error: 'الرصيد لا يكفي' });
      player.cash -= unit * quantity; player.res[key] += quantity;
    } else {
      if (player.res[key] < quantity) return send(res, 400, { error: 'الكمية غير متوفرة' });
      player.res[key] -= quantity; player.cash += unit * quantity;
    }
    room.news.push(`نُفذ أمر ${side === 'buy' ? 'شراء' : 'بيع'} على ${resourceNames[key]} بكمية ${quantity}.`);
    checkMission(room, player); checkReady(player);
  } else if (action === 'buyBox') {
    if (room.phase !== 'market' || player.phaseDone) return send(res, 409, { error: 'الصندوق متاح في السوق فقط' });
    if (player.cash < 2000) return send(res, 400, { error: 'تحتاج إلى 2,000 ريال لشراء الصندوق' });
    player.cash -= 2000;
    openMysteryBox(room, player, 'السوق');
  } else if (action === 'createTrade') {
    if (room.phase !== 'market' || player.phaseDone) return send(res, 409, { error: 'المقايضة مغلقة لك' });
    const target = playerById(room, String(body.to));
    const give = String(body.give), want = String(body.want);
    const giveQty = Math.max(1, Math.floor(Number(body.giveQty))), wantQty = Math.max(1, Math.floor(Number(body.wantQty)));
    ensureResource(give); ensureResource(want);
    if (!target || target.id === player.id || target.phaseDone || give === want) return send(res, 400, { error: 'العرض غير صحيح' });
    if (player.res[give] < giveQty) return send(res, 400, { error: 'لا تملك الكمية المعروضة' });
    room.trades.push({ id: uid(), from: player.id, fromName: player.name, to: target.id, give, giveQty, want, wantQty, status: 'pending', createdAt: Date.now() });
  } else if (action === 'respondTrade') {
    if (room.phase !== 'market' || player.phaseDone) return send(res, 409, { error: 'المقايضة مغلقة لك' });
    const trade = room.trades.find(item => item.id === body.tradeId && item.to === player.id && item.status === 'pending');
    if (!trade) return send(res, 404, { error: 'العرض غير موجود' });
    if (body.accept) {
      const sender = playerById(room, trade.from);
      if (!sender || sender.res[trade.give] < trade.giveQty || player.res[trade.want] < trade.wantQty) return send(res, 409, { error: 'تغيرت الموارد وتعذر تنفيذ الصفقة' });
      sender.res[trade.give] -= trade.giveQty; player.res[trade.give] += trade.giveQty;
      player.res[trade.want] -= trade.wantQty; sender.res[trade.want] += trade.wantQty;
      sender.deals++; player.deals++; trade.status = 'accepted'; room.news.push('تمت صفقة سرية بين قبطانين.');
      checkMission(room, sender); checkMission(room, player); checkReady(sender); checkReady(player);
    } else trade.status = 'rejected';
  } else if (action === 'stockOrder') {
    if (room.phase !== 'stocks' || player.phaseDone) return send(res, 409, { error: 'أنهيت دورك في البورصة' });
    const key = String(body.resource); ensureResource(key);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(body.quantity))));
    const side = body.side === 'sell' ? 'sell' : 'buy';
    const total = room.stockPrices[key] * quantity;
    if (side === 'buy') {
      if (player.cash < total) return send(res, 400, { error: 'الرصيد لا يكفي' });
      player.cash -= total; player.stocks[key] += quantity;
    } else {
      if (player.stocks[key] < quantity) return send(res, 400, { error: 'لا تملك الأسهم' });
      player.stocks[key] -= quantity; player.cash += total;
    }
    checkMission(room, player);
  } else if (action === 'sendShip') {
    if (!isShipComplete(player)) return send(res, 409, { error: 'لم تكتمل جميع متطلبات الباخرة بعد' });
    player.readyAt = Date.now();
    room.winner = player.id;
    room.deadline = 0;
    setPhase(room, 'finished', 0, `فاز القبطان ${player.name}`);
  } else return send(res, 400, { error: 'إجراء غير معروف' });
  return send(res, 200, view(room, accessToken));
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
    const data = await readFile(path.join(root, safe));
    res.writeHead(200, { 'Content-Type': types[path.extname(safe)] || 'application/octet-stream', 'Cache-Control': safe === 'index.html' ? 'no-store' : 'public, max-age=120' });
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
