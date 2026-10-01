const $ = (selector) => document.querySelector(selector);
const app = $('#app');

const R = {
  oil: { n: 'النفط', i: '🛢️' },
  gas: { n: 'الغاز', i: '🔥' },
  gold: { n: 'الذهب', i: '🪙' },
  iron: { n: 'الحديد', i: '⚙️' }
};

const ships = [
  { id: 'energy', name: 'ناقلة الطاقة', desc: 'عملاقة تعتمد على النفط والغاز، وتحتاج إدارة طويلة النفس.', need: { oil: 45, gas: 22, gold: 8, iron: 12 } },
  { id: 'treasure', name: 'سفينة الكنوز', desc: 'تطارد الذهب النادر، ولذلك تتطلب تجارة ومفاوضات ذكية.', need: { oil: 22, gas: 15, gold: 25, iron: 12 } },
  { id: 'industry', name: 'السفينة الصناعية', desc: 'حمولة ضخمة ومتوازنة لمحبي تنويع الاستثمار.', need: { oil: 30, gas: 20, gold: 14, iron: 32 } }
];

const questions = QUESTION_BANK;

const missionDefs = [
  { id: 'scholar', title: 'العقل الجريء', text: 'أجب عن سؤال متوسط أو صعب إجابة صحيحة.', reward: '2,500 ريال + قطعتا ذهب' },
  { id: 'broker', title: 'شيخ السوق', text: 'أنجز صفقتين في مجلس القباطنة.', reward: '3,000 ريال + وحدتا غاز' },
  { id: 'oilKing', title: 'ملك النفط', text: 'اجمع 18 برميل نفط في مستودعك.', reward: '2,500 ريال + 3 حديد' },
  { id: 'investor', title: 'المستثمر الخفي', text: 'امتلك 5 أسهم في وقت واحد.', reward: '3,000 ريال + برميلا نفط' }
];

let state = {
  name: '', cash: 5000, round: 1, ship: null,
  res: { oil: 0, gas: 0, gold: 0, iron: 0 },
  prices: { oil: 650, gas: 850, gold: 1900, iron: 1000 },
  stocks: { oil: 0, gas: 0, gold: 0, iron: 0 },
  stockPrices: { oil: 250, gas: 300, gold: 500, iron: 350 },
  selected: null, bid: 500, land: null, news: [], correct: 0, wrong: 0,
  advancedCorrect: 0, deals: 0, mission: null, missionDone: false,
  offers: [], lastChanges: { oil: -13.4, gas: 6.8, gold: 2.1, iron: -4.7 },
  auctionOrder: [], auctionTurn: 0, auctionOffers: [], order: null
};

let stageInterval = null;
let stageDeadline = 0;
let stageLabel = '';
let stageCallback = null;
let actionLocked = false;
let activeQuestion = null;
let activePrize = 0;
let activeLevel = '';
let newsInterval = null;
let auctionBotTimeout = null;

function fmt(value) { return new Intl.NumberFormat('ar-SA').format(value); }

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function secondsLeft() {
  return stageDeadline ? Math.max(0, Math.ceil((stageDeadline - Date.now()) / 1000)) : '--';
}

function stopClock() {
  clearInterval(stageInterval);
  stageInterval = null;
  stageDeadline = 0;
  stageCallback = null;
}

function startClock(seconds, label, callback) {
  clearInterval(stageInterval);
  stageLabel = label;
  stageCallback = callback;
  stageDeadline = Date.now() + seconds * 1000;
  updateClock();
  stageInterval = setInterval(() => {
    updateClock();
    if (Date.now() >= stageDeadline) {
      const next = stageCallback;
      stopClock();
      if (next) next();
    }
  }, 250);
}

function updateClock() {
  const value = $('#stageTimer');
  const label = $('#stageLabel');
  if (value) value.textContent = secondsLeft();
  if (label) label.textContent = stageLabel || 'وقت المرحلة';
  const ring = $('.clock-ring');
  if (ring && Number(secondsLeft()) <= 10) ring.classList.add('danger');
}

function shell(content, background = '') {
  const tools = state.ship ? `<div class="side-tools"><button onclick="openShip()">🚢<span>باخرتي</span></button><button onclick="openMission()">🎯<span>مهمتي</span></button></div>` : '';
  app.innerHTML = `<div class="screen"><div class="noise"></div>${background}
    <div class="topbar"><div class="logo">أرض النفط</div><div class="stats">
      <div class="pill">الجولة <b>${state.round}</b></div><div class="pill">الرصيد <b>${fmt(state.cash)}</b></div>
      ${Object.entries(state.res).map(([key, value]) => `<div class="pill">${R[key].i}<b>${value}</b></div>`).join('')}
      ${state.ship ? `<div class="clock-ring"><small id="stageLabel">${stageLabel || 'وقت المرحلة'}</small><b id="stageTimer">${secondsLeft()}</b></div>` : ''}
    </div></div>${tools}<main class="main">${content}</main><div id="overlay" class="overlay" onclick="overlayClick(event)"></div></div>`;
}

function overlayClick(event) { if (event.target.id === 'overlay') closeOverlay(); }
function closeOverlay() { const overlay = $('#overlay'); if (overlay) overlay.classList.remove('open'); }

