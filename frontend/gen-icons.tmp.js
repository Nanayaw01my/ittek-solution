const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = '/home/user/ittek-solution/frontend/public/icons';
const ORANGE = '#F97316';

// Sun mark on the brand orange, echoing the logo already used in the sidebar.
const logo = (size, { padded = false } = {}) => {
  const s = size;
  const c = s / 2;
  // Maskable icons must keep their content inside a safe circle (~80%),
  // because Android and Windows crop the corners to their own shape.
  const scale = padded ? 0.62 : 0.80;
  const r = (s * scale) / 2;
  const coreR = r * 0.42;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const inner = r * 0.60;
    const outer = r * 0.95;
    const x1 = c + Math.cos(a) * inner, y1 = c + Math.sin(a) * inner;
    const x2 = c + Math.cos(a) * outer, y2 = c + Math.sin(a) * outer;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${r * 0.13}" stroke-linecap="round"/>`;
  }).join('');

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <rect width="${s}" height="${s}" rx="${padded ? 0 : s * 0.22}" fill="${ORANGE}"/>
      <circle cx="${c}" cy="${c}" r="${coreR}" fill="#fff"/>
      ${rays}
    </svg>`);
};

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-192.png', size: 192, padded: true },
  { file: 'icon-maskable-512.png', size: 512, padded: true },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-16.png', size: 16 },
];

(async () => {
  for (const t of targets) {
    await sharp(logo(t.size, { padded: t.padded }))
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, t.file));
    const { size } = fs.statSync(path.join(OUT, t.file));
    console.log(`${t.file.padEnd(26)} ${t.size}x${t.size}  ${(size / 1024).toFixed(1)}KB`);
  }
})();
