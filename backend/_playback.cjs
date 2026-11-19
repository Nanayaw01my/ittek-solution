/**
 * Does the sound reach the speaker?
 *
 * Bytes arriving proves the network works, and every check of that kind
 * passed while the room was completely silent. The silence came from
 * createMediaStreamSource, which re-routes a stream's playback into a
 * Web Audio graph — so the audio was present, decoded, and diverted.
 *
 * This watches for exactly that: any incoming stream handed to Web
 * Audio is a stream that will not be heard.
 */
const { chromium } = require('playwright');
const T = JSON.parse(process.argv[2]);
const FAKE = require('fs').readFileSync('_fake.js','utf8');
const U = { u1:{username:'ama',role:'Sales'}, u2:{username:'kofi',role:'Sales'} };

const WATCH = `
  window.__taken = [];
  const grab = (proto) => {
    if (!proto || !proto.createMediaStreamSource) return;
    const real = proto.createMediaStreamSource;
    proto.createMediaStreamSource = function (stream) {
        // By track, not by stream: a stream is just a bag, and the app
      // makes a fresh one per arriving track. What gets diverted is the
      // track inside it, whichever bag it is carried in.
      window.__taken.push(...stream.getAudioTracks().map((t) => t.id));
      return real.call(this, stream);
    };
  };
  grab(window.AudioContext && window.AudioContext.prototype);
  grab(window.webkitAudioContext && window.webkitAudioContext.prototype);
`;

(async()=>{
  const b = await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const open = async (id) => {
    const ctx = await b.newContext({permissions:['microphone','camera']});
    await ctx.addInitScript(([t,u])=>{localStorage.setItem('ittek_token',t);localStorage.setItem('ittek_auth',JSON.stringify({state:{user:u,token:t},version:0}))},[T[id],{_id:id,...U[id]}]);
    await ctx.addInitScript(FAKE);
    await ctx.addInitScript(WATCH);
    const p = await ctx.newPage(); await p.goto('http://localhost:5240/meetings/m1/room'); return p;
  };
  const ama = await open('u1'); await ama.waitForTimeout(2500);
  const kofi = await open('u2'); await ama.waitForTimeout(9000);

  let bad = 0;
  const check = (ok, label, detail='') => {
    console.log(`${ok?'PASS':'FAIL'}  ${label}${detail?` — ${detail}`:''}`);
    if (!ok) bad += 1;
  };

  for (const [name,p] of [['ama',ama],['kofi',kofi]]) {
    const r = await p.evaluate(() => {
      const el = document.querySelector('video');
      const s = el && el.srcObject;
      return {
        attached: !!s,
        tracks: s ? s.getAudioTracks().length : 0,
        playing: el ? !el.paused : false,
        muted: el ? el.muted : null,
        volume: el ? el.volume : null,
        trackIds: s ? s.getAudioTracks().map((t) => t.id) : [],
        taken: window.__taken,

      };
    });

    check(r.attached && r.tracks > 0, `${name}: the other voice is attached to an audio element`);
    check(r.playing && !r.muted && r.volume > 0, `${name}: that element is playing, unmuted, at volume`);
    // The one that matters.
    const stolen = r.trackIds.filter((id) => r.taken.includes(id));
    check(stolen.length === 0,
      `${name}: the incoming voice is NOT diverted into Web Audio`,
      stolen.length ? 'it was taken — the room will be silent' : 'left alone, so it reaches the speaker');
    /**
     * Only one thing may ever go into Web Audio: our own microphone,
     * which is never played back. Anything else is a voice somebody
     * will not hear.
     */
    check(r.taken.length <= 1,
      `${name}: nothing but our own microphone is in Web Audio`,
      `${r.taken.length} track(s) taken`);
  }

  // The speaking indicator must still work, now from the statistics.
  await ama.waitForTimeout(1500);
  const ring = await ama.evaluate(() =>
    [...document.querySelectorAll('div')].some((d) => d.className.includes('border-orange-400')));
  check(ring, 'ama: the speaking ring still lights for whoever is talking');

  await b.close();
  console.log(bad===0 ? '\nSOUND REACHES THE SPEAKER' : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad?1:0);
})();