function openShip() {
  if (!state.ship) return;
  const content = Object.entries(state.ship.need).map(([key, need]) => {
    const have = state.res[key];
    const left = Math.max(0, need - have);
    const progress = Math.min(100, Math.round(have / need * 100));
    return `<div class="cargo-line"><div><b>${R[key].i} ${R[key].n}</b><span>${have} من ${need} — المتبقي ${left}</span></div><div class="progress"><i style="width:${progress}%"></i></div></div>`;
  }).join('');
  const overlay = $('#overlay');
  overlay.innerHTML = `<div class="modal"><button class="modal-close" onclick="closeOverlay()">×</button><span class="step">لوحة الحمولة</span><h2>${state.ship.name}</h2><p>لا تُحمّل الباخرة إلا بعد اكتمال جميع الموارد.</p>${content}<div class="completion">نسبة الجاهزية <b>${shipProgress()}%</b></div></div>`;
  overlay.classList.add('open');
}

function openMission() {
  if (!state.mission) return;
  const overlay = $('#overlay');
  overlay.innerHTML = `<div class="modal mission-modal"><button class="modal-close" onclick="closeOverlay()">×</button><div class="mission-seal">${state.missionDone ? '✓' : '؟'}</div><span class="step">${state.missionDone ? 'تم إنجاز المهمة' : 'سري للغاية'}</span><h2>${state.mission.title}</h2><p>${state.mission.text}</p><div class="reward">المكافأة: <b>${state.mission.reward}</b></div></div>`;
  overlay.classList.add('open');
}

function shipProgress() {
  if (!state.ship) return 0;
  const ratios = Object.keys(state.ship.need).map(key => Math.min(1, state.res[key] / state.ship.need[key]));
  return Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100);
}

function home() {
  stopClock();
  app.innerHTML = `<div class="screen"><div class="noise"></div><div class="hero"><div class="brand"><small>لعبة التجارة والاستراتيجية</small><h1>أرض<br>النفط</h1><p>زايد على الأراضي، اكتشف الموارد، راقب الأسواق، وكن أول قبطان يطلق باخرته نحو المجد.</p><div class="join-box"><input id="name" class="input" maxlength="18" placeholder="اكتب اسم القبطان"><button class="btn" onclick="join()">دخول اللوبي التجريبي</button><span class="demo-note">نسخة اللاعب الواحد: ثلاثة قباطنة آليين سيحاكون المنافسة.</span></div></div><div class="hero-art"></div></div></div>`;
}

function join() { state.name = $('#name').value.trim() || 'القبطان'; lobby(); }

function lobby() {
  shell(`<section class="reveal"><span class="step">اللوبي التجريبي</span><h2>اكتمل طاقم السباق</h2><p>أنت اللاعب الحقيقي، ومعك ثلاثة قباطنة آليين لاختبار المنافسة.</p><div class="grid resources"><div class="resource"><i>🧭</i><b>${state.name}</b><small>أنت</small></div><div class="resource"><i>🤖</i><b>النوخذة</b><small>متصل</small></div><div class="resource"><i>🤖</i><b>الربّان</b><small>متصل</small></div><div class="resource"><i>🤖</i><b>البحّار</b><small>متصل</small></div></div><button class="btn" onclick="chooseShip()">ابدأ اللعبة</button></section>`);
}

function chooseShip() {
  shell(`<div class="stage-head"><div><span class="step">الخطوة الأولى</span><h2>اختر باخرتك السرية</h2><p>اختيارك نهائي، والمتطلبات أصبحت أصعب وتحتاج تخطيطًا طويلًا.</p></div></div><div class="grid ships">${ships.map((ship, index) => `<article class="card"><div class="ship-img s${index + 1}"></div><div class="card-body"><h3>${ship.name}</h3><p>${ship.desc}</p><div class="requirements">${Object.entries(ship.need).map(([key, value]) => `<div class="req"><span>${R[key].i}</span>${value} ${R[key].n}</div>`).join('')}</div><button class="btn" onclick="pickShip('${ship.id}')">اختيار الباخرة</button></div></article>`).join('')}</div>`);
  startClock(60, 'اختيار الباخرة', () => pickShip('industry'));
}

function pickShip(id) {
  stopClock();
  state.ship = ships.find(ship => ship.id === id);
  state.mission = missionDefs[Math.floor(Math.random() * missionDefs.length)];
  toast(`تم اختيار ${state.ship.name}`);
  setTimeout(openMissionIntro, 500);
}

function openMissionIntro() {
  shell(`<section class="reveal"><div class="mission-seal">؟</div><span class="step">مهمتك السرية</span><h2>${state.mission.title}</h2><p>${state.mission.text}</p><div class="reward">عند الإنجاز: <b>${state.mission.reward}</b></div><button class="btn" onclick="startRound()">حفظ المهمة وبدء السباق</button></section>`);
  startClock(30, 'قراءة المهمة', startRound);
}

const landNames = ['صحراء الفجر', 'هضبة العنبر', 'جزيرة السارية', 'وادي النحاس', 'ساحل المرجان', 'أرض السراب', 'ميناء الريح'];

function startRound() {
  stopClock();
  if (state.round > 1) {
    state.cash += 500;
    state.news.push('حصل جميع القباطنة على دعم بداية الجولة بقيمة 500 ريال.');
    toast('دعم بداية الجولة: +500 ريال');
  }
  auction();
}

