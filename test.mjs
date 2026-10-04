import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4317;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(action, data = {}, expected = 200) {
  const response = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
  const json = await response.json();
  if (response.status !== expected) throw new Error(`${action}: ${response.status} ${json.error || ''}`);
  return json;
}

try {
  await wait(500);
  const created = await call('create', { usedQuestionIds: [] }, 201);
  const code = created.code, hostToken = created.token;
  const one = await call('join', { code, name: 'قبطان أول' }, 201);
  const two = await call('join', { code, name: 'قبطان ثانٍ' }, 201);
  const t1 = one.token, t2 = two.token;

  let host = await call('start', { code, token: hostToken });
  assert.equal(host.phase, 'ship');
  await call('chooseShip', { code, token: t1, ship: 'energy' });
  await call('chooseShip', { code, token: t2, ship: 'treasure' });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  assert.equal(host.auction.lands.length, 6);

  await call('bid', { code, token: t1, landIndex: 0, amount: 1000 });
  await call('bid', { code, token: t1, landIndex: 1, amount: 500 });
  let p1 = await call('state', { code, token: t1 });
  assert.equal(p1.me.cash, 3500);
  assert.equal(p1.auction.offers.length, 2);
  await call('bid', { code, token: t2, landIndex: 0, amount: 1500 });
  await call('bid', { code, token: t2, landIndex: 2, amount: 500 });
  const hidden = await call('state', { code, token: t1 });
  assert.equal(hidden.auction.offers.length, 2);

  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auctionResult');
  assert.equal(host.auction.results.filter(result => !result.skipped).length, 3);
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.me.lands.length, 1);
  assert.ok(Object.values(p1.me.loot).some(value => value > 0));

  await call('auctionSeen', { code, token: t1 });
  await call('auctionSeen', { code, token: t2 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'mission');
  assert.ok(p1.me.mission?.title);

  await call('missionRead', { code, token: t1 });
  await call('missionRead', { code, token: t2 });
  await call('chooseQuestion', { code, token: t1, level: 'easy' });
  await call('chooseQuestion', { code, token: t2, level: 'hard' });
  p1 = await call('state', { code, token: t1 });
  const p2 = await call('state', { code, token: t2 });
  assert.equal(p1.phase, 'question');
  assert.notEqual(p1.me.question.id, p2.me.question.id);

  await call('answer', { code, token: t1, index: 0 });
  await call('answer', { code, token: t2, index: 0 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'market');

  if (p1.me.cash >= 2000) {
    await call('buyBox', { code, token: t1 });
    p1 = await call('state', { code, token: t1 });
    assert.ok(p1.me.lastBox?.text);
  }
  await call('sendShip', { code, token: t1 }, 409);

  await call('finishPhase', { code, token: t1 });
  await call('finishPhase', { code, token: t2 });
  await call('finishPhase', { code, token: t1 });
  await call('finishPhase', { code, token: t2 });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'news');
  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  assert.equal(host.round, 2);
  assert.equal(host.usedQuestionIds.length, 2);

  const qr = await fetch(`${base}/api/qr?text=${encodeURIComponent(`${base}/?room=${code}`)}`);
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  const demo = await call('demo', { usedQuestionIds: [] }, 201);
  assert.equal(demo.state.phase, 'ship');
  assert.equal(demo.state.players.length, 4);
  assert.equal(demo.state.players.filter(player => player.bot).length, 3);
  await call('chooseShip', { code: demo.code, token: demo.token, ship: 'energy' });
  const demoAuction = await call('state', { code: demo.code, token: demo.token });
  assert.equal(demoAuction.phase, 'auction');
  console.log('SYNC_FLOW_V5_OK', code, host.players.length, host.round, host.usedQuestionIds.length);
} finally {
  child.kill('SIGTERM');
}
