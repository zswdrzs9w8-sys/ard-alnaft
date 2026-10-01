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
  let p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'ship');
  await call('chooseShip', { code, token: t2, ship: 'treasure' });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  assert.equal(host.auction.currentLand.name, 'صحراء الفجر');

  await call('bid', { code, token: t1, amount: 500 });
  await call('bid', { code, token: t2, amount: 1000 });
  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  assert.equal(host.auction.currentLand.name, 'هضبة العنبر');
  await call('bid', { code, token: t2, amount: 1500 }, 409);
  await call('bid', { code, token: t1, amount: 500 });
  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'mission');
  assert.equal(host.players.filter(player => player.hasLand).length, 2);

  await call('missionRead', { code, token: t1 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'mission');
  await call('missionRead', { code, token: t2 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'questionSelect');

  await call('chooseQuestion', { code, token: t1, level: 'easy' });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'questionSelect');
  await call('chooseQuestion', { code, token: t2, level: 'hard' });
  p1 = await call('state', { code, token: t1 });
  const p2 = await call('state', { code, token: t2 });
  assert.equal(p1.phase, 'question');
  assert.notEqual(p1.me.question.id, p2.me.question.id);

  await call('answer', { code, token: t1, index: 0 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'question');
  await call('answer', { code, token: t2, index: 0 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'market');

  await call('finishPhase', { code, token: t1 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'market');
  assert.equal(p1.me.stageDone, true);
  await call('finishPhase', { code, token: t2 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'stocks');

  await call('finishPhase', { code, token: t1 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'stocks');
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
  console.log('SYNC_FLOW_OK', code, host.players.length, host.round, host.usedQuestionIds.length);
} finally {
  child.kill('SIGTERM');
}