function auction() {
  actionLocked = false;
  state.selected = null;
  state.bid = 500;
  state.auctionTurn = 0;
  state.auctionOffers = [];
  const baseOrder = [{ name: state.name, human: true }, { name: 'النوخذة' }, { name: 'الربّان' }, { name: 'البحّار' }];
  const shift = (state.round - 1) % baseOrder.length;
  state.auctionOrder = [...baseOrder.slice(shift), ...baseOrder.slice(0, shift)];
  renderAuction();
  startClock(90, 'أدوار المزاد', forceFinishAuction);
}

function currentBidder() { return state.auctionOrder[state.auctionTurn]; }

function renderAuction() {
  clearTimeout(auctionBotTimeout);
  const bidder = currentBidder();
  const lands = landNames.slice(0, 5).map((name, index) => {
    const bids = state.auctionOffers.filter(offer => offer.landIndex === index);
    return `<article class="card land ${state.selected === index ? 'selected' : ''}" id="land${index}" onclick="selectLand(${index},'${name}')"><span class="step">قطعة ${index + 1}</span><h3>${name}</h3><p>الموارد مخفية حتى حسم العروض</p><div class="land-bidders">${bids.length ? bids.map(offer => `<span>${offer.name}<b>${fmt(offer.amount)}</b></span>`).join('') : '<small>لم يخترها أحد</small>'}</div></article>`;
  }).join('');
  const lineup = state.auctionOrder.map((player, index) => `<div class="turn-player ${index === state.auctionTurn ? 'active' : ''} ${index < state.auctionTurn ? 'done' : ''}"><i>${player.human ? '🧭' : '⚓'}</i><span>${player.name}</span></div>`).join('');
  const humanControls = bidder && bidder.human ? `<div class="bid-panel"><div><small>عرضك على الأرض المختارة</small><div class="bid-price" id="bidPrice">${fmt(state.bid)}</div><div id="bidMsg">${state.selected === null ? 'اختر أرضًا أولًا' : state.land}</div></div><div class="bid-actions"><button class="btn secondary" onclick="raise(-500)">− 500</button><button class="btn secondary" onclick="raise(500)">+ 500</button><button class="btn secondary" onclick="raise(1000)">+ 1,000</button><button class="btn" id="deal" ${state.selected === null ? 'disabled' : ''} onclick="confirmBid()">تثبيت العرض</button></div></div>` : `<div class="bid-panel bot-turn"><div><small>الدور الآن على</small><div class="bid-price">${bidder ? bidder.name : 'حسم النتائج'}</div><div>يفكر في الأرض والسعر المناسبين…</div></div><div class="thinking-dots"><i></i><i></i><i></i></div></div>`;
  shell(`<div class="stage-head"><div><span class="step">مزاد بالدور</span><h2>اختر الأرض وحدد عرضك</h2><p>قد يختار أكثر من قبطان الأرض نفسها، وتحسم بأعلى مبلغ.</p></div></div><div class="turn-lineup">${lineup}</div><div class="grid lands">${lands}</div>${humanControls}`, `<div class="lands-bg"></div>`);
  if (bidder && !bidder.human) auctionBotTimeout = setTimeout(botBid, 1100);
}

function selectLand(index, name) {
  const bidder = currentBidder();
  if (!bidder || !bidder.human) return toast(`الدور الآن على ${bidder ? bidder.name : 'الحسم'}`);
  document.querySelectorAll('.land').forEach(el => el.classList.remove('selected'));
  $('#land' + index).classList.add('selected');
  state.selected = index;
  state.land = name;
  $('#bidPrice').textContent = fmt(state.bid);
  $('#bidMsg').textContent = name;
  $('#deal').disabled = false;
}

function raise(amount) {
  if (state.selected === null) return toast('اختر أرضًا أولًا');
  const next = Math.max(500, state.bid + amount);
  if (state.cash < next) return toast('رصيدك لا يكفي');
  state.bid = next;
  $('#bidPrice').textContent = fmt(state.bid);
}

function confirmBid() {
  const bidder = currentBidder();
  if (!bidder || !bidder.human || state.selected === null) return;
  if (state.cash < state.bid) return toast('رصيدك لا يكفي');
  state.auctionOffers.push({ name: bidder.name, human: true, landIndex: state.selected, land: state.land, amount: state.bid, order: state.auctionTurn });
  nextAuctionTurn();
}

function botBid() {
  const bidder = currentBidder();
  if (!bidder || bidder.human) return;
  const counts = landNames.slice(0, 5).map((_, index) => state.auctionOffers.filter(offer => offer.landIndex === index).length);
  const minimum = Math.min(...counts);
  const candidates = counts.map((count, index) => count === minimum ? index : -1).filter(index => index >= 0);
  let landIndex = candidates[Math.floor(Math.random() * candidates.length)];
  if (Math.random() < .3 && state.auctionOffers.length) landIndex = state.auctionOffers[Math.floor(Math.random() * state.auctionOffers.length)].landIndex;
  const amount = (1 + Math.floor(Math.random() * 5)) * 500;
  state.auctionOffers.push({ name: bidder.name, human: false, landIndex, land: landNames[landIndex], amount, order: state.auctionTurn });
  nextAuctionTurn();
}

function nextAuctionTurn() {
  state.auctionTurn++;
  state.selected = null;
  state.bid = 500;
  if (state.auctionTurn >= state.auctionOrder.length) resolveAuction();
  else renderAuction();
}

