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

window.addEventListener('hashchange', route);
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '[') step(-1);
  else if (e.key === ']') step(1);
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
