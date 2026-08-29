#!/usr/bin/env node
/**
 * Glint MCP — agent tools for real Capture + session validate + headless export.
 *
 * Claude Code / Cursor:
 *   { "mcpServers": { "glint": { "command": "node", "args": ["/path/to/Glint-MCP/src/index.js"] } } }
 *
 * Env:
 *   GLINT_CAPTURE_ROOT — path to Glint-Capture package (for init/capture shell)
 *   GLINT_WEB_ROOT — path to Glint-Web (for headless export)
 *   GLINT_WEB_BASE — running Web preview URL (default http://127.0.0.1:4173)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORG_ROOT = path.resolve(__dirname, '../..');
const CAPTURE_ROOT = process.env.GLINT_CAPTURE_ROOT || path.join(ORG_ROOT, 'Glint-Capture');
const WEB_ROOT = process.env.GLINT_WEB_ROOT || path.join(ORG_ROOT, 'Glint-Web');
const BRIDGE_ROOT = process.env.GLINT_BRIDGE_ROOT || path.join(ORG_ROOT, 'Glint-Bridge');
const WEB_BASE = process.env.GLINT_WEB_BASE || 'http://127.0.0.1:4173';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function validateSessionDir(sessionDir) {
  const abs = path.resolve(sessionDir);
  const sessionPath = path.join(abs, 'session.json');
  await access(sessionPath);
  const raw = await readFile(sessionPath, 'utf8');
  const session = JSON.parse(raw);
  const errors = [];
  if (!session.version && !session.screens && !session.screenshots) {
    errors.push('missing version/screens');
  }
  const screens = session.screens || session.screenshots || [];
  let resolved = 0;
  for (const s of screens) {
    const rel = typeof s === 'string' ? s : (s.path || s.file || s.filename);
    if (!rel || String(rel).startsWith('data:')) {
      resolved += 1;
      continue;
    }
    const candidates = [
      path.join(abs, rel),
      path.join(abs, path.basename(rel)),
    ];
    let ok = false;
    for (const c of candidates) {
      try {
        await access(c);
        ok = true;
        break;
      } catch { /* */ }
    }
    if (ok) resolved += 1;
    else errors.push(`missing file: ${rel}`);
  }
  if (!screens.length) {
    const pngs = (await readdir(abs)).filter((f) => /\.png$/i.test(f));
    if (!pngs.length) errors.push('no screens and no PNGs in folder');
    else resolved = pngs.length;
  }
  return {
    ok: errors.length === 0,
    dir: abs,
    app: session.app || null,
    store: session.store || null,
    screenCount: screens.length || resolved,
    resolved,
    errors,
    sessionKeys: Object.keys(session),
  };
}

const server = new McpServer({
  name: 'glint',
  version: '0.1.0',
});

server.tool(
  'glint_validate_session',
  'Validate a Glint session folder (session.json + PNG paths). Real UI only — never invent screens.',
  {
    sessionDir: z.string().describe('Directory containing session.json and PNGs'),
  },
  async ({ sessionDir }) => {
    try {
      const result = await validateSessionDir(sessionDir);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(err.message || err) }) }],
        isError: true,
      };
    }
  },
);

server.tool(
  'glint_init',
  'Run `glint init` in a Flutter app directory (requires glint CLI / Capture package).',
  {
    appDir: z.string().describe('Flutter app root'),
  },
  async ({ appDir }) => {
    const cwd = path.resolve(appDir);
    const result = await run('glint', ['init'], { cwd });
    if (result.code !== 0) {
      // try dart run from Capture package
      const alt = await run('dart', ['run', path.join(CAPTURE_ROOT, 'bin/glint.dart'), 'init'], { cwd });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: alt.code === 0,
            via: 'dart run',
            stdout: alt.stdout,
            stderr: alt.stderr,
            tip: 'Activate CLI: dart pub global activate --source git https://github.com/Glint-Org/Glint-Capture.git',
          }, null, 2),
        }],
        isError: alt.code !== 0,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, stdout: result.stdout, stderr: result.stderr }, null, 2) }],
    };
  },
);

server.tool(
  'glint_capture',
  'Run glint capture in a Flutter app (writes session.json + real widget screenshots at store sizes). If no rules exist yet, run glint_discover first or write rules manually. Soft launch: one device (pixel9) for clean Web frame mapping. set auto:true to discover + write + capture in one step.',
  {
    appDir: z.string().describe('Flutter app root'),
    auto: z.boolean().default(false).describe('Discover screens from lib/ then capture'),
  },
  async ({ appDir, auto }) => {
    const cwd = path.resolve(appDir);
    const captureArgs = auto ? ['capture', '--auto'] : ['capture'];
    let result = await run('glint', captureArgs, { cwd });
    if (result.code !== 0) {
      result = await run('dart', ['run', path.join(CAPTURE_ROOT, 'bin/glint.dart'), ...captureArgs], { cwd });
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: result.code === 0,
          auto,
          stdout: result.stdout.slice(-4000),
          stderr: result.stderr.slice(-4000),
          next: 'Import glint_screenshots/ into Glint Web, or call glint_export',
        }, null, 2),
      }],
      isError: result.code !== 0,
    };
  },
);