function forceFinishAuction() {
  clearTimeout(auctionBotTimeout);
  while (state.auctionTurn < state.auctionOrder.length) {
    const bidder = currentBidder();
    const index = Math.floor(Math.random() * 5);
    state.auctionOffers.push({ name: bidder.name, human: !!bidder.human, landIndex: index, land: landNames[index], amount: 500, order: state.auctionTurn });
    state.auctionTurn++;
  }
  resolveAuction();
}

function resolveAuction() {
  stopClock();
  clearTimeout(auctionBotTimeout);
  const winners = [];
  for (let index = 0; index < 5; index++) {
    const bids = state.auctionOffers.filter(offer => offer.landIndex === index).sort((a, b) => b.amount - a.amount || a.order - b.order);
    if (bids[0]) winners.push(bids[0]);
  }
  const humanOffer = state.auctionOffers.find(offer => offer.human);
  const humanWinner = winners.find(offer => offer.human);
  const resultCards = winners.map(winner => `<div class="auction-result ${winner.human ? 'mine' : ''}"><span>${winner.land}</span><b>${winner.name}</b><small>${fmt(winner.amount)} ريال</small></div>`).join('');
  if (humanWinner) {
    shell(`<section class="reveal auction-resolution"><span class="step">نتائج المزاد</span><h2>رست عليك الأرض!</h2><div class="auction-results">${resultCards}</div><button class="btn" onclick="finalizeLand('${humanWinner.land}',${humanWinner.amount})">استلام الأرض وكشف مواردها</button></section>`, `<div class="lands-bg"></div>`);
  } else {
    const wonIndexes = winners.map(winner => winner.landIndex);
    const remaining = landNames.slice(0, 5).map((name, index) => ({ name, index })).filter(land => !wonIndexes.includes(land.index));
    const fallback = remaining.length ? remaining : landNames.slice(0, 5).map((name, index) => ({ name, index }));
    shell(`<section class="reveal auction-resolution"><span class="step">نتائج المزاد</span><h2>تمت المزايدة على عرضك</h2><p>عرضك على ${humanOffer ? humanOffer.land : 'الأرض'} لم يكن الأعلى. اختر أرضًا متبقية بسعر التعويض 500.</p><div class="auction-results">${resultCards}</div><div class="fallback-lands">${fallback.map(land => `<button class="btn secondary" onclick="finalizeLand('${land.name}',500)">${land.name} — 500</button>`).join('')}</div></section>`, `<div class="lands-bg"></div>`);
  }
}

function finalizeLand(landName, price) {
  if (actionLocked) return;
  if (state.cash < price) return toast('رصيدك لا يكفي');
  actionLocked = true;
  stopClock();
  state.land = landName;
  state.bid = price;
  state.cash -= price;
  const loot = { oil: 3 + Math.floor(Math.random() * 8), gas: 2 + Math.floor(Math.random() * 6), gold: 1 + Math.floor(Math.random() * 4), iron: 2 + Math.floor(Math.random() * 7) };
  Object.keys(loot).forEach(key => state.res[key] += loot[key]);
  state.news.push(`عُقدت صفقة أرض بقيمة ${fmt(price)} دون الكشف عن اسم القبطان.`);
  checkMission();
  shell(`<section class="reveal"><span class="step">تم عقد الصفقة</span><h2>مبروك يا ${state.name}</h2><p>أصبحت <b>${landName}</b> ملكك مقابل ${fmt(price)}، وبدأت فرق الاستخراج العمل.</p><div class="chest"></div><div class="grid resources">${Object.entries(loot).map(([key, value], index) => `<div class="resource" style="animation-delay:${index * .12}s"><i>${R[key].i}</i><b>+${value}</b><small>${R[key].n}</small></div>`).join('')}</div><button class="btn" onclick="questionSelect()">الانتقال للأسئلة</button></section>`);
  startClock(20, 'كشف الموارد', questionSelect);
}

const QUESTION_HISTORY_KEY = 'oil-land-used-questions-v1';

function readUsedQuestions() {
  try { return JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY) || '[]'); }
  catch (error) { return state.usedQuestions || []; }
}

function saveUsedQuestions(ids) {
  state.usedQuestions = ids;
  try { localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(ids)); }
  catch (error) { /* تبقى محفوظة داخل الجلسة عند منع التخزين */ }
}

function unusedQuestions(level) {
  const used = new Set(readUsedQuestions());
  return questions[level].filter(question => !used.has(question.id));
}

function rememberQuestion(id) {
  const used = new Set(readUsedQuestions());
  used.add(id);
  saveUsedQuestions([...used]);
}

function questionSelect() {
  stopClock();
  const counts = { easy: unusedQuestions('easy').length, medium: unusedQuestions('medium').length, hard: unusedQuestions('hard').length };
  shell(`<div class="stage-head"><div><span class="step">تحدي المعرفة</span><h2>اختر مستوى واحدًا</h2><p>كل سؤال يظهر مرة واحدة فقط، حتى بعد إغلاق اللعبة والعودة إليها.</p></div></div><div class="grid questions"><article class="card qcard easy ${counts.easy ? '' : 'exhausted'}" onclick="ask('easy',1000)"><div><span class="step">سهل</span><h3>فرصة آمنة</h3><small>${counts.easy} سؤال جديد متبقٍ</small></div><div class="money">1,000</div></article><article class="card qcard medium ${counts.medium ? '' : 'exhausted'}" onclick="ask('medium',3000)"><div><span class="step">متوسط</span><h3>توازن ومكافأة</h3><small>${counts.medium} سؤال جديد متبقٍ</small></div><div class="money">3,000</div></article><article class="card qcard hard ${counts.hard ? '' : 'exhausted'}" onclick="ask('hard',5000)"><div><span class="step">صعب</span><h3>مخاطرة القباطنة</h3><small>${counts.hard} سؤال جديد متبقٍ</small></div><div class="money">5,000</div></article></div>`);
  startClock(30, 'اختيار السؤال', autoChooseQuestion);
}

