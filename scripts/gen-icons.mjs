#!/usr/bin/env node
// Generates the PWA and extension PNG icons (no dependencies): indigo tile with a white "hub" mark.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = [79, 70, 229];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const clamp = (v) => Math.max(0, Math.min(1, v));
// Signed distance helpers (in unit space, centre 0,0, half-size 0.5)
const roundRect = (x, y, half, r) => {
  const qx = Math.abs(x) - half + r, qy = Math.abs(y) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function icon(size, { maskable = false } = {}) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const aa = 1.2 / size;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size - 0.5, y = (py + 0.5) / size - 0.5;
      const tile = maskable ? -1 : roundRect(x, y, 0.5, 0.22);
      const tileA = clamp(0.5 - tile / aa);
      const s = maskable ? 0.62 : 0.78; // keep the mark in the maskable safe zone
      const ring = Math.abs(Math.hypot(x, y) - 0.2 * s) - 0.055 * s;
      const dot = Math.hypot(x, y) - 0.07 * s;
      const spokes = [0, 1, 2].map((i) => {
        const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        const cx = Math.cos(a) * 0.36 * s, cy = Math.sin(a) * 0.36 * s;
        return Math.hypot(x - cx, y - cy) - 0.06 * s;
      });
      const mark = Math.min(ring, dot, ...spokes);
      const markA = clamp(0.5 - mark / aa);
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - markA) + 255 * markA);
      raw[o + 3] = Math.round(255 * tileA);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = (p, buf) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
};
out(join(root, "apps/web/public/icons/192.png"), icon(192));
out(join(root, "apps/web/public/icons/512.png"), icon(512));
out(join(root, "apps/web/public/icons/maskable-512.png"), icon(512, { maskable: true }));
out(join(root, "apps/web/app/icon.png"), icon(64));
out(join(root, "apps/web/app/apple-icon.png"), icon(180, { maskable: true }));
for (const s of [16, 48, 128]) out(join(root, `apps/extension/public/icons/${s}.png`), icon(s));
console.log("Icons generated.");
