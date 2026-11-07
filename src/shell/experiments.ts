/**
 * Experiment registry.
 *
 * Experiments are discovered automatically: every folder in /experiments that
 * contains an `experiment.json` shows up in the shell. Folders whose name
 * starts with "_" (e.g. `_template`) are ignored.
 *
 * The shell only ever reads this metadata. It never imports experiment code;
 * experiments are loaded in an iframe so their scripts and styles stay isolated.
 */

export interface ExperimentMeta {
  /** Display name in the switcher. */
  title: string;
  /** One-line summary shown under the title. */
  description?: string;
  /** ISO date (YYYY-MM-DD). Newest experiments are listed first. */
  created?: string;
  /** Free-form labels, also matched by the filter box. */
  tags?: string[];
  /** Set to true to hide an experiment from the list without deleting it. */
  hidden?: boolean;
}

export interface Experiment extends ExperimentMeta {
  /** Folder name, used in the URL: #/<slug> */
  slug: string;
  /** URL of the experiment page, relative to the shell. */
  url: string;
}

const modules = import.meta.glob<ExperimentMeta>('/experiments/*/experiment.json', {
  eager: true,
  import: 'default',
});

export const experiments: Experiment[] = Object.entries(modules)
  .map(([path, meta]) => {
    const slug = path.split('/')[2];
    return { ...meta, slug, url: `./experiments/${slug}/` };
  })
  .filter((exp) => !exp.slug.startsWith('_') && !exp.hidden)
  .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || a.title.localeCompare(b.title));