function autoChooseQuestion() {
  if (unusedQuestions('easy').length) return ask('easy', 1000);
  if (unusedQuestions('medium').length) return ask('medium', 3000);
  if (unusedQuestions('hard').length) return ask('hard', 5000);
  noQuestionsLeft();
}

function noQuestionsLeft() {
  stopClock();
  shell(`<section class="reveal"><span class="step">بنك الأسئلة</span><h2>استخدمت جميع الأسئلة الجديدة</h2><p>لن تعيد اللعبة أي سؤال سبق أن ظهر لك. يمكنك متابعة الجولة دون جائزة الأسئلة.</p><button class="btn" onclick="startMarket()">متابعة إلى السوق</button></section>`);
  startClock(15, 'متابعة الجولة', startMarket);
}

function ask(level, prize) {
  stopClock();
  const pool = unusedQuestions(level);
  if (!pool.length) {
    toast('انتهت الأسئلة الجديدة في هذا المستوى');
    return questionSelect();
  }
  actionLocked = false;
  activeLevel = level;
  activePrize = prize;
  activeQuestion = pool[Math.floor(Math.random() * pool.length)];
  rememberQuestion(activeQuestion.id);
  shell(`<section class="question-box"><span class="step">سؤال جديد • ${unusedQuestions(level).length} متبقٍ بعده</span><h3>${activeQuestion.q}</h3><div class="answers">${activeQuestion.a.map((answerText, index) => `<button class="answer" onclick="answer(${index})">${answerText}</button>`).join('')}</div></section>`);
  startClock(30, 'وقت الإجابة', () => answer(-1));
}

function answer(index) {
  if (actionLocked) return;
  actionLocked = true;
  stopClock();
  const correct = index === activeQuestion.c;
  if (correct) {
    state.cash += activePrize;
    state.correct++;
    if (activeLevel !== 'easy') state.advancedCorrect++;
    state.news.push('نجح أحد القباطنة في تحدي المعرفة وربح مبلغًا كبيرًا.');
    toast(`إجابة صحيحة! +${fmt(activePrize)}`);
  } else {
    state.wrong++;
    state.news.push('لم يوفق أحد القباطنة في تحدي المعرفة لهذه الجولة.');
    toast(`الإجابة الصحيحة: ${activeQuestion.a[activeQuestion.c]}`);
  }
  checkMission();
  setTimeout(startMarket, 1500);
}

function makeOffers() {
  const needOrder = Object.keys(R).sort((a, b) => (state.ship.need[b] - state.res[b]) - (state.ship.need[a] - state.res[a]));
  const ownedOrder = Object.keys(R).sort((a, b) => state.res[b] - state.res[a]);
  const captains = ['النوخذة', 'الربّان', 'البحّار'];
  return captains.map((from, index) => {
    let give = needOrder[index % needOrder.length];
    let take = ownedOrder[index % ownedOrder.length];
    if (give === take) take = ownedOrder[(index + 1) % ownedOrder.length];
    return { from, give, giveN: index === 1 ? 2 : 3, take, takeN: index === 2 ? 3 : 2, negotiated: false };
  });
}

function startMarket() {
  stopClock();
  actionLocked = false;
  state.offers = makeOffers();
  renderMarket();
  startClock(100, 'السوق والمقايضة', startStocks);
}

function renderMarket() {
  shell(`<div class="stage-head"><div><span class="step">السوق العالمي</span><h2>اشترِ، بِع، أو فاوض</h2><p>اختر الكمية وراجع الإجمالي قبل إبرام أي صفقة.</p></div></div><div class="table"><div class="row head"><span>المورد</span><span>سعر الشراء</span><span>تملك</span><span>شراء</span><span>بيع</span></div>${Object.keys(R).map(key => `<div class="row"><b>${R[key].i} ${R[key].n}</b><span>${fmt(state.prices[key])}</span><span>${state.res[key]}</span><button class="mini" onclick="openOrder('${key}',1)">طلب شراء</button><button class="mini sell" onclick="openOrder('${key}',-1)">طلب بيع</button></div>`).join('')}</div><section class="captains-council"><div class="council-head"><div><span class="step">مجلس القباطنة</span><h2>عروض المقايضة الحية</h2></div><div class="council-actions"><span>تفاوض أو أنشئ عرضك الخاص</span><button class="btn propose-btn" onclick="openPlayerOffer()">＋ قدّم عرضك</button></div></div><div class="deal-grid">${state.offers.length ? state.offers.map((offer, index) => `<article class="deal-card"><div class="captain-avatar">${['⚓','🧔🏻','🧭'][index % 3]}</div><h3>${offer.from}</h3><div class="deal-equation"><b>${offer.giveN} ${R[offer.give].i}</b><span>يعطيك</span><b>${offer.takeN} ${R[offer.take].i}</b><span>مقابل</span></div><div class="deal-buttons"><button class="mini" onclick="acceptOffer(${index})">قبول</button><button class="mini negotiate" ${offer.negotiated ? 'disabled' : ''} onclick="negotiate(${index})">🤝 تفاوض</button></div></article>`).join('') : '<p>لا توجد عروض واردة الآن، لكن يمكنك تقديم عرضك.</p>'}</div></section><div class="next-action"><button class="btn" onclick="startStocks()">إغلاق السوق والانتقال للأسهم</button></div>`, `<div class="market-bg"></div>`);
}

