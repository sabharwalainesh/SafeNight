// Emits the PWA icons as PNGs using only node built-ins (zlib + manual PNG chunks).
// Run with `npm run icons -w web`; the generated files in public/ are committed.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

// Crescent: gold disc minus an offset dark disc. `scale` shrinks the mark for the maskable safe zone.
function png(size, scale) {
  const bg = [0x0b, 0x0d, 0x12];
  const gold = [0xf6, 0xc4, 0x45];
  const R = size * 0.29 * scale;
  const cx = size / 2;
  const cy = size / 2;
  const bx = cx + R * 0.36;
  const by = cy - R * 0.25;
  const BR = R * 0.87;
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const inA = (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
      const inB = (x - bx) ** 2 + (y - by) ** 2 <= BR * BR;
      raw.set(inA && !inB ? gold : bg, y * stride + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, 'icon-192.png'), png(192, 1));
writeFileSync(join(out, 'icon-512.png'), png(512, 1));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, 0.7));
writeFileSync(join(out, 'apple-touch-icon.png'), png(180, 0.85));
console.log('icons written to', out);