server.tool(
  'glint_discover',
  'Scan a Flutter app lib/ for the best marketing-worthy screens (home, feed, features, profile, settings). Ranks by visual richness (images, lists, cards, grids). Returns top 8 by default. If developer specified exact screens, skip this and write rules directly in test/glint_screenshots_test.dart.',
  {
    appDir: z.string().describe('Flutter app root'),
    write: z.boolean().default(true),
    maxScreens: z.number().int().min(1).max(20).default(8),
  },
  async ({ appDir, write, maxScreens }) => {
    const cwd = path.resolve(appDir);
    const args = [
      'discover',
      ...(write ? ['--write'] : []),
      '--max', String(maxScreens),
    ];
    let result = await run('glint', args, { cwd });
    if (result.code !== 0) {
      result = await run('dart', ['run', path.join(CAPTURE_ROOT, 'bin/glint.dart'), ...args], { cwd });
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: result.code === 0,
          stdout: result.stdout.slice(-5000),
          stderr: result.stderr.slice(-2000),
          next: result.code === 0 ? 'Review test/glint_screenshots_test.dart then glint_capture' : undefined,
        }, null, 2),
      }],
      isError: result.code !== 0,
    };
  },
);

server.tool(
  'glint_bridge_crawl',
  'Auto-crawl an Android app on a real device via ADB. Captures raw screenshots at device native resolution (no crop/resize). AI mode (with GLINT_AI_API_KEY) scores screens for store marketing value and navigates intelligently. Heuristic mode scrolls/taps and keeps unique screens. Output goes to Glint-Web for template polish.',
  {
    target: z.string().describe('Android package (com.app)'),
    ai: z.boolean().default(true).describe('Use AI vision to score and navigate'),
    maxScreens: z.number().int().min(1).max(40).default(16),
    app: z.string().default('Captured App'),
  },
  async ({ target, ai, maxScreens, app }) => {
    const isWeb = /^https?:\/\//i.test(target);
    const args = [
      path.join(BRIDGE_ROOT, 'glint.py'),
      isWeb ? 'crawl-web' : 'crawl',
      ...(isWeb ? ['--url', target] : ['--package', target]),
      '--max-screens', String(maxScreens),
      '--app', app,
      ...(ai ? ['--ai'] : ['--no-ai']),
    ];
    const result = await run('python3', args, { cwd: BRIDGE_ROOT });
    const outDir = path.join(BRIDGE_ROOT, 'output');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: result.code === 0,
          mode: isWeb ? 'web' : 'android',
          ai,
          outputDir: outDir,
          stdout: result.stdout.slice(-5000),
          stderr: result.stderr.slice(-2000),
          next: result.code === 0
            ? 'Import Glint-Bridge/output into Glint Web, or glint_export'
            : 'Need Appium (Android) or Playwright (web). For --ai set GLINT_AI_API_KEY. See Glint-Bridge README.',
        }, null, 2),
      }],
      isError: result.code !== 0,
    };
  },
);

server.tool(
  'glint_export',
  'Headless export: session folder + template id → ZIP (requires Glint Web preview server + Playwright).',
  {
    sessionDir: z.string(),
    template: z.string().default('blink-play'),
    out: z.string().default('glint.zip'),
    layout: z.enum(['flat', 'fastlane']).default('flat'),
    locale: z.string().default('en-US'),
    app: z.string().default('glint'),
    base: z.string().optional(),
  },
  async ({ sessionDir, template, out, layout, locale, app, base }) => {
    const script = path.join(WEB_ROOT, 'scripts/headless-export.mjs');
    const args = [
      script,
      '--session', path.resolve(sessionDir),
      '--template', template,
      '--out', path.resolve(out),
      '--layout', layout,
      '--locale', locale,
      '--app', app,
      '--base', base || WEB_BASE,
      '--json',
    ];
    const result = await run('node', args, { cwd: WEB_ROOT });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: result.code === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          tip: result.code !== 0
            ? 'Start Web: cd Glint-Web && npm run build && npm run preview — then retry. Install: npx playwright install chromium'
            : undefined,
        }, null, 2),
      }],
      isError: result.code !== 0,
    };
  },
);

server.tool(
  'glint_ecosystem_info',
  'Return Glint ecosystem info: paths, tools, and decision guide for screenshot capture.',
  {},
  async () => {
    const info = {
      principle: 'Real UI only — never invent App Store screenshots',
      loop: 'Capture/Bridge → session.json → Web → ZIP → View',
      decisionGuide: {
        flutterApp: 'Use glint_discover (auto) or write rules manually → glint_capture → output/ → Glint Web',
        androidDevice: 'Use glint_bridge_crawl (auto) or glint_capture (manual) → output/ → Glint Web',
        specifyScreens: 'Write rules directly in test/glint_screenshots_test.dart, skip discover',
        noScreensSpecified: 'Run glint_discover --write to auto-find best marketing screens',
      },
      goldenPath: path.join(ORG_ROOT, 'Glint-Docs/guides/golden-path.md'),
      smoke: path.join(ORG_ROOT, 'Glint-Docs/guides/smoke-checklist.md'),
      captureRoot: CAPTURE_ROOT,
      webRoot: WEB_ROOT,
      bridgeRoot: BRIDGE_ROOT,
      webBase: WEB_BASE,
      tools: ['glint_init', 'glint_discover', 'glint_capture', 'glint_bridge_crawl', 'glint_validate_session', 'glint_export', 'glint_ecosystem_info'],
      agentNote: 'Agent is the intelligence. Discover finds best screens, capture runs the test, Bridge crawls real devices. No API keys needed for Capture. Bridge AI crawl uses user key from env.',
    };
    return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
