import './style.css';

interface Particle { x: number; y: number; vx: number; vy: number; hue: number }

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const pointer = { x: -1e4, y: -1e4 };
let particles: Particle[] = [];
let w = 0;
let h = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.round((w * h) / 2500);
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    hue: 200 + Math.random() * 120,
  }));
}

function tick() {
  ctx.fillStyle = 'rgba(7, 7, 12, 0.25)';
  ctx.fillRect(0, 0, w, h);
  for (const p of particles) {
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 120 * 120) {
      const f = (1 - Math.sqrt(d2) / 120) * 0.6;
      p.vx += (dx / Math.sqrt(d2 + 1)) * f;
      p.vy += (dy / Math.sqrt(d2 + 1)) * f;
    }
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.vx += (Math.random() - 0.5) * 0.05;
    p.vy += (Math.random() - 0.5) * 0.05;
    p.x = (p.x + p.vx + w) % w;
    p.y = (p.y + p.vy + h) % h;
    ctx.fillStyle = `hsl(${p.hue} 90% 65%)`;
    ctx.fillRect(p.x, p.y, 1.6, 1.6);
  }
  requestAnimationFrame(tick);
}

window.addEventListener('resize', resize);
window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
window.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });

resize();
tick();
