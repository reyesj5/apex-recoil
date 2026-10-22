// Computed-style snapshots for the SCSS -> Tailwind migration (docs/migration-plan.md, 3.4).
// A pure styling refactor must leave every element's computed style and box unchanged; this
// records both in headless Chrome so a migrated component can be checked against the original.
//
//   node scripts/style-snapshot.mjs capture <base-url> <out.json> [--hover <selector>]...
//   node scripts/style-snapshot.mjs compare <before.json> <after.json>
//
// `capture` loads /, /ru, /zh-CN and /editor at desktop and phone widths. `--hover` forces
// :hover on matching elements for an extra pass. Needs Node 22+ (built-in WebSocket) and Chrome
// (CHROME_PATH, or the default install location). Start the app first (pnpm build && pnpm start).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PAGES = ['/', '/ru', '/zh-CN', '/editor'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true }
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH');
  return found;
}

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'style_snapshot_'));
  const proc = spawn(findChrome(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return { proc, profile, wsUrl: page.webSocketDebuggerUrl };
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('Chrome did not start');
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    listeners.forEach((fn) => fn(msg));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const waitFor = (method) => new Promise((resolve) => {
    const fn = (msg) => {
      if (msg.method === method) {
        listeners.delete(fn);
        resolve(msg.params);
      }
    };
    listeners.add(fn);
  });
  return { send, waitFor, close: () => ws.close() };
}

// Runs in the page: every element keyed by its DOM path, with all computed properties and its box
const COLLECT = `(() => {
  const keyOf = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ':' + i);
    }
    return parts.join('>');
  };
  const out = {};
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    const style = {};
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (!prop.startsWith('--')) style[prop] = cs.getPropertyValue(prop);
    }
    const r = el.getBoundingClientRect();
    out[keyOf(el)] = {
      box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100),
      style
    };
  }
  return out;
})()`;

async function capture(baseUrl, outFile, hoverSelectors) {
  const chrome = await launchChrome();
  const cdp = await connect(chrome.wsUrl);
  const snapshot = { baseUrl, capturedAt: new Date().toISOString(), states: {} };
  try {
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
      for (const page of PAGES) {
        const loaded = cdp.waitFor('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: baseUrl + page });
        await loaded;
        // Settle fonts and finish transitions before reading styles
        await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1200)))', awaitPromise: true });
        const base = await cdp.send('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
        snapshot.states[`${vp.name} ${page}`] = base.result.value;

        if (hoverSelectors.length) {
          const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
          const forced = [];
          for (const selector of hoverSelectors) {
            const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
            for (const nodeId of nodeIds) {
              await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
              forced.push(nodeId);
            }
          }
          if (forced.length) {
            await new Promise((r) => setTimeout(r, 300));
            const hovered = await cdp.send('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
            snapshot.states[`${vp.name} ${page} :hover`] = hovered.result.value;
            for (const nodeId of forced) {
              await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
            }
          }
        }
      }
    }
  } finally {
    cdp.close();
    chrome.proc.kill();
    setTimeout(() => fs.rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 500);
  }
  fs.writeFileSync(outFile, JSON.stringify(snapshot));
  const counts = Object.entries(snapshot.states).map(([k, v]) => `${k}: ${Object.keys(v).length}`).join(', ');
  console.log(`Captured ${outFile} (${counts} elements)`);
}

function compare(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  let differences = 0;
  for (const [state, elements] of Object.entries(before.states)) {
    const other = after.states[state];
    if (!other) {
      console.log(`[${state}] missing in ${afterFile}`);
      differences++;
      continue;
    }
    const keys = new Set([...Object.keys(elements), ...Object.keys(other)]);
    for (const key of keys) {
      const a = elements[key];
      const b = other[key];
      if (!a || !b) {
        console.log(`[${state}] ${key}: element ${a ? 'removed' : 'added'}`);
        differences++;
        continue;
      }
      if (a.box.join() !== b.box.join()) {
        console.log(`[${state}] ${key}: box ${a.box.join(',')} -> ${b.box.join(',')}`);
        differences++;
      }
      for (const prop of new Set([...Object.keys(a.style), ...Object.keys(b.style)])) {
        if (a.style[prop] !== b.style[prop]) {
          console.log(`[${state}] ${key}: ${prop}: ${a.style[prop]} -> ${b.style[prop]}`);
          differences++;
        }
      }
    }
  }
  console.log(differences ? `${differences} difference(s)` : 'No differences: identical computed styles and layout');
  return differences;
}

const [command, ...args] = process.argv.slice(2);
if (command === 'capture' && args.length >= 2) {
  const hover = [];
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--hover' && args[i + 1]) hover.push(args[++i]);
  }
  await capture(args[0].replace(/\/+$/, ''), args[1], hover);
} else if (command === 'compare' && args.length === 2) {
  process.exitCode = compare(args[0], args[1]) ? 1 : 0;
} else {
  console.log('Usage:\n  node scripts/style-snapshot.mjs capture <base-url> <out.json> [--hover <selector>]...\n  node scripts/style-snapshot.mjs compare <before.json> <after.json>');
  process.exitCode = 2;
}
