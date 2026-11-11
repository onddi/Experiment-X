/**
 * X-Frame client: talk to X-Frame (the page that lists and layers experiments).
 * Copy this file into your experiment folder as is; experiments don't import
 * from each other or from X-Frame. Everything is a no-op when the experiment is
 * opened on its own page, so the same code works in and out of X-Frame.
 *
 *   import { xframe } from './xframe.ts';
 *
 *   // Data bus: share data with whatever else is on screen.
 *   xframe.publish('transport', { playing: true, time: 12.3, duration: 200 });
 *   const stop = xframe.subscribe('audio.spectrum', (data, from) => { ... });
 *
 *   // How this experiment is shown: 'standalone', 'base', 'stacked' or 'docked'.
 *   xframe.onLayer((layer) => document.body.classList.toggle('see-through', layer.role === 'stacked'));
 *
 *   // Only one options panel open at a time across layers.
 *   xframe.panel({ element: panelEl, isOpen: () => !panelEl.classList.contains('collapsed'), close: hidePanel, open: showPanel });
 *
 *   // Hand the screen to another experiment, and get it back.
 *   xframe.handover('particle-field', { preset: '3' });
 *   xframe.onRelease(() => { ... });
 *
 * Protocol and topic conventions: see "Data bus" in the README.
 */

export type LayerRole = 'standalone' | 'base' | 'stacked' | 'docked';

export interface LayerInfo {
  role: LayerRole;
  placement: 'full' | 'top' | 'bottom' | 'left' | 'right';
  /** 0 = base; higher is further on top. */
  index: number;
  /** How many experiments are on screen. */
  count: number;
  /** Whether this layer currently gets mouse input. */
  input: boolean;
}

export interface ExperimentInfo {
  slug: string;
  title: string;
  provides: string[];
  accepts: string[];
}

type Handler = (data: any, from: string) => void;

const inFrame = window.parent !== window;
const subs = new Map<string, Set<Handler>>();
const layerHandlers = new Set<(layer: LayerInfo) => void>();
const releaseHandlers = new Set<() => void>();
const closePanelHandlers = new Set<() => void>();
const openPanelHandlers = new Set<() => void>();
const listWaiters: ((list: ExperimentInfo[]) => void)[] = [];
let layer: LayerInfo = { role: inFrame ? 'base' : 'standalone', placement: 'full', index: 0, count: 1, input: true };

function send(msg: object, transfer?: Transferable[]) {
  if (inFrame) parent.postMessage(msg, { targetOrigin: location.origin, transfer });
}

if (inFrame) {
  window.addEventListener('message', (e) => {
    if (e.source !== parent || e.origin !== location.origin) return;
    const msg = e.data;
    if (msg?.type === 'xp:data') {
      subs.get(msg.topic)?.forEach((h) => h(msg.data, msg.from));
    } else if (msg?.type === 'xp:layer') {
      layer = { role: msg.role, placement: msg.placement, index: msg.index, count: msg.count, input: msg.input };
      layerHandlers.forEach((h) => h(layer));
    } else if (msg?.type === 'xp:close-panel') {
      closePanelHandlers.forEach((h) => h());
    } else if (msg?.type === 'xp:open-panel') {
      openPanelHandlers.forEach((h) => h());
    } else if (msg?.type === 'xp:release') {
      releaseHandlers.forEach((h) => h());
    } else if (msg?.type === 'xp:list' && Array.isArray(msg.experiments)) {
      listWaiters.splice(0).forEach((resolve) => resolve(msg.experiments));
    }
  });
  send({ type: 'xp:hello' });
}

export const xframe = {
  /** True when running inside X-Frame. */
  inFrame,

  /** How this experiment is currently shown. */
  get layer(): LayerInfo {
    return layer;
  },

  /**
   * Send data on a topic to every other experiment on screen that subscribed.
   * Anything structured-clonable works (objects, arrays, typed arrays). Pass
   * `transfer` to hand over ArrayBuffers instead of copying them; you can't use
   * a transferred buffer afterwards.
   */
  publish(topic: string, data: unknown, transfer?: Transferable[]) {
    send({ type: 'xp:publish', topic, data }, transfer);
  },

  /** Listen to a topic. You get its last value straight away if there is one. Returns an unsubscribe function. */
  subscribe(topic: string, handler: Handler): () => void {
    let set = subs.get(topic);
    if (!set) {
      set = new Set();
      subs.set(topic, set);
      send({ type: 'xp:subscribe', topic });
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (!set.size) {
        subs.delete(topic);
        send({ type: 'xp:unsubscribe', topic });
      }
    };
  },

  /** Called now and whenever the way this experiment is shown changes. Returns a remove function. */
  onLayer(handler: (layer: LayerInfo) => void): () => void {
    layerHandlers.add(handler);
    handler(layer);
    return () => layerHandlers.delete(handler);
  },

  /** Ask X-Frame to show another experiment over everything. `params` go on its URL query. */
  handover(slug: string, params: Record<string, string> = {}) {
    send({ type: 'xp:handover', slug, params });
  },

  /** Called when an experiment you handed over to is closed. Returns a remove function. */
  onRelease(handler: () => void): () => void {
    releaseHandlers.add(handler);
    return () => releaseHandlers.delete(handler);
  },

  /**
   * Keep only one options panel open across layers: when yours opens, X-Frame
   * closes the others (and its own Layers panel), and asks you to close yours
   * when another one opens. While yours is open, layers stacked above you fade
   * back so it stays readable. When several experiments are on screen, X-Frame
   * also closes panels as they load, so a shared link opens clean. Pass `open`
   * too and X-Frame opens your panel when the mouse is handed to your layer.
   * Watches `element` for attribute changes and calls `isOpen()` to tell open
   * from closed. Returns a function that stops it.
   */
  panel({ element, isOpen, close, open }: { element: Element; isOpen: () => boolean; close: () => void; open?: () => void }): () => void {
    if (!inFrame) return () => {};
    let wasOpen = isOpen();
    const observer = new MutationObserver(() => {
      const now = isOpen();
      if (now !== wasOpen) send({ type: 'xp:panel', open: now });
      wasOpen = now;
    });
    observer.observe(element, { attributes: true });
    const onClose = () => {
      if (isOpen()) close();
    };
    const onOpen = () => {
      if (open && !isOpen()) open();
    };
    closePanelHandlers.add(onClose);
    openPanelHandlers.add(onOpen);
    return () => {
      observer.disconnect();
      closePanelHandlers.delete(onClose);
      openPanelHandlers.delete(onOpen);
    };
  },

  /** All experiments X-Frame knows about (empty outside X-Frame). */
  list(): Promise<ExperimentInfo[]> {
    if (!inFrame) return Promise.resolve([]);
    return new Promise((resolve) => {
      listWaiters.push(resolve);
      send({ type: 'xp:list' });
      setTimeout(() => {
        const i = listWaiters.indexOf(resolve);
        if (i >= 0) listWaiters.splice(i, 1), resolve([]);
      }, 2000);
    });
  },
};
