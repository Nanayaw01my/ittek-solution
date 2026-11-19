/**
 * Two real browsers, one real meeting.
 *
 * Chromium is given a fake microphone and camera, so there is a genuine
 * audio track flowing rather than a mocked one. What is checked is the
 * thing that actually matters: that the two phones found each other and
 * that audio bytes arrived at the far end.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:5240';
const TOKENS = JSON.parse(process.argv[2]);
const SHOT = '/tmp/claude-0/-home-user-ittek-solution/f1c579c5-0ef4-596b-a4d9-0a3ee8deafb2/scratchpad';

const USERS = {
  u1: { _id: 'u1', username: 'ama', role: 'Sales' },
  u2: { _id: 'u2', username: 'kofi', role: 'Sales' },
  u3: { _id: 'u3', username: 'boss', role: 'CEO' },
  u4: { _id: 'u4', username: 'outsider', role: 'Engineer' },
};

/**
 * A microphone and a camera this container does not have.
 *
 * Chromium's own fake devices refuse to register here, so the test makes
 * real media in the page instead: an oscillator for the voice and an
 * animated canvas for the picture. Both are genuine MediaStreamTracks —
 * WebRTC encodes and sends them exactly as it would a real microphone,
 * so the bytes counted at the far end are real bytes. Only the source of
 * the sound is synthetic; nothing in the app is mocked.
 */
const FAKE_MEDIA = `
  (() => {
    const mk = (want) => {
      const tracks = [];
      if (want.audio) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.frequency.value = 180 + Math.random() * 300;
        const dest = ctx.createMediaStreamDestination();
        const gain = ctx.createGain();
        gain.gain.value = 0.4;
        osc.connect(gain); gain.connect(dest); osc.start();
        tracks.push(dest.stream.getAudioTracks()[0]);
      }
      if (want.video) {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 240;
        const g = c.getContext('2d');
        setInterval(() => {
          g.fillStyle = 'hsl(' + (Date.now() / 20 % 360) + ',70%,50%)';
          g.fillRect(0, 0, 320, 240);
        }, 100);
        tracks.push(c.captureStream(15).getVideoTracks()[0]);
      }
      return new MediaStream(tracks);
    };
    navigator.mediaDevices.getUserMedia = async (c) =>
      mk({ audio: !!c.audio, video: !!c.video });
  })();
`;

const openAs = async (browser, id, { phone = false } = {}) => {
  const ctx = await browser.newContext({
    permissions: ['microphone', 'camera'],
    ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true } : {}),
  });
  await ctx.addInitScript(([token, user]) => {
    localStorage.setItem('ittek_token', token);
    localStorage.setItem('ittek_auth', JSON.stringify({ state: { user, token }, version: 0 }));
  }, [TOKENS[id], USERS[id]]);
  await ctx.addInitScript(FAKE_MEDIA);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [${id} console] ${m.text().slice(0, 160)}`);
  });
  return { ctx, page };
};

/** Audio genuinely arriving from the other side, read off the live stats. */
const audioIn = (page) => page.evaluate(async () => {
  const pcs = window.__pcs || [];
  let bytes = 0;
  for (const pc of pcs) {
    const stats = await pc.getStats();
    stats.forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'audio') bytes += r.bytesReceived || 0;
    });
  }
  return bytes;
});

(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-capture',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  let failures = 0;
  const check = (ok, label, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  // Expose the peer connections so the stats can be read.
  const spy = `
    window.__pcs = [];
    const Real = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...a) {
      const pc = new Real(...a);
      window.__pcs.push(pc);
      return pc;
    };
    window.RTCPeerConnection.prototype = Real.prototype;
  `;

  // ── Ama joins, then Kofi ─────────────────────────────────────────────
  const ama = await openAs(browser, 'u1');
  await ama.ctx.addInitScript(spy);
  await ama.page.goto(`${BASE}/meetings/m1/room`);
  await ama.page.waitForTimeout(3000);

  const kofi = await openAs(browser, 'u2', { phone: true });
  await kofi.ctx.addInitScript(spy);
  await kofi.page.goto(`${BASE}/meetings/m1/room`);

  // Give the two a moment to find each other and start sending.
  await ama.page.waitForTimeout(7000);

  const amaText = await ama.page.textContent('body');
  const kofiText = await kofi.page.textContent('body');

  check(amaText.includes('kofi'), 'Ama sees Kofi in the room');
  check(kofiText.includes('ama'), 'Kofi sees Ama in the room');
  check(amaText.includes('2 people in the room'), 'the room counts two people',
    (amaText.match(/\d+ (person|people) in the room/) || ['?'])[0]);

  const amaBytes = await audioIn(ama.page);
  const kofiBytes = await audioIn(kofi.page);
  check(amaBytes > 0, 'audio is arriving at Ama', `${amaBytes} bytes`);
  check(kofiBytes > 0, 'audio is arriving at Kofi', `${kofiBytes} bytes`);

  await ama.page.screenshot({ path: `${SHOT}/meeting-desktop.png` });
  await kofi.page.screenshot({ path: `${SHOT}/meeting-phone.png` });

  // ── The camera ───────────────────────────────────────────────────────
  await kofi.page.getByLabel('Turn camera on').click();
  await ama.page.waitForTimeout(4000);
  const videoOnAma = await ama.page.evaluate(async () => {
    let bytes = 0;
    for (const pc of window.__pcs) {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') bytes += r.bytesReceived || 0;
      });
    }
    return bytes;
  });
  check(videoOnAma > 0, "Kofi's camera reaches Ama", `${videoOnAma} bytes`);
  check((await ama.page.textContent('body')).includes('1/3 cameras'), 'the camera count shows');
  await ama.page.screenshot({ path: `${SHOT}/meeting-camera.png` });

  // ── Somebody who was not invited ─────────────────────────────────────
  const out = await openAs(browser, 'u4');
  await out.page.goto(`${BASE}/meetings/m1/room`);
  await out.page.waitForTimeout(2500);
  const outText = await out.page.textContent('body');
  check(outText.includes('not on the list'), 'an uninvited engineer is refused',
    outText.replace(/\s+/g, ' ').trim().slice(0, 70));
  await out.page.screenshot({ path: `${SHOT}/meeting-refused.png` });

  // ── Leaving ──────────────────────────────────────────────────────────
  await kofi.page.getByLabel('Leave the meeting').click();
  await ama.page.waitForTimeout(2500);
  const afterText = await ama.page.textContent('body');
  check(!afterText.includes('kofi'), 'Kofi disappears from the room when he leaves');
  check(afterText.includes('1 person in the room'), 'the count drops back to one');

  await browser.close();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
