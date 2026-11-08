/**
 * The X-Frame data bus: experiments publish and subscribe to named topics, and
 * X-Frame routes the messages between their iframes. Experiments never talk to
 * each other directly. See "Data bus" in the README for the protocol.
 *
 *   experiment → X-Frame  { type: 'xp:subscribe', topic }
 *   experiment → X-Frame  { type: 'xp:unsubscribe', topic }
 *   experiment → X-Frame  { type: 'xp:publish', topic, data }
 *   X-Frame → experiment  { type: 'xp:data', topic, data, from }   from = publisher's slug
 *
 * The last value of every topic is kept and sent to a new subscriber straight
 * away, so an experiment that joins late doesn't wait for the next update.
 */

export interface TopicStats {
  topic: string;
  publishers: string[];
  subscribers: string[];
  /** Messages per second, averaged over the last couple of seconds. */
  rate: number;
}

interface Topic {
  subscribers: Set<Window>;
  last?: { data: unknown; from: string };
  publishers: Set<string>;
  count: number;
  rate: number;
  rateSince: number;
}

const topics = new Map<string, Topic>();

/** Resolves an iframe window to the experiment slug running in it. */
let slugOf: (win: Window) => string | undefined = () => undefined;

export function setSlugResolver(fn: (win: Window) => string | undefined) {
  slugOf = fn;
}

function topic(name: string): Topic {
  let t = topics.get(name);
  if (!t) {
    t = { subscribers: new Set(), publishers: new Set(), count: 0, rate: 0, rateSince: performance.now() };
    topics.set(name, t);
  }
  return t;
}

function send(win: Window, topicName: string, data: unknown, from: string) {
  try {
    win.postMessage({ type: 'xp:data', topic: topicName, data, from }, location.origin);
  } catch {
    /* the frame went away mid-send */
  }
}

/** Handles a bus message from an experiment. Returns false if it wasn't one. */
export function handleBusMessage(source: Window, msg: { type?: string; topic?: unknown; data?: unknown }): boolean {
  if (typeof msg.topic !== 'string' || !msg.topic) return false;
  const name = msg.topic;
  switch (msg.type) {
    case 'xp:subscribe': {
      const t = topic(name);
      t.subscribers.add(source);
      if (t.last && slugOf(source) !== t.last.from) send(source, name, t.last.data, t.last.from);
      return true;
    }
    case 'xp:unsubscribe':
      topics.get(name)?.subscribers.delete(source);
      return true;
    case 'xp:publish': {
      const from = slugOf(source) ?? '?';
      const t = topic(name);
      t.last = { data: msg.data, from };
      t.publishers.add(from);
      t.count++;
      for (const win of t.subscribers) if (win !== source) send(win, name, msg.data, from);
      return true;
    }
  }
  return false;
}

/** Forget everything a frame subscribed to, e.g. before it reloads or is removed. */
export function dropFrame(win: Window | null | undefined) {
  if (!win) return;
  for (const t of topics.values()) t.subscribers.delete(win);
}

/** Forget what a frame published, so the panel doesn't list it once it's gone. */
export function dropPublisher(slug: string) {
  for (const t of topics.values()) {
    t.publishers.delete(slug);
    if (t.last?.from === slug) t.last = undefined;
  }
}

export function busStats(): TopicStats[] {
  const now = performance.now();
  const out: TopicStats[] = [];
  for (const [name, t] of topics) {
    const dt = (now - t.rateSince) / 1000;
    if (dt >= 1) {
      t.rate = t.count / dt;
      t.count = 0;
      t.rateSince = now;
    }
    const subscribers = [...t.subscribers].map((w) => slugOf(w)).filter((s): s is string => !!s);
    if (!t.publishers.size && !subscribers.length) continue;
    out.push({ topic: name, publishers: [...t.publishers], subscribers, rate: t.rate });
  }
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
}
