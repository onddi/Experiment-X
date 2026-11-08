// A single draggable carousel. Position is a float in "item units":
// 0 shows the first item, 1 the second, 2.5 is halfway between the third and fourth.
// Rendering places each item at (index - position) * 100% along the axis,
// which makes looping a matter of wrapping that offset.

export type Axis = 'x' | 'y';
export type Effect = 'slide' | 'depth' | 'fade' | 'cube';

export interface Physics {
  /** Spring stiffness used when snapping to an item. */
  tension: number;
  /** How far a flick carries, in seconds of travel at release velocity. */
  flick: number;
}

export interface CarouselItem {
  word: string;
  color: string;
  ink: string;
  /** Optional photo shown instead of the flat color. */
  image?: string;
  /** Brightness correction for the photo (1 = as shot). */
  exposure?: number;
  /** Which theme group (e.g. element) this item belongs to. */
  group?: number;
}

export class Carousel {
  readonly el: HTMLElement;
  private readonly itemEls: HTMLElement[] = [];
  private readonly dotEls: HTMLElement[] = [];
  private readonly dots: HTMLElement;

  pos = 0;
  private vel = 0; // items per second
  private target: number | null = null;
  private raf = 0;
  private lastT = 0;

  /** Set by the grid; called whenever this carousel moves. */
  onMove: ((c: Carousel) => void) | null = null;
  /** Set by the grid; called on a click/tap (or Enter) that didn't drag. */
  onTap: ((c: Carousel) => void) | null = null;
  /** Set by the grid; lets a drag on this carousel drive others. */
  linked: () => Carousel[] = () => [];

  constructor(
    private items: CarouselItem[],
    public axis: Axis,
    public loop: boolean,
    public effect: Effect,
    private physics: Physics,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'carousel';
    this.el.tabIndex = 0;
    this.el.dataset.axis = axis;
    this.el.dataset.effect = effect;

    for (let i = 0; i < items.length; i++) {
      const el = document.createElement('div');
      el.className = 'item';
      const span = document.createElement('span');
      const tint = document.createElement('i');
      tint.className = 'tint';
      el.append(span, tint);
      this.el.append(el);
      this.itemEls.push(el);
    }

    this.dots = document.createElement('div');
    this.dots.className = 'dots';
    for (let i = 0; i < items.length; i++) {
      const d = document.createElement('i');
      this.dots.append(d);
      this.dotEls.push(d);
    }
    this.el.append(this.dots);

    this.setItems(items);
    this.bindPointer();
    this.bindKeys();
  }

  get count() {
    return this.items.length;
  }

  /** Unwrapped index the carousel is resting at or heading to. */
  get destination() {
    return this.target ?? Math.round(this.pos);
  }

  /** Index of the item currently closest to centre (0..count-1). */
  get currentItem(): CarouselItem | undefined {
    return this.items[this.index];
  }

  /** Item index (unwrapped, nearest to where it rests) whose group is g. */
  nearestInGroup(g: number): number | null {
    const base = this.destination;
    const n = this.count;
    for (let d = 0; d <= n; d++) {
      for (const t of d === 0 ? [base] : [base + d, base - d]) {
        if (!this.loop && (t < 0 || t > n - 1)) continue;
        if (this.items[mod(t, n)]?.group === g) return t;
      }
    }
    return null;
  }

  /** Element of the item currently closest to centre. */
  get currentEl(): HTMLElement {
    return this.itemEls[this.index];
  }

  get index() {
    const i = Math.round(this.pos);
    return this.loop ? mod(i, this.count) : clamp(i, 0, this.count - 1);
  }

  setItems(items: CarouselItem[]) {
    this.items = items;
    items.forEach((item, i) => {
      const el = this.itemEls[i];
      el.style.backgroundColor = item.color;
      el.style.color = item.ink;
      el.style.backgroundImage = item.image ? `url("${item.image}")` : '';
      el.classList.toggle('img', Boolean(item.image));
      if (item.group === undefined) delete el.dataset.group;
      else el.dataset.group = String(item.group);
      el.style.setProperty('--exposure', String(item.exposure ?? 1));
      el.firstElementChild!.textContent = item.word;
    });
    this.render();
  }

