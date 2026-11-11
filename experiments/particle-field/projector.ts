/**
 * Project the field to a second window (a projector or another display):
 * just the picture, no menus. The main window keeps every control, the
 * sound and the camera; each frame it draws the finished picture straight
 * into the second window's canvas, so the two never drift apart.
 *
 * Chrome and Edge can place the window on the other display (Window
 * Management API, asked once); elsewhere you drag it there. Fullscreen
 * needs one click or F inside the window, a browser rule.
 */
import { paintField, type RecordHost } from './record.ts';

type Host = Pick<RecordHost, 'source' | 'size' | 'filter' | 'transform' | 'bg' | 'overlay'> & {
  /** Keys pressed in the projector window run as shortcuts here. */
  key: (e: KeyboardEvent) => void;
  onChange: () => void;
};

interface ScreenLike { availLeft: number; availTop: number; availWidth: number; availHeight: number; left: number; top: number; width: number; height: number }
interface ScreenDetailsLike { screens: ScreenLike[]; currentScreen: ScreenLike }
type WinWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };

const NAME = 'particle-field-projector';
const MAX_SIDE = 3840;

export class Projector {
  private win: Window | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private cv: HTMLCanvasElement | null = null;
  /** The other display, once the browser has told us about it. */
  private other: ScreenLike | null = null;

  constructor(private host: Host) {
    // If screen placement was allowed before, learn the displays quietly now,
    // so the window can open straight on the other one.
    void this.knownScreens();
  }

  get on() {
    return !!this.win && !this.win.closed;
  }

  toggle() {
    if (this.on) this.stop();
    else this.start();
  }

  /** Call from a click or key press (pop-up blockers need one). */
  start() {
    if (this.on) return this.win!.focus();
    const o = this.other;
    const feat = o
      ? `popup,left=${o.availLeft},top=${o.availTop},width=${o.availWidth},height=${o.availHeight}`
      : `popup,width=960,height=540,left=${Math.max(0, screenX + 40)},top=${Math.max(0, screenY + 40)}`;
    const win = window.open('', NAME, feat);
    if (!win) return false;
    this.win = win;
    this.build(win);
    if (!o) void this.placeLater(win);
    this.host.onChange();
    return true;
  }

  stop() {
    const w = this.win;
    this.win = this.g = this.cv = null;
    try { w?.close(); } catch {}
    this.host.onChange();
  }

  /** Call once per animation frame, after everything is drawn. */
  tick() {
    if (!this.win) return;
    if (this.win.closed) {
      this.win = this.g = this.cv = null;
      this.host.onChange();
      return;
    }
    const cv = this.cv;
    const g = this.g;
    if (!cv || !g) return;
    const r = this.win.devicePixelRatio || 1;
    let W = Math.round(this.win.innerWidth * r);
    let H = Math.round(this.win.innerHeight * r);
    const k = Math.min(1, MAX_SIDE / Math.max(W, H, 1));
    W = Math.max(2, Math.round(W * k));
    H = Math.max(2, Math.round(H * k));
    if (cv.width !== W || cv.height !== H) (cv.width = W), (cv.height = H);
    paintField(g, W, H, this.host);
  }

  private build(win: Window) {
    const d = win.document;
    d.title = 'Particle field · projector';
    d.body.innerHTML = '';
    d.head.innerHTML = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; width: 100vw; height: 100vh; }
      body.idle { cursor: none; }
      .hint { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 10px 16px; border-radius: 12px; background: rgb(20 22 32 / 0.85); color: #dfe3ff; font: 14px/1.4 system-ui, sans-serif; text-align: center; pointer-events: none; transition: opacity 0.4s; }
      body.idle .hint, :fullscreen .hint { opacity: 0; }
    </style>`;
    const cv = d.createElement('canvas');
    const hint = d.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Click or press F for fullscreen · Esc leaves it';
    d.body.append(cv, hint);
    this.cv = cv;
    this.g = cv.getContext('2d', { alpha: false });
    const full = () => {
      if (d.fullscreenElement) void d.exitFullscreen();
      else void d.documentElement.requestFullscreen?.().catch(() => {});
    };
    d.addEventListener('click', full);
    d.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) return full();
      this.host.key(e);
    });
    // The pointer hides when it rests.
    let t = 0;
    const wake = () => {
      d.body.classList.remove('idle');
      win.clearTimeout(t);
      t = win.setTimeout(() => d.body.classList.add('idle'), 2000);
    };
    d.addEventListener('pointermove', wake);
    wake();
  }

  private async knownScreens() {
    const w = window as WinWithScreens;
    if (!w.getScreenDetails || !navigator.permissions) return;
    try {
      const st = await navigator.permissions.query({ name: 'window-management' as PermissionName });
      if (st.state === 'granted') this.other = await this.findOther();
    } catch {}
  }

  private async findOther(): Promise<ScreenLike | null> {
    const w = window as WinWithScreens;
    if (!w.getScreenDetails) return null;
    try {
      const d = await w.getScreenDetails();
      return d.screens.find((s) => s !== d.currentScreen && (s.left !== d.currentScreen.left || s.top !== d.currentScreen.top)) ?? null;
    } catch {
      return null;
    }
  }

  // First time: open where we are, then (if the browser lets us) move the
  // window onto the other display.
  private async placeLater(win: Window) {
    const o = await this.findOther();
    if (!o || win.closed) return;
    this.other = o;
    try {
      win.moveTo(o.availLeft, o.availTop);
      win.resizeTo(o.availWidth, o.availHeight);
    } catch {}
  }
}
