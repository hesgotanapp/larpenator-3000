// Generates build/app.ico, build/app.icns, build/app.png from build/icon.svg.
// Swap icon.svg for the final logo and re-run: npm run icons
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const icongen = require('icon-gen');

const buildDir = path.join(__dirname, '..', 'build');
const svg = path.join(buildDir, 'icon.svg');
const masterPng = path.join(buildDir, 'tmp-master.png');

(async () => {
  await sharp(svg, { density: 400 }).resize(1024, 1024).png().toFile(masterPng);
  await sharp(masterPng).resize(512, 512).png().toFile(path.join(buildDir, 'app.png'));
  await icongen(masterPng, buildDir, {
    report: false,
    ico: { name: 'app', sizes: [16, 24, 32, 48, 64, 128, 256] },
    icns: { name: 'app', sizes: [16, 32, 64, 128, 256, 512, 1024] }
  });
  fs.unlinkSync(masterPng);
  console.log('icons written: app.ico, app.icns, app.png');
})().catch(err => { console.error(err); process.exit(1); });