  setPhysics(p: Physics) {
    this.physics = p;
  }

  setEffect(effect: Effect) {
    this.effect = effect;
    this.el.dataset.effect = effect;
    this.render();
  }

  /** Jump without animating. */
  jumpTo(pos: number) {
    this.stop();
    this.pos = this.loop ? pos : clamp(pos, 0, this.count - 1);
    this.render();
  }

  /** Animate to an item index (unbounded when looping). */
  goTo(target: number, velocity = this.vel) {
    if (!this.loop) target = clamp(target, 0, this.count - 1);
    this.target = target;
    this.vel = velocity;
    this.start();
  }

  step(dir: 1 | -1) {
    const base = this.target ?? Math.round(this.pos);
    this.goTo(base + dir);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.target = null;
  }

  // --- rendering -----------------------------------------------------------

  render() {
    const n = this.count;
    const pos = this.loop ? this.pos : this.rubber(this.pos);
    const axis = this.axis === 'x' ? 'X' : 'Y';
    for (let i = 0; i < n; i++) {
      let off = i - pos;
      if (this.loop) off = mod(off + n / 2, n) - n / 2;
      const el = this.itemEls[i];
      const a = Math.abs(off);
      if (a >= 1.5) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      if (this.effect === 'cube') {
        // Each item is a face of a box that turns around the cell's centre.
        // Only the two faces touching the current turn are ever visible.
        if (a >= 1) {
          el.style.visibility = 'hidden';
          continue;
        }
        const half = this.axis === 'x' ? 'var(--half-w)' : 'var(--half-h)';
        const rot = this.axis === 'x' ? `rotateY(${off * 90}deg)` : `rotateX(${-off * 90}deg)`;
        // Optionally sink the whole box back mid-turn so it bulges less over neighbours.
        const sink = Math.sin(Math.PI * (pos - Math.floor(pos))).toFixed(4);
        // A face resting square-on needs no 3D transform; leaving it flat keeps
        // the resting cell out of its own GPU layer (see style.css).
        el.style.transform =
          a < 0.0005
            ? ''
            : `translateZ(calc(${half} * -1 - ${sink} * var(--pullback, 0) * ${half} * 2)) ${rot} translateZ(${half})`;
        el.style.opacity = '';
        el.style.zIndex = '';
        el.style.setProperty('--turn', `calc(1 - ${a.toFixed(4)} * var(--shade, 0.35))`);
        continue;
      }
      el.style.removeProperty('--turn');
      if (this.effect === 'fade') {
        el.style.transform = '';
        el.style.opacity = String(clamp(1 - a, 0, 1));
        el.style.zIndex = String(a < 0.5 ? 1 : 0);
      } else if (this.effect === 'depth') {
        const s = 1 - Math.min(a, 1) * 0.25;
        el.style.transform = `translate${axis}(${off * 100}%) scale(${s})`;
        el.style.opacity = String(1 - Math.min(a, 1) * 0.5);
        el.style.zIndex = '';
      } else {
        el.style.transform = `translate${axis}(${off * 100}%)`;
        el.style.opacity = '';
        el.style.zIndex = '';
      }
    }
    this.el.classList.toggle('moving', Math.abs(pos - Math.round(pos)) > 0.001);
    const active = this.index;
    this.dotEls.forEach((d, i) => d.classList.toggle('on', i === active));
    this.onMove?.(this);
  }

  /** Soft resistance past the first/last item when not looping. */
  private rubber(pos: number) {
    const max = this.count - 1;
    if (pos < 0) return -resist(-pos);
    if (pos > max) return max + resist(pos - max);
    return pos;
  }

  // --- animation -----------------------------------------------------------