function openPlayerOffer() {
  if (!Object.values(state.res).some(value => value > 0)) return toast('لا تملك موارد لتقديمها');
  const resourceOptions = Object.keys(R).map(key => `<option value="${key}">${R[key].i} ${R[key].n} — تملك ${state.res[key]}</option>`).join('');
  const overlay = $('#overlay');
  overlay.innerHTML = `<div class="modal player-offer"><button class="modal-close" onclick="closeOverlay()">×</button><span class="step">عرض جديد</span><h2>قدّم عرضك للقباطنة</h2><p>حدد ما ستعطيه وما تريد الحصول عليه، ثم انتظر رد القبطان.</p><label>إرسال العرض إلى<select id="offerCaptain"><option>النوخذة</option><option>الربّان</option><option>البحّار</option></select></label><div class="offer-builder"><div><label>أنا أعطي</label><select id="offerGive">${resourceOptions}</select><input id="offerGiveQty" type="number" min="1" value="1"></div><div class="swap-mark">⇄</div><div><label>وأطلب</label><select id="offerWant">${resourceOptions}</select><input id="offerWantQty" type="number" min="1" value="1"></div></div><button class="btn order-confirm" onclick="submitPlayerOffer()">إرسال العرض</button></div>`;
  overlay.classList.add('open');
}

function submitPlayerOffer() {
  const captain = $('#offerCaptain').value;
  const give = $('#offerGive').value;
  const want = $('#offerWant').value;
  const giveQty = Math.max(1, Number($('#offerGiveQty').value) || 1);
  const wantQty = Math.max(1, Number($('#offerWantQty').value) || 1);
  if (give === want) return toast('اختر موردين مختلفين');
  if (state.res[give] < giveQty) return toast(`لا تملك ${giveQty} من ${R[give].n}`);
  const giveValue = state.prices[give] * giveQty;
  const wantValue = state.prices[want] * wantQty;
  const fairness = giveValue / wantValue;
  closeOverlay();
  if (fairness >= .9 || Math.random() < Math.max(.12, fairness * .45)) {
    state.res[give] -= giveQty;
    state.res[want] += wantQty;
    state.deals++;
    state.news.push('قُبل عرض مقايضة اقترحه أحد القباطنة وتم تنفيذه بنجاح.');
    toast(`${captain} وافق وتم تنفيذ الصفقة!`);
    checkMission();
  } else if (fairness >= .45) {
    state.offers.unshift({ from: captain, give: want, giveN: wantQty, take: give, takeN: giveQty + 1, negotiated: true });
    state.news.push('أرسل أحد القباطنة عرضًا مضادًا بعد مفاوضات طويلة.');
    toast(`${captain} أرسل لك عرضًا مضادًا`);
  } else {
    state.news.push('رفض أحد القباطنة عرض مقايضة لضعف قيمته.');
    toast(`${captain} رفض العرض`);
  }
  renderMarket();
}

function orderUnitPrice(key, direction) { return direction > 0 ? state.prices[key] : Math.floor(state.prices[key] * .78); }

function orderMaximum(key, direction) {
  const unit = orderUnitPrice(key, direction);
  return direction > 0 ? Math.floor(state.cash / unit) : state.res[key];
}

function openOrder(key, direction) {
  const maximum = orderMaximum(key, direction);
  if (maximum < 1) return toast(direction > 0 ? 'رصيدك لا يكفي لشراء وحدة' : 'لا تملك كمية للبيع');
  state.order = { key, direction, quantity: 1 };
  const overlay = $('#overlay');
  overlay.innerHTML = orderTicket();
  overlay.classList.add('open');
}

function orderTicket() {
  const order = state.order;
  const unit = orderUnitPrice(order.key, order.direction);
  const total = unit * order.quantity;
  const after = order.direction > 0 ? state.cash - total : state.cash + total;
  return `<div class="modal order-ticket"><button class="modal-close" onclick="closeOverlay()">×</button><span class="step">${order.direction > 0 ? 'أمر شراء' : 'أمر بيع'}</span><div class="order-resource">${R[order.key].i}</div><h2>${R[order.key].n}</h2><div class="quantity-picker"><button onclick="adjustOrder(-1)">−</button><input id="orderQty" type="number" min="1" max="${orderMaximum(order.key, order.direction)}" value="${order.quantity}" oninput="setOrderQuantity(this.value)"><button onclick="adjustOrder(1)">+</button></div><div class="quick-qty"><button onclick="adjustOrder(4)">+5</button><button onclick="setOrderQuantity(${orderMaximum(order.key, order.direction)})">الحد الأعلى</button></div><div class="order-summary"><p><span>سعر الوحدة</span><b>${fmt(unit)}</b></p><p><span>الكمية</span><b id="orderQuantity">${order.quantity}</b></p><p class="total"><span>إجمالي الصفقة</span><b id="orderTotal">${fmt(total)}</b></p><p><span>رصيدك بعد الصفقة</span><b id="cashAfter">${fmt(after)}</b></p></div><button class="btn order-confirm" onclick="executeOrder()">إبرام الصفقة</button></div>`;
}

