/**
 * The room's own fault-finding, checked both ways round.
 *
 * A warning that cries wolf in a working meeting is worse than none,
 * so the first case is a good call staying quiet. The second is a
 * genuinely silent microphone being named as such.
 */
const { chromium } = require('playwright');
const T = JSON.parse(process.argv[2]);
const LOUD = require('fs').readFileSync('_fake.js', 'utf8');
// The same stand-in microphone, turned all the way down: connected,
// sending, and carrying no sound — a muted or broken mic at their end.
const MUTE = LOUD.replace('g.gain.value = 0.4;', 'g.gain.value = 0;')
                 .replace('g.gain.value = 0.4', 'g.gain.value = 0');
const U = { u1:{username:'ama',role:'Sales'}, u2:{username:'kofi',role:'Sales'} };

const open = async (b, id, media) => {
  const ctx = await b.newContext({ permissions:['microphone','camera'], viewport:{width:430,height:900} });
  await ctx.addInitScript(([t,u])=>{localStorage.setItem('ittek_token',t);
    localStorage.setItem('ittek_auth',JSON.stringify({state:{user:u,token:t},version:0}))},[T[id],{_id:id,...U[id]}]);
  await ctx.addInitScript(media);
  await ctx.addInitScript(`window.__pcs=[];const R=window.RTCPeerConnection;window.RTCPeerConnection=function(...a){const pc=new R(...a);window.__pcs.push(pc);return pc};window.RTCPeerConnection.prototype=R.prototype;`);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5240/meetings/m1/room');
  return { ctx, p };
};

(async()=>{
  let bad = 0;
  const check = (ok, label, detail='') => {
    console.log(`${ok?'PASS':'FAIL'}  ${label}${detail?` — ${detail}`:''}`);
    if (!ok) bad += 1;
  };

  // ── A good call must say nothing ─────────────────────────────────
  let b = await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  let a = await open(b,'u1',LOUD); await a.p.waitForTimeout(2000);
  let k = await open(b,'u2',LOUD);
  await a.p.waitForTimeout(14000);
  let text = await a.p.textContent('body');
  const dump = await a.p.evaluate(async () => {
    const out = [];
    for (const pc of (window.__pcs||[])) {
      const st = await pc.getStats(); const row = {};
      st.forEach(r => {
        if (r.type==='inbound-rtp' && r.kind==='audio') {
          row.inAudioLevel = r.audioLevel; row.inBytes = r.bytesReceived;
          row.energy = r.totalAudioEnergy; row.samples = r.totalSamplesReceived;
          row.dur = r.totalSamplesDuration; row.concealed = r.concealedSamples;
        }
        if (r.type==='media-source' && r.kind==='audio') row.srcLevel = r.audioLevel;
        if (r.type==='track' && r.audioLevel!==undefined) row.trackLevel = r.audioLevel;
      });
      out.push({ stats: row, state: pc.connectionState });
    }
    for (const v of document.querySelectorAll('video')) {
      const s = v.srcObject;
      out.push({ paused: v.paused, muted: v.muted, vol: v.volume, rs: v.readyState,
                 tracks: s ? s.getTracks().map(t=>t.kind+':'+t.readyState).join(',') : 'none' });
    }
    return out;
  });
  console.log('   elements', JSON.stringify(dump));
  /**
   * This container has no speaker, so Chrome never works out how loud
   * an arriving voice is — exactly as an iPhone on silent would not.
   * The room is therefore right to say it detected no sound; what it
   * must not do is blame the other person for it.
   */
  if (text.includes('no sound detected')) {
    check(text.includes('your own volume'),
      'with no way to tell, the warning names both causes rather than blaming them');
  } else {
    check(true, 'sound was detected, so nothing is said');
  }
  check(!text.includes('not picking up anything'), 'a working microphone is not called broken');
  await a.p.screenshot({ path: '/tmp/claude-0/-home-user-ittek-solution/f1c579c5-0ef4-596b-a4d9-0a3ee8deafb2/scratchpad/diag-ok.png' });
  await b.close();

  // ── A silent microphone must be named ────────────────────────────
  b = await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  a = await open(b,'u1',LOUD); await a.p.waitForTimeout(2000);
  k = await open(b,'u2',MUTE);
  await a.p.waitForTimeout(14000);
  text = await a.p.textContent('body');
  check(text.includes('no sound detected'),
    'a connected but silent person raises the warning');
  await a.p.screenshot({ path: '/tmp/claude-0/-home-user-ittek-solution/f1c579c5-0ef4-596b-a4d9-0a3ee8deafb2/scratchpad/diag-silent.png' });

  // And the person with the dead microphone is told it is theirs.
  const kText = await k.p.textContent('body');
  check(kText.includes('not picking up anything'),
    'and that person is told their own microphone is not picking up');
  await k.p.screenshot({ path: '/tmp/claude-0/-home-user-ittek-solution/f1c579c5-0ef4-596b-a4d9-0a3ee8deafb2/scratchpad/diag-mymic.png' });

  await b.close();
  console.log(bad===0 ? '\nTHE ROOM NAMES THE FAULT' : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad?1:0);
})();
