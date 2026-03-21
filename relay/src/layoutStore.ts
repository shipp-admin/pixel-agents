import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const LAYOUT_FILE = path.join(DATA_DIR, 'layout.json');

let currentLayout: unknown | null = null;

/** Load layout from disk on startup */
export function loadLayout(): void {
  try {
    if (fs.existsSync(LAYOUT_FILE)) {
      const raw = fs.readFileSync(LAYOUT_FILE, 'utf-8');
      currentLayout = JSON.parse(raw);
      console.log('[Layout] Loaded layout from disk');
    } else {
      console.log('[Layout] No existing layout file, will serve null');
      currentLayout = null;
    }
  } catch (err) {
    console.error('[Layout] Failed to load layout file:', err);
    currentLayout = null;
  }
}

/** Save layout to disk */
export function saveLayout(layout: unknown): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    currentLayout = layout;
    const tmpFile = LAYOUT_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(layout, null, 2), 'utf-8');
    fs.renameSync(tmpFile, LAYOUT_FILE);
    console.log('[Layout] Saved layout to disk');
  } catch (err) {
    console.error('[Layout] Failed to save layout:', err);
  }
}

/** Get the current layout (may be null if none saved) */
export function getLayout(): unknown | null {
  return currentLayout;
}
