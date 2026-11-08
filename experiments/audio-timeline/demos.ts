// The built-in demo songs, all synthesised in the browser (nothing to download).

import { renderAcid } from './acid.ts';
import { renderDnb } from './dnb.ts';
import { renderLofi } from './lofi.ts';
import { renderTechno } from './techno.ts';

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
  { id: 'lofi', name: 'Rainy window', label: 'Lo-fi hip hop', render: renderLofi },
  { id: 'dnb', name: 'Undertow', label: 'D&B loop', loop: true, render: renderDnb },
];
