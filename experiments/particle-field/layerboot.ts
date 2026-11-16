// The Top layer: this page loaded a second time (in a see-through frame, with
// ?layer=top) over the field. Imported first, before anything reads storage,
// so that copy keeps every saved thing (its settings, panel state …) apart from
// the base page, and so it never reaches the microphone, the camera or the
// speakers: the base layer owns all of those.
export const TOP_LAYER = new URLSearchParams(location.search).get('layer') === 'top';

if (TOP_LAYER) {
  const own = (k: string) => (/^(particle-field|pf-)/.test(k) ? `pftop:${k}` : k);
  const S = Storage.prototype;
  const get = S.getItem;
  const put = S.setItem;
  const del = S.removeItem;
  S.getItem = function (k: string) {
    return get.call(this, own(k));
  };
  S.setItem = function (k: string, v: string) {
    put.call(this, own(k), v);
  };
  S.removeItem = function (k: string) {
    del.call(this, own(k));
  };
  // No microphone, camera, screen or tab capture.
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (md) {
    const no = () => Promise.reject(new DOMException('The top layer has no media', 'NotAllowedError'));
    md.getUserMedia = no;
    if ('getDisplayMedia' in md) md.getDisplayMedia = no;
  }
  // Nothing it makes can be heard.
  if (typeof AudioContext !== 'undefined') {
    const AC = AudioContext;
    // Every context starts suspended and can't be resumed.
    window.AudioContext = class extends AC {
      constructor(o?: AudioContextOptions) {
        super(o);
        void AC.prototype.suspend.call(this);
      }
      resume() {
        return Promise.resolve();
      }
    };
  }
  document.documentElement.classList.add('top-layer');
}