function adjustOrder(delta) { setOrderQuantity(state.order.quantity + delta); }

function setOrderQuantity(value) {
  if (!state.order) return;
  const maximum = orderMaximum(state.order.key, state.order.direction);
  state.order.quantity = Math.max(1, Math.min(maximum, Number(value) || 1));
  const overlay = $('#overlay');
  overlay.innerHTML = orderTicket();
}

function executeOrder() {
  const order = state.order;
  if (!order) return;
  const maximum = orderMaximum(order.key, order.direction);
  const quantity = Math.min(order.quantity, maximum);
  if (quantity < 1) return toast('تعذر تنفيذ الصفقة');
  const total = orderUnitPrice(order.key, order.direction) * quantity;
  if (order.direction > 0) {
    state.cash -= total;
    state.res[order.key] += quantity;
    state.news.push(`نفذ أحد القباطنة أمر شراء كبيرًا على ${R[order.key].n} بكمية ${quantity}.`);
  } else {
    state.res[order.key] -= quantity;
    state.cash += total;
    state.news.push(`عرض أحد القباطنة ${quantity} من ${R[order.key].n} للبيع.`);
  }
  state.order = null;
  closeOverlay();
  toast(`تم إبرام الصفقة بقيمة ${fmt(total)} ريال`);
  checkMission();
  renderMarket();
}

function negotiate(index) {
  const offer = state.offers[index];
  if (!offer || offer.negotiated) return;
  offer.negotiated = true;
  if (Math.random() < .68) {
    if (Math.random() < .5) offer.giveN++;
    else offer.takeN = Math.max(1, offer.takeN - 1);
    state.news.push('شهد مجلس القباطنة مفاوضات ناجحة حسّنت إحدى الصفقات.');
    toast(`${offer.from} وافق على تحسين العرض!`);
  } else {
    state.offers.splice(index, 1);
    state.news.push('انسحب أحد القباطنة من المفاوضات بعد رفض العرض المضاد.');
    toast(`${offer.from} رفض العرض وانسحب`);
  }
  renderMarket();
}

function acceptOffer(index) {
  const offer = state.offers[index];
  if (!offer) return;
  if (state.res[offer.take] < offer.takeN) return toast(`تحتاج ${offer.takeN} من ${R[offer.take].n}`);
  state.res[offer.take] -= offer.takeN;
  state.res[offer.give] += offer.giveN;
  state.deals++;
  state.news.push('تمت صفقة كبيرة داخل مجلس القباطنة دون كشف تفاصيلها.');
  state.offers.splice(index, 1);
  toast('تمت المقايضة بنجاح');
  checkMission();
  renderMarket();
}

function startStocks() {
  stopClock();
  actionLocked = false;
  renderStocks();
  startClock(65, 'سوق الأسهم', closeStocks);
}

function renderStocks() {
  shell(`<div class="stage-head"><div><span class="step">بورصة أرض النفط</span><h2>سوق الأسهم</h2><p>راقب نسبة الحركة والسعر قبل اتخاذ قرارك. الأسهم لا تدخل في حمولة الباخرة.</p></div></div><div class="exchange-strip"><span class="live-dot">● مباشر</span><div>مؤشر الطاقة <b>${marketIndex()}</b></div><div>الجولة <b>${state.round}</b></div><div>محفظتك <b>${fmt(portfolioValue())} ريال</b></div></div><div class="stock-grid">${Object.keys(R).map((key, index) => stockCard(key, index)).join('')}</div><div class="next-action"><button class="btn news-button" onclick="closeStocks()">إغلاق التداول وفتح نشرة الأخبار</button></div>`, `<div class="market-bg"></div>`);
}

function portfolioValue() { return Object.keys(R).reduce((sum, key) => sum + state.stocks[key] * state.stockPrices[key], 0); }

function marketIndex() {
  const total = Object.values(state.lastChanges).reduce((sum, value) => sum + Number(value), 0);
  return `${total >= 0 ? '▲' : '▼'} ${Math.abs(total / 4).toFixed(1)}%`;
}

function stockCard(key, index) {
  const change = Number(state.lastChanges[key]);
  const rising = change >= 0;
  const bars = Array.from({ length: 9 }, (_, bar) => {
    const base = 20 + ((bar * 17 + index * 23) % 52);
    const height = Math.max(12, Math.min(88, base + change * (bar / 13)));
    return `<i style="height:${height}%"></i>`;
  }).join('');
  return `<article class="stock-card ${rising ? 'stock-up' : 'stock-down'}"><div class="stock-title"><div class="stock-icon">${R[key].i}</div><div><small>شركة ${R[key].n}</small><h3>سهم ${R[key].n}</h3></div></div><div class="stock-price"><b>${fmt(state.stockPrices[key])}</b><span>ريال للسهم</span></div><div class="stock-change ${rising ? 'up' : 'down'}"><b>${rising ? '▲ مرتفع' : '▼ منخفض'} ${Math.abs(change).toFixed(1)}%</b><span>مقارنة بالجولة السابقة</span></div><div class="stock-chart">${bars}</div><div class="stock-owned">تملك الآن <b>${state.stocks[key]}</b> سهم</div><div class="stock-actions"><button class="mini" onclick="stockTrade('${key}',1)">شراء سهم</button><button class="mini sell" onclick="stockTrade('${key}',-1)">بيع سهم</button></div></article>`;
}

