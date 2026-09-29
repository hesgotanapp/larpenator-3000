// Generates build/app.ico, build/app.icns, build/app.png.
// Source is build/icon-master.png (the stamp logo rendered with its fonts and ink
// texture, which the SVG rasteriser here can't reproduce); falls back to build/icon.svg.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const icongen = require('icon-gen');

const buildDir = path.join(__dirname, '..', 'build');
const svg = path.join(buildDir, 'icon.svg');
const master = path.join(buildDir, 'icon-master.png');
const masterPng = path.join(buildDir, 'tmp-master.png');

(async () => {
  if (fs.existsSync(master)) await sharp(master).resize(1024, 1024).png().toFile(masterPng);
  else await sharp(svg, { density: 400 }).resize(1024, 1024).png().toFile(masterPng);
  await sharp(masterPng).resize(512, 512).png().toFile(path.join(buildDir, 'app.png'));
  await icongen(masterPng, buildDir, {
    report: false,
    ico: { name: 'app', sizes: [16, 24, 32, 48, 64, 128, 256] },
    icns: { name: 'app', sizes: [16, 32, 64, 128, 256, 512, 1024] }
  });
  // Windows: taskbar/title-bar sizes use the simplified stamp (ring + 3K) so it stays readable
  const small = path.join(buildDir, 'icon-master-small.png');
  if (fs.existsSync(master) && fs.existsSync(small)) {
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const pngs = await Promise.all(sizes.map(s => sharp(s <= 48 ? small : master).resize(s, s).png().toBuffer()));
    const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    let offset = 6 + 16 * sizes.length;
    const dir = sizes.map((s, i) => {
      const e = Buffer.alloc(16);
      e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
      e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
      offset += pngs[i].length;
      return e;
    });
    fs.writeFileSync(path.join(buildDir, 'app.ico'), Buffer.concat([head, ...dir, ...pngs]));
  }
  fs.unlinkSync(masterPng);
  console.log('icons written: app.ico, app.icns, app.png');
})().catch(err => { console.error(err); process.exit(1); });
