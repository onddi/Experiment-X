import './shell.css';
import { experiments, type Experiment } from './experiments.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list = $<HTMLUListElement>('exp-list');
const search = $<HTMLInputElement>('search');
const frame = $<HTMLIFrameElement>('frame');
const empty = $<HTMLDivElement>('empty');
const currentTitle = $<HTMLDivElement>('current-title');
const openTab = $<HTMLAnchorElement>('open-tab');
const shellEl = document.querySelector<HTMLDivElement>('.shell')!;

const SIDEBAR_KEY = 'experiment-x:sidebar-collapsed';
const isSmallScreen = () => matchMedia('(max-width: 720px)').matches;

let current: Experiment | undefined;

function slugFromHash(): string | undefined {
  const match = location.hash.match(/^#\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function renderList(filter = '') {
  const q = filter.trim().toLowerCase();
  list.replaceChildren(
    ...experiments
      .filter((exp) =>
        !q ||
        [exp.title, exp.slug, exp.description ?? '', ...(exp.tags ?? [])].some((s) => s.toLowerCase().includes(q)),
      )
      .map((exp) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#/${encodeURIComponent(exp.slug)}`;
        a.className = 'exp-link';
        if (exp.slug === current?.slug) a.setAttribute('aria-current', 'page');

        const title = document.createElement('span');
        title.className = 'exp-link__title';
        title.textContent = exp.title;
        a.append(title);

        if (exp.description) {
          const desc = document.createElement('span');
          desc.className = 'exp-link__desc';
          desc.textContent = exp.description;
          a.append(desc);
        }
        li.append(a);
        return li;
      }),
  );
}

function show(exp: Experiment | undefined) {
  if (!exp) {
    current = undefined;
    frame.hidden = true;
    empty.hidden = false;
    currentTitle.textContent = '—';
    document.title = 'Experiment-X';
    renderList(search.value);
    return;
  }
  removeHandover();
  current = exp;
  empty.hidden = true;
  frame.hidden = false;
  // Swapping the src gives the experiment a brand new document and JS realm,
  // so nothing from the previous experiment survives the switch.
  frame.src = exp.url;
  frame.title = exp.title;
  currentTitle.textContent = exp.title;
  openTab.href = exp.url;
  document.title = `${exp.title} · Experiment-X`;
  renderList(search.value);
}

function route() {
  const slug = slugFromHash();
  const exp = experiments.find((e) => e.slug === slug) ?? experiments[0];
  if (exp && exp.slug !== slug) {
    history.replaceState(null, '', `#/${encodeURIComponent(exp.slug)}`);
  }
  if (exp?.slug !== current?.slug || !exp) show(exp);
}

function step(delta: number) {
  if (!experiments.length) return;
  const i = current ? experiments.indexOf(current) : -1;
  const next = experiments[(i + delta + experiments.length) % experiments.length];
  location.hash = `#/${encodeURIComponent(next.slug)}`;
}

function setSidebarCollapsed(collapsed: boolean) {
  shellEl.classList.toggle('shell--collapsed', collapsed);
  // On small screens the list is an overlay, so don't let that choice stick for desktop.
  if (isSmallScreen()) return;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage unavailable: ignore */
  }
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

// --- wire up -----------------------------------------------------------------

search.addEventListener('input', () => renderList(search.value));
list.addEventListener('click', (e) => {
  // On small screens the list overlays the stage, so close it after picking.
  if ((e.target as HTMLElement).closest('a') && isSmallScreen()) setSidebarCollapsed(true);
});
$('reload').addEventListener('click', () => current && (frame.src = current.url));
$('sidebar-close').addEventListener('click', () => setSidebarCollapsed(true));
$('sidebar-open').addEventListener('click', () => setSidebarCollapsed(!shellEl.classList.contains('shell--collapsed')));

// --- hand-over ---------------------------------------------------------------
// An experiment can hand the screen to another one, e.g. the carousel grid
// opening a cell into a different visualisation. The shell is in charge: it
// loads the next experiment in its own iframe over the current one, and gives
// the screen back when that is closed. Messages (postMessage, same origin):
//   experiment → shell  { type: 'xp:list' }             ask which experiments exist
//   shell → experiment  { type: 'xp:list', experiments: [{ slug, title }] }
//   experiment → shell  { type: 'xp:handover', slug }   show <slug> on top of me
//   shell → experiment  { type: 'xp:release' }          it was closed: take over again

let handover: HTMLDivElement | null = null;

function tellFrame(msg: unknown) {
  frame.contentWindow?.postMessage(msg, location.origin);
}

function handOver(slug: string) {
  const exp = experiments.find((e) => e.slug === slug);
  if (!exp || exp.slug === current?.slug) return;
  removeHandover();
  const box = document.createElement('div');
  box.className = 'handover';
  box.style.top = `${frame.offsetTop}px`;
  const inner = document.createElement('iframe');
  inner.className = 'handover__frame';
  inner.title = exp.title;
  inner.src = exp.url;
  // Fade in only once it has loaded, so the hand-over stays black until then.
  inner.addEventListener('load', () => box.classList.add('handover--ready'), { once: true });
  const back = document.createElement('button');
  back.className = 'icon-btn handover__close';
  back.title = 'Back';
  back.setAttribute('aria-label', 'Back');
  back.textContent = '\u2715';
  back.addEventListener('click', releaseHandover);
  box.append(inner, back);
  frame.parentElement!.append(box);
  handover = box;
  inner.focus();
}

/** Fade the handed-over experiment out to black, then give the screen back. */
function releaseHandover() {
  const box = handover;
  if (!box) return;
  handover = null;
  box.classList.remove('handover--ready');
  setTimeout(() => {
    box.remove();
    tellFrame({ type: 'xp:release' });
    frame.focus();
  }, 400);
}

function removeHandover() {
  handover?.remove();
  handover = null;
}

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
  const msg = e.data as { type?: string; slug?: string } | null;
  if (msg?.type === 'xp:list') {
    tellFrame({
      type: 'xp:list',
      experiments: experiments.map(({ slug, title }) => ({ slug, title })),
    });
  } else if (msg?.type === 'xp:handover' && typeof msg.slug === 'string') {
    handOver(msg.slug);
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '[') step(-1);
  else if (e.key === ']') step(1);
  else if (e.key === 'Escape' && handover) releaseHandover();
  else if (e.key === '\\') setSidebarCollapsed(!shellEl.classList.contains('shell--collapsed'));
});

if (isSmallScreen()) {
  // Opened on a deep link: show the experiment, not the list.
  if (slugFromHash()) shellEl.classList.add('shell--collapsed');
} else {
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === '1') shellEl.classList.add('shell--collapsed');
  } catch {
    /* storage unavailable: ignore */
  }
}

route();
