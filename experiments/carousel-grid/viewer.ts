// Full-screen view of one carousel item. A click on a cell opens it, growing
// out of the cell with the chosen transition; a click anywhere or Escape
// plays the same transition back into the cell.
//
// The transitions use the browser's View Transitions API: it takes a picture
// of the cell and of the full-screen view, then animates those flat pictures.
// Animating the live elements instead meant redrawing the colour-graded,
// blended image on every frame, which stutters badly in Safari. Zoom and Flip
// cross-fade between the cell's picture and the full-screen one while they
// grow, so the crop and label size change smoothly instead of jumping.
// Browsers without View Transitions open and close instantly.

export type OpenTransition = 'zoom' | 'reveal' | 'iris' | 'fade' | 'slide' | 'flip';

export const OPEN_TRANSITIONS: [OpenTransition | 'off', string][] = [
  ['off', 'Off'],
  ['zoom', 'Zoom'],
  ['reveal', 'Reveal'],
  ['iris', 'Iris'],
  ['flip', 'Flip'],
  ['fade', 'Fade'],
  ['slide', 'Slide up'],
];

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const NAME = 'cg-view';

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition(): void;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

export class Viewer {
  readonly el: HTMLElement;
  private readonly css: HTMLStyleElement;
  private source: HTMLElement | null = null;
  private transition: OpenTransition = 'zoom';
  private running: ViewTransitionLike | null = null;
  /** Set by a press that starts on the open viewer; only such a press closes it. */
  private armed = false;

  constructor(
    parent: HTMLElement,
    private opts: () => { transition: OpenTransition; duration: number; radius: number },
  ) {
    this.el = document.createElement('div');
    this.el.className = 'viewer';
    this.el.hidden = true;
    this.el.title = 'Click or press Escape to close';
    parent.append(this.el);
    this.css = document.createElement('style');
    document.head.append(this.css);
    // iOS Safari follows a tap with a synthetic click at the same spot, which
    // could land on the freshly opened viewer and close it straight away. So a
    // click only closes the viewer when its press also began on the viewer.
    this.el.addEventListener('pointerdown', () => {
      this.armed = this.isOpen;
    });
    this.el.addEventListener('click', () => {
      if (this.armed) this.close();
      this.armed = false;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** Show `item` (an .item element) full screen, growing out of `from`. */
  open(item: HTMLElement, from: HTMLElement) {
    if (this.isOpen || this.running) return;
    const { transition } = this.opts();
    this.transition = transition;
    this.source = from;
    const clone = item.cloneNode(true) as HTMLElement;
    for (const p of ['transform', 'visibility', 'opacity', 'z-index', '--turn', 'will-change']) clone.style.removeProperty(p);
    this.el.replaceChildren(clone);
    this.el.style.setProperty('--cell', `${this.labelCell(from)}px`);
    this.armed = false;
    from.blur();
    this.run(false, () => {
      this.el.hidden = false;
    });
  }

  /**
   * Size basis for the full-screen label. Zoom and Flip blend the cell's
   * picture, scaled up to cover the screen, into the full-screen one, so the
   * label must be exactly that scaled-up size or the two copies of the text
   * pulse bigger and smaller as they cross-fade.
   */
  private labelCell(from: HTMLElement) {
    const r = from.getBoundingClientRect();
    const morph = this.transition === 'zoom' || this.transition === 'flip';
    if (!morph || !r.width || !r.height) return Math.min(innerWidth, innerHeight) * 0.6;
    const cell = parseFloat(getComputedStyle(from).getPropertyValue('--cell')) || Math.min(r.width, r.height);
    return cell * Math.max(innerWidth / r.width, innerHeight / r.height);
  }

  close() {
    if (!this.isOpen || this.running) return;
    this.run(true, () => {
      this.el.hidden = true;
      this.el.replaceChildren();
    });
  }

  private run(closing: boolean, update: () => void) {
    const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
    const source = this.source!;
    if (!start) {
      update();
      if (closing) source.focus({ preventScroll: true });
      return;
    }
    // Zoom and Flip morph the cell into the viewer, so both carry the shared
    // name on their side of the change; the others only animate the viewer.
    const morph = this.transition === 'zoom' || this.transition === 'flip';
    this.css.textContent = this.styles(closing);
    if (morph && !closing) source.style.viewTransitionName = NAME;
    if (closing) this.el.style.viewTransitionName = NAME;
    const vt = start.call(document, () => {
      update();
      if (closing) {
        this.el.style.viewTransitionName = '';
        if (morph) source.style.viewTransitionName = NAME;
      } else {
        source.style.viewTransitionName = '';
        this.el.style.viewTransitionName = NAME;
      }
    });
    this.running = vt;
    vt.finished.finally(() => {
      source.style.viewTransitionName = '';
      this.el.style.viewTransitionName = '';
      this.running = null;
      if (closing) source.focus({ preventScroll: true });
    });
  }

  /** CSS for the transition's snapshot pseudo-elements. */
  private styles(closing: boolean) {
    const { duration, radius } = this.opts();
    const r = this.source!.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const rad = Math.min(radius, Math.min(r.width, r.height) * 0.25);
    const time = `${duration}ms ${EASE} both${closing ? ' reverse' : ''}`;
    // The full-screen picture is the "new" one when opening, the "old" one when closing.
    const view = `::view-transition-${closing ? 'old' : 'new'}(${NAME})`;
    let css = `
      ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
      ::view-transition-group(${NAME}) { animation-duration: ${duration}ms; animation-timing-function: ${EASE}; overflow: clip; }
      ::view-transition-old(${NAME}), ::view-transition-new(${NAME}) {
        height: 100%; object-fit: cover;
        animation-duration: ${duration}ms; animation-timing-function: ${EASE};
      }`;
    const anim = (frames: string) => {
      css += `\n${view} { animation: cg-view ${time}; }\n@keyframes cg-view { ${frames} }`;
    };
    switch (this.transition) {
      case 'zoom':
        // Round the corners like the cell's at the cell end of the morph.
        css += `\n::view-transition-image-pair(${NAME}) { overflow: clip; animation: cg-round ${time}; }
          @keyframes cg-round { from { border-radius: ${rad}px; } to { border-radius: 0px; } }`;
        break;
      case 'flip':
        css += `\n::view-transition-image-pair(${NAME}) { animation: cg-flip ${time}; }
          @keyframes cg-flip {
            from { transform: perspective(${W * 1.5}px) rotateY(-85deg); opacity: 0.3; }
            50% { transform: perspective(${W * 1.5}px) rotateY(-30deg); opacity: 1; }
            to { transform: none; opacity: 1; }
          }`;
        break;
      case 'reveal':
        anim(`from { clip-path: inset(${r.top}px ${W - r.right}px ${H - r.bottom}px ${r.left}px round ${rad}px); }
              to { clip-path: inset(0px 0px 0px 0px round 0px); }`);
        break;
      case 'iris': {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
        anim(`from { clip-path: circle(${Math.min(r.width, r.height) / 2}px at ${cx}px ${cy}px); }
              to { clip-path: circle(${far}px at ${cx}px ${cy}px); }`);
        break;
      }
      case 'fade':
        anim(`from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: none; }`);
        break;
      case 'slide':
        anim(`from { transform: translateY(100%); } to { transform: none; }`);
        break;
    }
    return css;
  }
}
