import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port=4317,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(action,data={},expected=200){
  const response=await fetch(`${base}/api/game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
  const json=await response.json();
  if(response.status!==expected)throw Error(`${action}: ${response.status} ${json.error||''}`);
  return json;
}
try{
  await wait(400);
  const created=await call('create',{name:'أبو فهد'},201);
  assert.equal(created.state.players.length,1);
  assert.equal(created.state.me.name,'أبو فهد');
  assert.equal(created.state.host,true);
  const joined=await call('join',{code:created.code,name:'قبطان ثانٍ'},201);
  await call('start',{code:created.code,token:created.token});
  await call('chooseShip',{code:created.code,token:created.token,ship:'energy'});
  const auction=await call('chooseShip',{code:created.code,token:joined.token,ship:'treasure'});
  assert.equal(auction.phase,'auction');
  await call('advance',{code:created.code,token:created.token},403);
  const demo=await call('demo',{difficulty:'easy'},201);
  assert.equal(demo.state.players.length,4);
  assert.equal(demo.state.difficulty,'easy');
  await call('chooseShip',{code:demo.code,token:demo.token,ship:'energy'});
  let state=await call('state',{code:demo.code,token:demo.token});
  assert.equal(state.phase,'auction');
  await wait(30500);
  state=await call('state',{code:demo.code,token:demo.token});
  assert.equal(state.phase,'auctionResult');
  await call('auctionSeen',{code:demo.code,token:demo.token});
  state=await call('missionRead',{code:demo.code,token:demo.token});
  assert.equal(state.phase,'challenge');
  assert.ok(['barrels','pipes','balance','crane','vault','sorting'].includes(state.challenge.type));
  state=await call('submitChallenge',{code:demo.code,token:demo.token,success:true,duration:6200});
  assert.equal(state.phase,'challengeResult');
  assert.equal(typeof state.me.challengeReward,'number');
  state=await call('readyPhase',{code:demo.code,token:demo.token});
  assert.equal(state.phase,'market');
  console.log('SYNC_FLOW_V11_OK',created.code,demo.code,state.players.length);
}finally{child.kill('SIGTERM')}
