// Page 8 – Garden, with versions. A dropdown at the top of the panel switches between them, live.
//  v1/ = Version 1: the garden exactly as it was (frozen: don't change these files, so you can always go back to it)
//  v2/ = Version 2: where changes are tried (its own copy of every file, so changing it never changes Version 1)
// Each version keeps its own saved settings. A version is only built the first time it is opened.
import { createGardenPage as createV1 } from './v1/garden.js';
import { createGardenPage as createV2 } from './v2/garden.js';

const VERSION_KEY = 'flowers-web-garden-version';
const VERSIONS = { 'Version 1 (frozen)': createV1, 'Version 2': createV2 };

export function createGardenPage() {
  let current = 'Version 1 (frozen)';
  try { const v = localStorage.getItem(VERSION_KEY); if (v in VERSIONS) current = v; } catch { /* no storage */ }
  const pages = {};
  let shown = false;

  const get = (name) => {
    if (!pages[name]) {
      const pick = { Version: name };
      pages[name] = VERSIONS[name]({
        name: `garden${Object.keys(VERSIONS).indexOf(name) + 1}`,
        // the version dropdown, at the top of this version's panel
        panelTop: (gui) => {
          const c = gui.add(pick, 'Version', Object.keys(VERSIONS)).name('Version').onChange((v) => {
            if (v === name) return;
            pick.Version = name; c.updateDisplay();  // this panel keeps showing its own version
            switchTo(v);
          });
          gui.$children.prepend(c.domElement);
        },
      });
    }
    return pages[name];
  };
  function switchTo(name) {
    if (name === current) return;
    if (shown) get(current).hide();
    current = name;
    try { localStorage.setItem(VERSION_KEY, name); } catch { /* ignore */ }
    if (shown) { get(current).show(); expose(); }
  }
  const expose = () => { window.gardenApp = window[`garden${Object.keys(VERSIONS).indexOf(current) + 1}`]; window.gardenVersion = { switchTo, get current() { return current; } }; };

  return {
    show() { shown = true; get(current).show(); expose(); },
    hide() { shown = false; pages[current]?.hide(); },
  };
}
