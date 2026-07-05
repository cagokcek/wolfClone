import { useEffect, useRef, useState } from "react";
import FaceHUD from "./FaceHUD";
import { startDoomMusic, stopDoomMusic } from "@/lib/doomMusic";


// A tiny Doom-inspired raycaster with procedural army-bunker textures.
// Controls: WASD move · MOUSE look · CLICK shoot · SHIFT run

const MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,2,0,0,0,0,0,0,3,0,0,0,0,1],
  [1,0,1,1,0,1,0,2,0,1,1,1,0,0,0,0,1,1,0,1],
  [1,0,1,0,0,1,0,0,0,1,0,0,0,3,0,0,0,1,0,1],
  [1,0,1,0,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,1,2,2,2,2,0,1,1,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,2,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,1,0,2,2,2,0,1,1,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,3,0,0,1,0,0,0,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const MAP_H = MAP.length;
const MAP_W = MAP[0].length;

type Enemy = {
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  hurtT: number;
  dieT: number;
  fireCd: number;
};

type Projectile = { x: number; y: number; dx: number; dy: number; life: number };

const TS = 64; // texture size

function packRGB(r: number, g: number, b: number) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function hash(u: number, v: number) {
  const s = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return f;
}

function makeTex(fn: (u: number, v: number, n: number) => [number, number, number]) {
  const t = new Uint32Array(TS * TS);
  for (let v = 0; v < TS; v++) {
    for (let u = 0; u < TS; u++) {
      const [r, g, b] = fn(u, v, hash(u, v));
      t[v * TS + u] = packRGB(r, g, b);
    }
  }
  return t;
}

// ---- Bunker textures ----

// 1: poured concrete wall — cool gray with form-board seams and stains
const TEX_CONCRETE = makeTex((u, v, n) => {
  const base = 92 + n * 22;
  const seam = (v % 32 < 2 || (v + 16) % 64 < 1) ? -28 : 0;
  const stain = Math.sin(u * 0.18 + v * 0.07) * 8 - Math.cos(u * 0.05 + v * 0.31) * 6;
  const grime = v > 48 ? -(v - 48) * 1.2 : 0;
  const c = base + seam + stain + grime;
  return [c * 1.02, c, c * 0.94];
});

// 2: sandbag wall — tan bags in offset courses with dark mortar
const TEX_SANDBAG = makeTex((u, v, n) => {
  const rowH = 16;
  const bagW = 22;
  const row = Math.floor(v / rowH);
  const offset = (row % 2) * (bagW / 2);
  const lu = ((u + offset) % bagW);
  const lv = v % rowH;
  const cx = bagW / 2;
  const cy = rowH / 2;
  const dx = (lu - cx) / (bagW / 2 - 1);
  const dy = (lv - cy) / (rowH / 2 - 1);
  const d = dx * dx + dy * dy;
  if (d > 0.95) return [38, 32, 22]; // dark mortar/shadow
  const lift = 1 - d * 0.55;
  const fiber = (hash(u * 3, v * 3) - 0.5) * 18;
  return [165 * lift + fiber, 138 * lift + fiber * 0.8, 86 * lift + fiber * 0.5];
});

// 3: riveted olive-drab steel panels with corner rivets
const TEX_STEEL = makeTex((u, v, n) => {
  const pu = u % 32, pv = v % 32;
  // panel seams
  if (pu === 0 || pv === 0 || pu === 31 || pv === 31) return [32, 36, 24];
  // rivets in panel corners
  const corners: [number, number][] = [[4, 4], [27, 4], [4, 27], [27, 27]];
  for (const [cx, cy] of corners) {
    const dd = (pu - cx) * (pu - cx) + (pv - cy) * (pv - cy);
    if (dd < 2) return [150, 150, 130];
    if (dd < 6) return [70, 72, 55];
  }
  // brushed-metal streaks
  const streak = Math.sin(v * 0.9) * 4 + (n - 0.5) * 14;
  const base = 78 + streak;
  // rust dribble near bottom corners
  const rust = (pv > 22 && (pu < 6 || pu > 25)) ? (pv - 22) * 1.5 : 0;
  return [base * 0.92 + rust * 1.8, base * 0.98 + rust * 0.4, base * 0.55];
});

// Floor: cracked concrete slabs
const TEX_FLOOR = makeTex((u, v, n) => {
  const base = 72 + n * 18;
  const tile = (u % 32 < 1 || v % 32 < 1) ? -22 : 0;
  // diagonal hairline crack
  const crack = Math.abs((v - 30) + Math.sin(u * 0.35) * 6) < 1 ? -28 : 0;
  // grease stain
  const sx = u - 40, sy = v - 20;
  const stain = Math.exp(-(sx * sx + sy * sy) / 180) * -22;
  const c = base + tile + crack + stain;
  return [c * 1.0, c * 0.98, c * 0.9];
});

// Ceiling: corrugated olive-drab metal with rivet line
const TEX_CEIL = makeTex((u, v, n) => {
  const corr = Math.sin(v * 0.49) * 14;
  const seam = v % 32 < 1 ? -22 : 0;
  const rivet = (v % 32 === 16 && u % 8 === 0) ? -18 : 0;
  const base = 58 + n * 7 + corr + seam + rivet;
  return [base * 0.88, base, base * 0.55];
});

// 4: blast door — heavy steel with central seam, hazard stripes, porthole, handles
const TEX_DOOR = makeTex((u, v, n) => {
  if (v < 6 || v > TS - 7) {
    const s = (((u + v) >> 2) & 1);
    return s ? [210, 170, 30] : [25, 22, 18];
  }
  if (u === TS / 2 || u === TS / 2 - 1) return [18, 18, 16];
  const px = u - TS / 2, py = v - TS * 0.42;
  const pd = px * px + py * py;
  if (pd < 36) return [120, 160, 140];
  if (pd < 64) return [40, 44, 40];
  if (v > TS * 0.6 && v < TS * 0.6 + 4 &&
      ((u > TS / 2 - 14 && u < TS / 2 - 4) || (u > TS / 2 + 4 && u < TS / 2 + 14))) {
    return [180, 180, 175];
  }
  if ((u === 4 || u === TS - 5) && v % 8 === 4) return [160, 160, 150];
  const streak = Math.sin(v * 0.7) * 5 + (n - 0.5) * 10;
  const base = 70 + streak;
  return [base * 0.9, base * 0.95, base * 0.7];
});

const WALL_TEX: Record<number, Uint32Array> = {
  1: TEX_CONCRETE,
  2: TEX_SANDBAG,
  3: TEX_STEEL,
  4: TEX_DOOR,
};

// Procedural German death cry: "Mein Leben!" via SpeechSynthesis,
// with a WebAudio scream fallback if no German voice is available.
let _voiceCache: SpeechSynthesisVoice | null | undefined = undefined;
function pickGermanVoice(): SpeechSynthesisVoice | null {
  if (_voiceCache !== undefined) return _voiceCache;
  if (typeof window === "undefined" || !window.speechSynthesis) return (_voiceCache = null);
  const voices = window.speechSynthesis.getVoices();
  const de = voices.find((v) => /^de(-|_)/i.test(v.lang)) || voices.find((v) => /german/i.test(v.name));
  _voiceCache = de ?? null;
  return _voiceCache;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { _voiceCache = undefined; pickGermanVoice(); };
  pickGermanVoice();
}
let _screamCtx: AudioContext | null = null;
function screamFallback() {
  try {
    _screamCtx ||= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _screamCtx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(110, now + 0.6);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start(now); o.stop(now + 0.75);
  } catch {}
}
function playMeinLeben() {
  const phrases = ["Mein Leben!", "Mein Leben!", "Achtung!", "Schweinhund!"];
  const text = phrases[Math.floor(Math.random() * phrases.length)];
  if (typeof window === "undefined" || !window.speechSynthesis) return screamFallback();
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const v = pickGermanVoice();
  if (v) u.voice = v;
  u.lang = "de-DE";
  u.rate = 1.05;
  u.pitch = 0.85;
  u.volume = 1;
  let spoke = false;
  u.onstart = () => { spoke = true; };
  u.onend = () => { if (!spoke) screamFallback(); };
  u.onerror = () => screamFallback();
  try { synth.speak(u); } catch { screamFallback(); }
  // Fallback if voices never load
  setTimeout(() => { if (!spoke && !synth.speaking) screamFallback(); }, 250);
}

export default function DoomGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ hp: 100, ammo: 50, kills: 0, total: 0, dead: false, won: false });
  const [music, setMusic] = useState(true);

  useEffect(() => {
    if (started && music) startDoomMusic();
    else stopDoomMusic();
    return () => stopDoomMusic();
  }, [started, music]);


  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const W = 640;
    const H = 400;
    canvas.width = W;
    canvas.height = H;

    const frame = ctx.createImageData(W, H);
    const buf = new Uint32Array(frame.data.buffer);

    const player = { x: 1.5, y: 1.5, dir: 0.5, hp: 100, ammo: 50, muzzle: 0 };

    const enemies: Enemy[] = [];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (MAP[y][x] === 3) {
          enemies.push({ x: x + 0.5, y: y + 0.5, hp: 30, alive: true, hurtT: 0, dieT: 0, fireCd: Math.random() * 2 });
          (MAP[y] as number[])[x] = 0;
        }
      }
    }
    const projectiles: Projectile[] = [];

    // ---- Doors ----
    type Door = { openness: number; state: "closed" | "opening" | "open" | "closing"; holdT: number };
    const doors = new Map<number, Door>();
    const doorKey = (x: number, y: number) => y * MAP_W + x;
    const doorCells: [number, number][] = [[3, 5], [4, 11], [8, 4], [11, 13], [9, 15]];
    for (const [y, x] of doorCells) {
      if (MAP[y] && MAP[y][x] === 1) {
        (MAP[y] as number[])[x] = 4;
        doors.set(doorKey(x, y), { openness: 0, state: "closed", holdT: 0 });
      }
    }
    const doorBlocks = (d: Door) => d.openness < 0.85;

    setHud((h) => ({ ...h, total: enemies.length }));

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "Space") { e.preventDefault(); tryUseDoor(); }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        player.dir += e.movementX * 0.0025;
      }
    };
    const shoot = () => {
      if (player.hp <= 0 || player.ammo <= 0) return;
      player.ammo--;
      player.muzzle = 0.08;
      let bestIdx = -1;
      let bestDist = 12;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) - player.dir;
        const a = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(a) < 0.08 && dist < bestDist) {
          const wallDist = castRay(player.x, player.y, Math.cos(player.dir), Math.sin(player.dir)).dist;
          if (dist < wallDist) { bestIdx = i; bestDist = dist; }
        }
      }
      if (bestIdx >= 0) {
        const e = enemies[bestIdx];
        e.hp -= 15;
        e.hurtT = 0.15;
        if (e.hp <= 0) { e.alive = false; e.dieT = 0.6; playMeinLeben(); }
      }
    };
    const onClick = () => {
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      shoot();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);

    function isWall(x: number, y: number) {
      const mx = Math.floor(x), my = Math.floor(y);
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 1;
      const v = MAP[my][mx];
      if (v === 4) {
        const d = doors.get(doorKey(mx, my));
        return d && !doorBlocks(d) ? 0 : 4;
      }
      return v;
    }

    function castRay(px: number, py: number, rdx: number, rdy: number, ignoreDoors = false) {
      let mapX = Math.floor(px), mapY = Math.floor(py);
      const deltaX = Math.abs(1 / rdx);
      const deltaY = Math.abs(1 / rdy);
      let stepX: number, stepY: number, sideX: number, sideY: number;
      if (rdx < 0) { stepX = -1; sideX = (px - mapX) * deltaX; }
      else { stepX = 1; sideX = (mapX + 1 - px) * deltaX; }
      if (rdy < 0) { stepY = -1; sideY = (py - mapY) * deltaY; }
      else { stepY = 1; sideY = (mapY + 1 - py) * deltaY; }
      let side = 0, hit = 0;
      for (let i = 0; i < 64 && !hit; i++) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
        else { sideY += deltaY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= MAP_W || mapY >= MAP_H) { hit = 1; break; }
        const v = MAP[mapY][mapX];
        if (v === 4) {
          if (ignoreDoors) continue;
          const d = doors.get(doorKey(mapX, mapY));
          if (d && d.openness >= 1) continue; // fully open — see through
          hit = 4;
        } else if (v > 0) hit = v;
      }
      const dist = side === 0 ? (sideX - deltaX) : (sideY - deltaY);
      return { dist: Math.max(0.0001, dist), side, hit, mapX, mapY };
    }


    function tryUseDoor() {
      if (player.hp <= 0) return;
      const cos = Math.cos(player.dir), sin = Math.sin(player.dir);
      for (let step = 0.4; step <= 1.6; step += 0.25) {
        const tx = Math.floor(player.x + cos * step);
        const ty = Math.floor(player.y + sin * step);
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (MAP[ty][tx] !== 4) continue;
        const d = doors.get(doorKey(tx, ty));
        if (!d) continue;
        if (d.state === "closed" || d.state === "closing") d.state = "opening";
        else if (d.state === "open") { d.state = "closing"; d.holdT = 0; }
        return;
      }
    }

    function updateDoors(dt: number) {
      const pcx = Math.floor(player.x), pcy = Math.floor(player.y);
      for (const [k, d] of doors) {
        if (d.state === "opening") {
          d.openness = Math.min(1, d.openness + dt * 1.4);
          if (d.openness >= 1) { d.state = "open"; d.holdT = 5; }
        } else if (d.state === "open") {
          d.holdT -= dt;
          const cx = k % MAP_W, cy = (k / MAP_W) | 0;
          // don't auto-close on top of player
          if (d.holdT <= 0 && !(cx === pcx && cy === pcy)) d.state = "closing";
        } else if (d.state === "closing") {
          const cx = k % MAP_W, cy = (k / MAP_W) | 0;
          if (cx === pcx && cy === pcy) { d.state = "opening"; continue; }
          d.openness = Math.max(0, d.openness - dt * 1.4);
          if (d.openness <= 0) d.state = "closed";
        }
      }
    }


    const zbuf = new Float32Array(W);
    const FOV = Math.PI / 3;
    const TAN_HALF = Math.tan(FOV / 2);

    let last = performance.now();
    let raf = 0;
    let running = true;

    function tryMove(nx: number, ny: number) {
      const pad = 0.18;
      if (isWall(nx + pad, player.y) === 0 && isWall(nx - pad, player.y) === 0) player.x = nx;
      if (isWall(player.x, ny + pad) === 0 && isWall(player.x, ny - pad) === 0) player.y = ny;
    }

    function update(dt: number) {
      const speed = (keys["ShiftLeft"] || keys["ShiftRight"] ? 4.5 : 2.6) * dt;
      const rot = 1.8 * dt;
      let fwd = 0, str = 0;
      if (keys["KeyW"] || keys["ArrowUp"]) fwd += 1;
      if (keys["KeyS"] || keys["ArrowDown"]) fwd -= 1;
      if (keys["KeyD"]) str += 1;
      if (keys["KeyA"]) str -= 1;
      if (keys["ArrowLeft"]) player.dir -= rot;
      if (keys["ArrowRight"]) player.dir += rot;
      const cos = Math.cos(player.dir), sin = Math.sin(player.dir);
      if (fwd || str) {
        const nx = player.x + (cos * fwd - sin * str) * speed;
        const ny = player.y + (sin * fwd + cos * str) * speed;
        tryMove(nx, ny);
      }
      if (player.muzzle > 0) player.muzzle -= dt;
      updateDoors(dt);

      for (const e of enemies) {
        if (!e.alive) { if (e.dieT > 0) e.dieT -= dt; continue; }
        if (e.hurtT > 0) e.hurtT -= dt;
        const dx = player.x - e.x, dy = player.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 8) {
          const sx = dx / d, sy = dy / d;
          const wallD = castRay(e.x, e.y, sx, sy).dist;
          if (wallD > d - 0.2) {
            if (d > 1.1) {
              const sp = 1.1 * dt;
              const nx = e.x + sx * sp, ny = e.y + sy * sp;
              if (isWall(nx, e.y) === 0) e.x = nx;
              if (isWall(e.x, ny) === 0) e.y = ny;
            }
            e.fireCd -= dt;
            if (e.fireCd <= 0 && d < 7) {
              e.fireCd = 1.6 + Math.random() * 0.8;
              projectiles.push({ x: e.x, y: e.y, dx: sx * 4.2, dy: sy * 4.2, life: 3 });
            }
          }
        }
      }

      for (const p of projectiles) {
        p.life -= dt;
        const nx = p.x + p.dx * dt, ny = p.y + p.dy * dt;
        if (isWall(nx, ny)) { p.life = 0; continue; }
        p.x = nx; p.y = ny;
        const dd = Math.hypot(p.x - player.x, p.y - player.y);
        if (dd < 0.3) { p.life = 0; player.hp -= 8; if (player.hp < 0) player.hp = 0; }
      }
      for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].life <= 0) projectiles.splice(i, 1);

      const kills = enemies.filter((e) => !e.alive).length;
      const won = kills === enemies.length;
      setHud({ hp: Math.round(player.hp), ammo: player.ammo, kills, total: enemies.length, dead: player.hp <= 0, won });
    }

    function shadePacked(c: number, m: number) {
      const r = (c & 0xff) * m;
      const g = ((c >> 8) & 0xff) * m;
      const b = ((c >> 16) & 0xff) * m;
      return packRGB(r, g, b);
    }

    function renderFloorCeiling() {
      const dirX = Math.cos(player.dir), dirY = Math.sin(player.dir);
      const planeX = -Math.sin(player.dir) * TAN_HALF;
      const planeY = Math.cos(player.dir) * TAN_HALF;
      const halfH = H / 2;
      const posZ = halfH;
      for (let y = (halfH | 0) + 1; y < H; y++) {
        const p = y - halfH;
        const rowDist = posZ / p;
        const stepX = (rowDist * 2 * planeX) / W;
        const stepY = (rowDist * 2 * planeY) / W;
        let fx = player.x + rowDist * (dirX - planeX);
        let fy = player.y + rowDist * (dirY - planeY);
        const fog = Math.max(0.15, 1 - rowDist / 12);
        const ceilFog = fog * 0.82;
        const floorRow = y * W;
        const ceilY = (H - y - 1);
        const ceilRow = ceilY * W;
        for (let x = 0; x < W; x++) {
          const tx = ((fx * TS) | 0) & (TS - 1);
          const ty = ((fy * TS) | 0) & (TS - 1);
          const idx = ((ty < 0 ? ty + TS : ty) * TS) + (tx < 0 ? tx + TS : tx);
          buf[floorRow + x] = shadePacked(TEX_FLOOR[idx], fog);
          buf[ceilRow + x] = shadePacked(TEX_CEIL[idx], ceilFog);
          fx += stepX;
          fy += stepY;
        }
      }
      // top row above horizon not covered if H even
      const ceilStartY = H - ((halfH | 0) + 1);
      for (let y = 0; y < ceilStartY; y++) {
        // already filled by mirrored loop (ceilY = H-y-1 covers down to ceilStartY)
        if (y >= ceilStartY) break;
      }
    }

    function drawWallColumn(x: number, r: ReturnType<typeof castRay>, rdx: number, rdy: number, perp: number, doorOverlay: boolean) {
      const lineH = (H / perp) | 0;
      const drawStart = Math.max(0, ((H - lineH) / 2) | 0);
      const drawEnd = Math.min(H, ((H + lineH) / 2) | 0);
      let wallX: number;
      if (r.side === 0) wallX = player.y + r.dist * rdy;
      else wallX = player.x + r.dist * rdx;
      wallX -= Math.floor(wallX);
      let texX = (wallX * TS) | 0;
      if (r.side === 0 && rdx > 0) texX = TS - texX - 1;
      if (r.side === 1 && rdy < 0) texX = TS - texX - 1;
      if (texX < 0) texX = 0; else if (texX >= TS) texX = TS - 1;
      const tex = WALL_TEX[r.hit] || TEX_CONCRETE;
      const shade = r.side === 1 ? 0.7 : 1;
      const fog = Math.max(0.18, 1 - perp / 12);
      const m = shade * fog;
      const step = TS / lineH;
      let texPos = (drawStart - H / 2 + lineH / 2) * step;
      let doorShift = 0;
      if (doorOverlay && r.hit === 4) {
        const d = doors.get(doorKey(r.mapX, r.mapY));
        if (d) doorShift = d.openness * TS;
      }
      for (let y = drawStart; y < drawEnd; y++) {
        let tY = (texPos + doorShift) | 0;
        texPos += step;
        if (tY >= TS) continue;
        if (tY < 0) tY = 0;
        buf[y * W + x] = shadePacked(tex[tY * TS + texX], m);
      }
    }

    function renderWalls() {
      const cosD = Math.cos(player.dir), sinD = Math.sin(player.dir);
      for (let x = 0; x < W; x++) {
        const camX = 2 * x / W - 1;
        const rdx = cosD - sinD * camX * TAN_HALF;
        const rdy = sinD + cosD * camX * TAN_HALF;
        // Cast ignoring doors → back wall (always render, so map keeps showing as door opens)
        const rBack = castRay(player.x, player.y, rdx, rdy, true);
        const ang = Math.atan2(rdy, rdx) - player.dir;
        const perpBack = rBack.dist * Math.cos(ang);
        drawWallColumn(x, rBack, rdx, rdy, perpBack, false);
        zbuf[x] = perpBack;
      }
    }

    function renderDoors() {
      const cosD = Math.cos(player.dir), sinD = Math.sin(player.dir);
      for (let x = 0; x < W; x++) {
        const camX = 2 * x / W - 1;
        const rdx = cosD - sinD * camX * TAN_HALF;
        const rdy = sinD + cosD * camX * TAN_HALF;
        const r = castRay(player.x, player.y, rdx, rdy, false);
        if (r.hit !== 4) continue;
        const d = doors.get(doorKey(r.mapX, r.mapY));
        if (!d || d.openness >= 1) continue;
        const ang = Math.atan2(rdy, rdx) - player.dir;
        const perp = r.dist * Math.cos(ang);
        if (perp > zbuf[x]) continue; // back wall is closer (shouldn't happen, but guard)
        drawWallColumn(x, r, rdx, rdy, perp, true);
      }
    }

    function renderSprites() {
      type S = { x: number; y: number; kind: "enemy" | "proj"; ref?: Enemy };
      const sprites: S[] = [];
      for (const e of enemies) if (e.alive || e.dieT > 0) sprites.push({ x: e.x, y: e.y, kind: "enemy", ref: e });
      for (const p of projectiles) sprites.push({ x: p.x, y: p.y, kind: "proj" });
      sprites.sort((a, b) => {
        const da = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
        const db = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
        return db - da;
      });
      const cosD = Math.cos(-player.dir), sinD = Math.sin(-player.dir);
      for (const s of sprites) {
        const sx = s.x - player.x, sy = s.y - player.y;
        const tx = sx * cosD - sy * sinD;
        const ty = sx * sinD + sy * cosD;
        if (tx <= 0.05) continue;
        const screenX = ((W / 2) * (1 + ty / (tx * TAN_HALF))) | 0;
        const size = s.kind === "enemy" ? Math.min(H * 2, (H / tx) | 0) : Math.min(H, (H / tx / 4) | 0);
        const drawStartY = ((H - size) / 2) | 0;
        const drawStartX = (screenX - size / 2) | 0;
        const fog = Math.max(0.2, 1 - tx / 14);
        for (let stripe = 0; stripe < size; stripe++) {
          const px = drawStartX + stripe;
          if (px < 0 || px >= W) continue;
          if (tx >= zbuf[px]) continue;
          if (s.kind === "proj") {
            const c = packRGB(255 * fog, 180 * fog, 60 * fog);
            for (let y = drawStartY; y < drawStartY + size && y < H; y++) {
              if (y < 0) continue;
              buf[y * W + px] = c;
            }
          } else {
            drawEnemyStripe(buf, W, H, s.ref!, px, drawStartY, stripe, size, fog);
          }
        }
      }
    }

    function render() {
      renderFloorCeiling();
      renderWalls();
      renderSprites();
      renderDoors();
      ctx.putImageData(frame, 0, 0);

      drawGun(ctx, W, H, player.muzzle > 0);
      // crosshair
      ctx.fillStyle = "rgba(220,255,200,0.7)";
      ctx.fillRect(W / 2 - 1, H / 2 - 6, 2, 4);
      ctx.fillRect(W / 2 - 1, H / 2 + 2, 2, 4);
      ctx.fillRect(W / 2 - 6, H / 2 - 1, 4, 2);
      ctx.fillRect(W / 2 + 2, H / 2 - 1, 4, 2);
      drawMiniMap(ctx, player, enemies);
      if (player.hp < 100) {
        const v = (100 - player.hp) / 100;
        ctx.fillStyle = `rgba(180,0,0,${0.05 + v * 0.15})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function loop(t: number) {
      if (!running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (player.hp > 0) update(dt);
      render();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [started]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-4 text-zinc-100">
      <h1 className="font-mono text-2xl tracking-[0.3em] text-red-500">CRIMSON CORRIDORS</h1>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block border-2 border-red-900 shadow-[0_0_40px_rgba(180,0,0,0.4)]"
          style={{ width: 800, height: 500, imageRendering: "pixelated", cursor: "crosshair" }}
        />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
            <p className="font-mono text-sm text-zinc-300">WASD move · MOUSE look · CLICK shoot · SPACE open door · SHIFT run</p>
            <button
              onClick={() => setStarted(true)}
              className="rounded border border-red-600 bg-red-900/40 px-6 py-2 font-mono text-lg tracking-widest text-red-200 hover:bg-red-900/70"
            >
              ENTER THE BUNKER
            </button>
          </div>
        )}
        {started && hud.dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="font-mono text-3xl text-red-500">YOU DIED</p>
            <button onClick={() => { setStarted(false); setTimeout(() => setStarted(true), 50); }} className="rounded border border-red-600 bg-red-900/40 px-4 py-2 font-mono text-red-100 hover:bg-red-900/70">Restart</button>
          </div>
        )}
        {started && hud.won && !hud.dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="font-mono text-3xl text-amber-400">BUNKER CLEARED</p>
            <button onClick={() => { setStarted(false); setTimeout(() => setStarted(true), 50); }} className="rounded border border-amber-600 bg-amber-900/40 px-4 py-2 font-mono text-amber-100 hover:bg-amber-900/70">Play again</button>
          </div>
        )}
      </div>
      <div className="flex w-[800px] max-w-full items-center justify-between gap-4 border border-red-900 bg-zinc-950 px-4 py-2 font-mono text-sm">
        <span>HP <span className="text-red-400">{hud.hp}</span></span>
        <FaceHUD hp={hud.hp} />
        <span>AMMO <span className="text-amber-300">{hud.ammo}</span></span>
        <span>KILLS <span className="text-zinc-200">{hud.kills}/{hud.total}</span></span>
        <button
          onClick={() => setMusic((m) => !m)}
          className="rounded border border-red-900 px-2 py-0.5 text-xs tracking-widest text-red-300 hover:bg-red-900/40"
        >
          {music ? "♪ MUSIC ON" : "♪ MUSIC OFF"}
        </button>
      </div>

    </div>
  );
}

function drawEnemyStripe(
  buf: Uint32Array,
  W: number,
  H: number,
  e: Enemy,
  px: number,
  startY: number,
  stripe: number,
  size: number,
  fog: number,
) {
  // WW1 infantry soldier: Brodie helmet, greatcoat, puttees, rifle slung across chest.
  const u = stripe / size;
  const dying = !e.alive;
  const tint = e.hurtT > 0;
  for (let sy = 0; sy < size; sy++) {
    const y = startY + sy;
    if (y < 0 || y >= H) continue;
    let v = sy / size;
    // Dying: collapse sprite downward
    if (dying) {
      if (v < 0.55) continue;
      v = 0.55 + (v - 0.55) * 0.7;
    }

    let r = -1, g = 0, b = 0;

    // --- Brodie helmet (wide flat brim + dome) ---
    // brim: v 0.16-0.20, u 0.28-0.72
    if (v >= 0.16 && v <= 0.205 && u >= 0.28 && u <= 0.72) {
      r = 70; g = 78; b = 52;
    }
    // dome: ellipse above brim
    const hdx = (u - 0.5) / 0.18;
    const hdy = (v - 0.16) / 0.12;
    if (hdx * hdx + hdy * hdy < 1 && v < 0.18) {
      const lift = 1 - (hdx * hdx + hdy * hdy) * 0.4;
      r = 78 * lift; g = 86 * lift; b = 58 * lift;
    }

    // --- Face under brim ---
    const fdx = (u - 0.5) / 0.07;
    const fdy = (v - 0.255) / 0.045;
    if (r < 0 && fdx * fdx + fdy * fdy < 1) {
      r = 198; g = 162; b = 130;
      // eyes (shadow under brim)
      if (Math.abs(v - 0.245) < 0.012 && (Math.abs(u - 0.46) < 0.018 || Math.abs(u - 0.54) < 0.018)) {
        r = 30; g = 25; b = 20;
      }
      // moustache
      if (Math.abs(v - 0.275) < 0.008 && Math.abs(u - 0.5) < 0.04) {
        r = 60; g = 45; b = 30;
      }
    }

    // --- Greatcoat torso (trapezoid, wider at bottom) ---
    if (r < 0) {
      const coatTop = 0.30, coatBot = 0.66;
      if (v >= coatTop && v <= coatBot) {
        const t = (v - coatTop) / (coatBot - coatTop);
        const halfW = 0.16 + t * 0.10; // flares slightly
        if (Math.abs(u - 0.5) < halfW) {
          const shade = 1 - Math.abs(u - 0.5) / (halfW + 0.05) * 0.45;
          r = 92 * shade; g = 98 * shade; b = 70 * shade;
          // collar shadow
          if (v < 0.34) { r *= 0.7; g *= 0.7; b *= 0.7; }
          // belt
          if (Math.abs(v - 0.50) < 0.012) { r = 55; g = 38; b = 22; }
          // brass buckle
          if (Math.abs(v - 0.50) < 0.012 && Math.abs(u - 0.5) < 0.02) { r = 180; g = 150; b = 60; }
          // buttons down center
          const btn = ((v * 12) | 0);
          if (Math.abs(u - 0.5) < 0.012 && (v < 0.49) && btn % 2 === 0 && v > 0.34) {
            r = 170; g = 140; b = 55;
          }
        }
      }
    }

    // --- Legs / puttees ---
    if (r < 0) {
      if (v > 0.66 && v < 0.92) {
        // two legs
        const onLeft = Math.abs(u - 0.42) < 0.055;
        const onRight = Math.abs(u - 0.58) < 0.055;
        if (onLeft || onRight) {
          // wrapped puttee diagonal stripes
          const stripeBand = ((v * 60 + u * 30) | 0) % 4;
          const base = stripeBand === 0 ? 78 : 105;
          r = base * 1.0; g = base * 0.92; b = base * 0.62;
        }
      }
      // boots
      if (v >= 0.92 && v <= 0.98) {
        const onLeft = Math.abs(u - 0.42) < 0.07;
        const onRight = Math.abs(u - 0.58) < 0.07;
        if (onLeft || onRight) { r = 38; g = 28; b = 18; }
      }
    }

    // --- Rifle slung diagonally across chest (upper-left to lower-right) ---
    if (r < 0 || (v > 0.32 && v < 0.7)) {
      // line: u = 0.22 + (v-0.30)*1.0  (slope ~1)
      const lineU = 0.22 + (v - 0.30) * 1.05;
      const dU = u - lineU;
      if (v > 0.30 && v < 0.72 && Math.abs(dU) < 0.018) {
        // wood stock vs metal barrel: upper third metal, lower wood
        if (v < 0.45) { r = 55; g = 55; b = 60; }
        else { r = 92; g = 58; b = 30; }
      }
      // bayonet tip beyond barrel (upper-left)
      if (v > 0.24 && v < 0.31 && Math.abs(u - (0.22 + (v - 0.30) * 1.05)) < 0.01) {
        r = 180; g = 180; b = 185;
      }
    }

    // --- Arms (sleeves of greatcoat) ---
    if (r < 0) {
      const armV = v > 0.34 && v < 0.58;
      const leftArm = Math.abs(u - 0.28) < 0.05 && armV;
      const rightArm = Math.abs(u - 0.72) < 0.05 && armV;
      if (leftArm || rightArm) {
        r = 78; g = 84; b = 58;
      }
    }

    if (r < 0) continue;
    if (tint) { r = Math.min(255, r + 110); g = Math.max(0, g - 20); b = Math.max(0, b - 20); }
    buf[y * W + px] = packRGB(r * fog, g * fog, b * fog);
  }
}


function drawGun(ctx: CanvasRenderingContext2D, W: number, H: number, flash: boolean) {
  const gx = W / 2;
  const gy = H;
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(gx - 22, gy - 110, 44, 80);
  ctx.fillStyle = "#444";
  ctx.fillRect(gx - 8, gy - 140, 16, 40);
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(gx - 28, gy - 60, 56, 60);
  ctx.fillStyle = "#555";
  ctx.fillRect(gx - 22, gy - 110, 44, 4);
  if (flash) {
    ctx.fillStyle = "rgba(255,220,80,0.9)";
    ctx.beginPath();
    ctx.arc(gx, gy - 145, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(gx, gy - 145, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiniMap(ctx: CanvasRenderingContext2D, player: { x: number; y: number; dir: number }, enemies: Enemy[]) {
  const s = 6;
  const ox = 8, oy = 8;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(ox - 2, oy - 2, MAP_W * s + 4, MAP_H * s + 4);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const v = MAP[y][x];
      if (v === 0) ctx.fillStyle = "#222";
      else if (v === 1) ctx.fillStyle = "#6b6b66";
      else if (v === 2) ctx.fillStyle = "#a08858";
      else if (v === 4) ctx.fillStyle = "#d4a020";
      else ctx.fillStyle = "#56603a";
      ctx.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
    }
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = "#f44";
    ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 3, 3);
  }
  ctx.fillStyle = "#6f6";
  ctx.fillRect(ox + player.x * s - 1, oy + player.y * s - 1, 3, 3);
  ctx.strokeStyle = "#6f6";
  ctx.beginPath();
  ctx.moveTo(ox + player.x * s, oy + player.y * s);
  ctx.lineTo(ox + (player.x + Math.cos(player.dir) * 1.5) * s, oy + (player.y + Math.sin(player.dir) * 1.5) * s);
  ctx.stroke();
}
