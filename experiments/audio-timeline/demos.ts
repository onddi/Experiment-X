// The built-in demo songs, all synthesised in the browser (nothing to download).

import { renderAcid } from './acid.ts';
import { renderBassHouse } from './basshouse.ts';
import { renderDnb } from './dnb.ts';
import { renderDubTechno } from './dubtechno.ts';
import { renderDubstep } from './dubstep.ts';
import { renderGarage } from './garage.ts';
import { renderJungle } from './jungle.ts';
import { renderLofi } from './lofi.ts';
import { renderTechno } from './techno.ts';
import { renderTrap } from './trap.ts';

export interface Demo {
  id: string;
  /** The track's title. */
  name: string;
  /** What the button says. */
  label: string;
  /** Made to repeat without a seam: loading it switches loop on. */
  loop?: boolean;
  render(): Promise<AudioBuffer>;
}

export const DEMOS: Demo[] = [
  { id: 'techno', name: 'Night shift', label: 'Techno', render: renderTechno },
  { id: 'acid', name: 'Acid rain', label: 'Acid', render: renderAcid },
  { id: 'dubtechno', name: 'Fog bank', label: 'Dub techno', render: renderDubTechno },
  { id: 'basshouse', name: 'Warehouse', label: 'Bass house', render: renderBassHouse },
  { id: 'garage', name: 'Last train', label: 'UK garage', render: renderGarage },
  { id: 'dubstep', name: 'Fault line', label: 'Dubstep', render: renderDubstep },
  { id: 'trap', name: 'Midnight drip', label: 'Trap', render: renderTrap },
  { id: 'jungle', name: 'Deep cuts', label: 'Jungle', render: renderJungle },
  { id: 'dnb', name: 'Undertow', label: 'D&B loop', loop: true, render: renderDnb },
  { id: 'lofi', name: 'Rainy window', label: 'Lo-fi hip hop', render: renderLofi },
];