function stockTrade(key, direction) {
  const price = state.stockPrices[key];
  if (direction > 0) {
    if (state.cash < price) return toast('الرصيد لا يكفي');
    state.cash -= price; state.stocks[key]++;
  } else {
    if (!state.stocks[key]) return toast('لا تملك هذا السهم');
    state.stocks[key]--; state.cash += price;
  }
  checkMission();
  renderStocks();
}

function closeStocks() {
  if (actionLocked) return;
  actionLocked = true;
  stopClock();
  Object.keys(R).forEach(key => {
    const percent = Number((Math.random() * 31 - 13.5).toFixed(1));
    state.lastChanges[key] = percent;
    state.stockPrices[key] = Math.max(100, Math.round(state.stockPrices[key] * (1 + percent / 100)));
    state.prices[key] = Math.max(350, Math.round(state.prices[key] * (1 + percent / 180)));
  });
  const value = Object.keys(R).reduce((sum, key) => sum + state.stocks[key] * state.stockPrices[key], 0);
  if (value > 1000) state.news.push('حقق مستثمر مجهول نموًا ملحوظًا في محفظة الأسهم.');
  const biggest = Object.keys(R).sort((a, b) => Math.abs(state.lastChanges[b]) - Math.abs(state.lastChanges[a]))[0];
  const move = state.lastChanges[biggest];
  state.news.push(`سهم ${R[biggest].n} هو الأكثر حركة؛ ${move >= 0 ? 'ارتفع' : 'انخفض'} بنسبة ${Math.abs(move).toFixed(1)}%.`);
  actionLocked = false;
  showNews();
}

function showNews() {
  clearInterval(newsInterval);
  let items = [...new Set(state.news)];
  if (state.res.gold >= 7) items.push('رُصد قبطان يجمع كميات كبيرة من الذهب، ودوافعه ما زالت مجهولة.');
  if (shipProgress() >= 75) items.push('مصادر الميناء تؤكد أن إحدى البواخر اقتربت كثيرًا من اكتمال حمولتها.');
  if (!items.length) items.push('الأسواق هادئة والقباطنة يترقبون الجولة القادمة.');
  shell(`<section class="news-card"><span class="breaking">نشرة أرض النفط</span><div class="on-air">● على الهواء</div><div class="headline" id="headline">${items[0]}</div><div class="ticker">عاجل • تقلبات جديدة في أسواق الطاقة والمعادن • مزادات الأراضي تستعد لجولة أخرى •</div><div class="market-summary">${Object.keys(R).map(key => { const change = state.lastChanges[key]; return `<div class="resource"><i>${R[key].i}</i><b class="change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</b><small>${R[key].n}</small></div>`; }).join('')}</div><button class="btn" onclick="finishNews()">إنهاء النشرة</button></section>`, `<div class="news-bg"></div>`);
  let index = 0;
  newsInterval = setInterval(() => {
    index = (index + 1) % items.length;
    const headline = $('#headline');
    if (!headline) return;
    headline.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 500 });
    headline.textContent = items[index];
  }, 2600);
  startClock(Math.max(20, items.length * 5), 'مدة النشرة', finishNews);
}

function finishNews() {
  clearInterval(newsInterval);
  stopClock();
  checkWin();
}

function checkMission() {
  if (!state.mission || state.missionDone) return;
  const done = {
    scholar: state.advancedCorrect >= 1,
    broker: state.deals >= 2,
    oilKing: state.res.oil >= 18,
    investor: Object.values(state.stocks).reduce((a, b) => a + b, 0) >= 5
  }[state.mission.id];
  if (!done) return;
  state.missionDone = true;
  if (state.mission.id === 'scholar') { state.cash += 2500; state.res.gold += 2; }
  if (state.mission.id === 'broker') { state.cash += 3000; state.res.gas += 2; }
  if (state.mission.id === 'oilKing') { state.cash += 2500; state.res.iron += 3; }
  if (state.mission.id === 'investor') { state.cash += 3000; state.res.oil += 2; }
  state.news.push('أنجز أحد القباطنة مهمة سرية وحصل على مكافأة ضخمة.');
  toast(`تمت المهمة السرية! ${state.mission.reward}`);
}

function complete() { return state.ship && Object.keys(state.ship.need).every(key => state.res[key] >= state.ship.need[key]); }

function checkWin() {
  if (complete()) result();
  else {
    state.round++;
    state.news = [];
    startRound();
  }
}

function result() {
  shell(`<section class="result"><span class="step">خبر عاجل</span><h1>وصلت الباخرة!</h1><p>القبطان <b>${state.name}</b> أكمل حمولة ${state.ship.name} وأصبح سيد أرض النفط.</p><div class="ship-sail"></div><div class="grid resources"><div class="resource"><i>🏝️</i><b>${state.round}</b><small>جولات</small></div><div class="resource"><i>✅</i><b>${state.correct}</b><small>إجابات صحيحة</small></div><div class="resource"><i>💰</i><b>${fmt(state.cash)}</b><small>رصيد متبقٍ</small></div><div class="resource"><i>🎯</i><b>${state.missionDone ? 'تمت' : 'لم تتم'}</b><small>المهمة السرية</small></div></div><button class="btn" onclick="location.reload()">لعبة جديدة</button></section>`, `<div class="news-bg"></div>`);
}

home();
