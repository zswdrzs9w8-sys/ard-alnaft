import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4317;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(action, data = {}) {
  const response = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${action}: ${json.error}`);
  return json;
}

try {
  await wait(500);
  const created = await call('create', { usedQuestionIds: [] });
  const code = created.code, hostToken = created.token;
  const one = await call('join', { code, name: 'قبطان أول' });
  const two = await call('join', { code, name: 'قبطان ثانٍ' });
  const t1 = one.token, t2 = two.token;
  let host = await call('start', { code, token: hostToken });
  assert.equal(host.phase, 'ship');
  await call('chooseShip', { code, token: t1, ship: 'energy' });
  await call('chooseShip', { code, token: t2, ship: 'treasure' });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  const tokenById = new Map([[one.state.me.id, t1], [two.state.me.id, t2]]);
  for (let turn = 0; turn < 2; turn++) {
    host = await call('state', { code, token: hostToken });
    const playerId = host.auction.currentPlayerId;
    await call('bid', { code, token: tokenById.get(playerId), landIndex: turn, amount: 1000 + turn * 500 });
  }
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'questionSelect');
  await call('chooseQuestion', { code, token: t1, level: 'easy' });
  await call('chooseQuestion', { code, token: t2, level: 'hard' });
  let p1 = await call('state', { code, token: t1 });
  let p2 = await call('state', { code, token: t2 });
  assert.equal(p1.phase, 'question');
  assert.notEqual(p1.me.question.id, p2.me.question.id);
  await call('answer', { code, token: t1, index: 0 });
  await call('answer', { code, token: t2, index: 0 });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'market');
  await call('marketOrder', { code, token: t1, resource: 'oil', side: 'buy', quantity: 1 });
  const trade = await call('createTrade', { code, token: t1, to: p2.me.id, give: 'oil', giveQty: 1, want: 'gas', wantQty: 1 });
  p2 = await call('state', { code, token: t2 });
  assert.equal(p2.me.incomingTrades.length, 1);
  await call('respondTrade', { code, token: t2, tradeId: p2.me.incomingTrades[0].id, accept: true });
  await call('advance', { code, token: hostToken });
  p1 = await call('state', { code, token: t1 });
  assert.equal(p1.phase, 'stocks');
  await call('stockOrder', { code, token: t1, resource: 'gold', side: 'buy', quantity: 2 });
  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'news');
  assert.equal(host.usedQuestionIds.length, 2);
  await call('advance', { code, token: hostToken });
  host = await call('state', { code, token: hostToken });
  assert.equal(host.phase, 'auction');
  assert.equal(host.round, 2);
  const qr = await fetch(`${base}/api/qr?text=${encodeURIComponent(`${base}/?room=${code}`)}`);
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  console.log('ONLINE_FLOW_OK', code, host.players.length, host.round, host.usedQuestionIds.length);
} finally {
  child.kill('SIGTERM');
}
