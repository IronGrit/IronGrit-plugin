/**
 * Host half of the install-guard panel.
 *
 * It owns no snapshot logic of its own: /api/dsh-guard/* shells out to the
 * guard CLI (toolkit/guard.mjs) so the terminal tool and the page can never
 * disagree about what "known good" means.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const GUARD_HOME = path.join(HOME, '.dsh', 'install-guard');
const STATE_FILE = path.join(GUARD_HOME, 'last.json');
const GIT_DIR = path.join(GUARD_HOME, 'profile.git');
const PROFILE_DIR = path.join(HOME, '.dsh', 'profiles', 'desktop');
const TRACKED = ['cordis.patch.yml', 'package.json', 'pnpm-lock.yaml', 'cordis.yml'];
const CRASH_DIR = path.join(
  process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'),
  '@deepseek-ai', 'dsh-desktop', 'logs',
);

// Resolve the CLI relative to this package instead of hard-coding a workspace
// path: the bundle is installed as a link to the checkout, so the workspace can
// move and this keeps pointing at the sibling toolkit directory.
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = path.dirname(PLUGIN_DIR);

function resolveCli(config) {
  const candidates = [
    config && config.guardCli,
    process.env.DSH_GUARD_CLI,
    path.join(WORKSPACE_DIR, 'toolkit', 'guard.mjs'),
    path.join(HOME, '.dsh', 'toolkit', 'guard.mjs'),
  ].filter((value) => typeof value === 'string' && value.trim() !== '');
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* keep looking */ }
  }
  return '';
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return undefined; }
}

function git(args) {
  const r = spawnSync('git', [
    '--git-dir', GIT_DIR, '--work-tree', PROFILE_DIR,
    '-c', 'core.quotepath=false', '-c', 'core.autocrlf=false',
    ...args,
  ], { encoding: 'utf8', timeout: 30000 });
  return { ok: r.status === 0, text: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function commits() {
  // %x1f separates fields and %x1e ends a record: the body (the note) is
  // multi-line, so splitting on newlines would tear a snapshot apart.
  // No pathspec on purpose: a snapshot that records an unchanged profile is an
  // empty commit, and `git log -- <paths>` hides exactly those. The timeline
  // must list every snapshot, not only the ones that moved a file.
  const r = git(['log', '--format=%H%x1f%h%x1f%ad%x1f%s%x1f%b%x1e', '--date=format:%Y-%m-%d %H:%M', '-n', '80']);
  if (!r.ok) return [];
  return r.text
    .split('\x1e')
    .map((chunk) => chunk.replace(/^\r?\n/, ''))
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const [hash, short, date, subject, body] = chunk.split('\x1f');
      return {
        hash: (hash || '').trim(),
        short: (short || '').trim(),
        date: (date || '').trim(),
        subject: (subject || '').trim(),
        note: (body || '').trim(),
      };
    });
}

function crashLogs() {
  try { return fs.readdirSync(CRASH_DIR).filter((f) => /^crash-.*\.log$/.test(f)).sort(); } catch { return []; }
}

function redact(text) {
  return String(text)
    .replace(/(apiKey\s*:\s*)\S+/gi, '$1<REDACTED>')
    .replace(/\b(sk|pk|ak)-[A-Za-z0-9_-]{8,}/g, '$1-<REDACTED>');
}

function writeJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}

/** Loopback-only: this page mutates the profile, so refuse anything cross-origin. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

export const inject = ['webServer'];

export function apply(ctx, config) {
  const cli = resolveCli(config);
  const runCli = (args) => {
    if (!cli) return { ok: false, output: '找不到 guard.mjs：设置 DSH_GUARD_CLI，或在插件配置里填 guardCli' };
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 300000 });
    return { ok: r.status === 0, output: redact(`${r.stdout || ''}${r.stderr || ''}`.trim()) };
  };

  const routes = [
    {
      kind: 'exact',
      path: '/api/dsh-guard/state',
      handler: (req, res) => {
        if (!sameOrigin(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' });
        if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
        const state = readJson(STATE_FILE) || {};
        return writeJson(res, 200, {
          ok: true,
          profileDir: PROFILE_DIR,
          repo: fs.existsSync(GIT_DIR),
          last: state.last || null,
          lastGood: state.lastGood || null,
          commits: commits(),
          crashes: crashLogs().slice(-8),
          cli,
          workspace: WORKSPACE_DIR,
        });
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-guard/action',
      handler: async (req, res) => {
        if (!sameOrigin(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' });
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
        let body;
        try { body = await readBody(req); } catch { return writeJson(res, 400, { ok: false, error: 'bad-json' }); }
        const actions = {
          snapshot: ['snapshot', '面板'],
          verify: ['verify'],
          'plan-rollback': ['rollback', '--dry-run'],
          rollback: ['rollback'],
          undo: ['undo'],
        };
        const args = actions[body.action];
        if (!args) return writeJson(res, 400, { ok: false, error: 'unknown-action' });
        const call = args.slice();
        if (body.ref) call.push(String(body.ref));
        if (body.action === 'snapshot' && typeof body.note === 'string' && body.note.trim() !== '') {
          call.push(`--note=${body.note.trim()}`);
        }
        const result = runCli(call);
        return writeJson(res, 200, { ...result, action: body.action });
      },
    },
  ];

  for (const route of routes) ctx.effect(() => ctx.webServer.register(route));
}
