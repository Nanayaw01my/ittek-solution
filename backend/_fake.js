(() => {
  const mk = (want) => {
    const tracks = [];
    if (want.audio) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 180 + Math.random()*300;
      const dest = ctx.createMediaStreamDestination();
      const g = ctx.createGain(); g.gain.value = 0.4;
      osc.connect(g); g.connect(dest); osc.start();
      tracks.push(dest.stream.getAudioTracks()[0]);
    }
    if (want.video) {
      const c = document.createElement('canvas'); c.width=320;c.height=240;
      const g = c.getContext('2d');
      setInterval(()=>{g.fillStyle='hsl('+(Date.now()/20%360)+',70%,50%)';g.fillRect(0,0,320,240)},100);
      tracks.push(c.captureStream(15).getVideoTracks()[0]);
    }
    return new MediaStream(tracks);
  };
  navigator.mediaDevices.getUserMedia = async (c) => mk({audio:!!c.audio, video:!!c.video});
})();