  private start() {
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (t: number) => {
    const dt = Math.min((t - this.lastT) / 1000, 1 / 30);
    this.lastT = t;
    if (this.target === null) {
      this.raf = 0;
      return;
    }
    // Critically damped spring towards the target.
    const k = this.physics.tension;
    const c = 2 * Math.sqrt(k);
    const acc = -k * (this.pos - this.target) - c * this.vel;
    this.vel += acc * dt;
    this.pos += this.vel * dt;
    if (Math.abs(this.pos - this.target) < 0.0005 && Math.abs(this.vel) < 0.01) {
      this.pos = this.target;
      this.vel = 0;
      this.target = null;
      this.normalize();
      this.render();
      this.raf = 0;
      return;
    }
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Keep a looping position near 0..count so floats don't drift forever. */
  private normalize() {
    if (this.loop) this.pos = mod(this.pos, this.count);
  }

  // --- input ---------------------------------------------------------------

  private bindPointer() {
    let pointerId = -1;
    let startCoord = 0;
    let startX = 0;
    let startY = 0;
    let moved = 0;
    let startPos = 0;
    let size = 1;
    let samples: { t: number; p: number }[] = [];
    let followers: { c: Carousel; start: number }[] = [];

    const coord = (e: PointerEvent) => (this.axis === 'x' ? e.clientX : e.clientY);

    this.el.addEventListener('pointerdown', (e) => {
      if (pointerId !== -1 || e.button !== 0) return;
      pointerId = e.pointerId;
      this.el.setPointerCapture(pointerId);
      this.el.classList.add('dragging');
      const rect = this.el.getBoundingClientRect();
      size = (this.axis === 'x' ? rect.width : rect.height) || 1;
      this.stop();
      startCoord = coord(e);
      startX = e.clientX;
      startY = e.clientY;
      moved = 0;
      startPos = this.pos;
      samples = [{ t: e.timeStamp, p: this.pos }];
      followers = this.linked().map((c) => {
        c.stop();
        return { c, start: c.pos };
      });
    });

    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      moved = Math.max(moved, Math.hypot(e.clientX - startX, e.clientY - startY));
      // Dragging left/up moves to the next item.
      this.pos = startPos - (coord(e) - startCoord) / size;
      this.render();
      const delta = this.pos - startPos;
      for (const f of followers) {
        f.c.pos = f.start + delta;
        f.c.render();
      }
      samples.push({ t: e.timeStamp, p: this.pos });
      if (samples.length > 6) samples.shift();
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      this.el.classList.remove('dragging');
      const v = velocity(samples, e.timeStamp);
      const projected = this.pos + v * this.physics.flick;
      // Never skip more items than the flick really earned, but always move
      // at least one item on a quick flick that didn't cross the halfway mark.
      let target = Math.round(projected);
      if (target === Math.round(startPos) && Math.abs(v) > 1.2) {
        target = Math.round(startPos) + Math.sign(v);
      }
      this.goTo(target, v);
      const jump = (this.target ?? target) - Math.round(startPos);
      for (const f of followers) f.c.goTo(Math.round(f.start) + jump, v);
      followers = [];
      // A press that barely moved is a tap, not a drag.
      if (e.type === 'pointerup' && moved < 6 && Math.abs(v) < 0.5) this.onTap?.(this);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private bindKeys() {
    this.el.addEventListener('keydown', (e) => {
      const next = this.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      const prev = this.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
      if (e.key === 'Enter' || e.key === ' ') this.onTap?.(this);
      else if (e.key === next) this.step(1);
      else if (e.key === prev) this.step(-1);
      else return;
      e.preventDefault();
    });
  }
}

function velocity(samples: { t: number; p: number }[], now: number) {
  // Ignore stale samples (pointer held still before release).
  const recent = samples.filter((s) => now - s.t < 100);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? (b.p - a.p) / dt : 0;
}

function resist(over: number) {
  // Approaches 0.3 of an item no matter how far you pull.
  return (over * 0.3) / (over + 0.3);
}

export function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
