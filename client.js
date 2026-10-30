window.__ModuleLoader__.load({
  id: 'dsh-guard-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'dsh-guard-panel';
    const API = '/api/dsh-guard';
    const NS = 'dsh-guard-panel';

    const ZH = {
      title: '安装守卫',
      snapshot: '拍快照',
      verify: '重启后验证',
      plan: '预演回滚',
      rollback: '回滚到已知良好',
      undo: '撤销回滚',
      refresh: '刷新',
      history: '历史快照',
      none: '还没有快照。',
      loading: '加载中…',
      last: '最近快照',
      good: '已知良好',
      crashes: '崩溃日志',
      diverged: '最近快照与已知良好不一致：上次安装很可能没通过验证，回滚会回到「已知良好」。',
      noCli: '找不到 guard.mjs，页面操作不可用。',
      rows: '条',
      busySnapshot: '正在拍快照…',
      busyVerify: '正在验证…',
      busyPlan: '正在生成回滚计划…',
      busyRollback: '正在回滚…',
      busyUndo: '正在恢复…',
      notePlaceholder: '这次快照的说明（可选）',
      details: '详情',
      collapse: '收起',
      detailCommit: '提交',
      detailTime: '时间',
      detailNote: '说明',
      detailNoNote: '（未填写）',
      detailMark: '标记',
    };
    const EN = {
      title: 'Install Guard',
      snapshot: 'Snapshot',
      verify: 'Verify after restart',
      plan: 'Preview rollback',
      rollback: 'Roll back to known good',
      undo: 'Undo rollback',
      refresh: 'Refresh',
      history: 'Snapshots',
      none: 'No snapshots yet.',
      loading: 'Loading…',
      last: 'last',
      good: 'known good',
      crashes: 'crash logs',
      diverged: 'The newest snapshot is not the known-good one: the last install probably failed verification. Rolling back targets the known-good state.',
      noCli: 'guard.mjs not found; page actions are unavailable.',
      rows: '',
      busySnapshot: 'Snapshotting…',
      busyVerify: 'Verifying…',
      busyPlan: 'Building plan…',
      busyRollback: 'Rolling back…',
      busyUndo: 'Restoring…',
      notePlaceholder: 'Note for this snapshot (optional)',
      details: 'Details',
      collapse: 'Hide',
      detailCommit: 'commit',
      detailTime: 'time',
      detailNote: 'note',
      detailNoNote: '(none)',
      detailMark: 'tags',
    };

    let translate = (key) => ZH[key] || key;
    const t = (key) => translate(key);

    const C = {
      page: { padding: '24px 28px', overflowY: 'auto', height: '100%', color: 'inherit', fontSize: 13, lineHeight: 1.6 },
      title: { fontSize: 18, fontWeight: 600, margin: '0 0 4px' },
      sub: { opacity: 0.6, margin: '0 0 20px', fontSize: 12 },
      bar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 18px' },
      btn: { padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 },
      btnDanger: { borderColor: 'rgba(220,80,80,.6)', color: '#e06b6b' },
      badge: { padding: '2px 8px', borderRadius: 4, background: 'rgba(127,127,127,.14)', fontSize: 12 },
      grid: { display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px 12px', alignItems: 'center' },
      card: { border: '1px solid rgba(127,127,127,.25)', borderRadius: 8, padding: '10px 14px', margin: '0 0 8px' },
      pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5, lineHeight: 1.5, background: 'rgba(127,127,127,.1)', padding: 12, borderRadius: 6, maxHeight: 320, overflow: 'auto', margin: '10px 0 0' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
      dim: { opacity: 0.55 },
    };

    async function call(path, init) {
      try {
        const res = await fetch(API + path, init);
        return await res.json();
      } catch (error) {
        return { ok: false, output: String(error && error.message ? error.message : error) };
      }
    }

    function Badge({ label, value }) {
      return h('span', { style: C.badge }, `${label} `, h('b', { style: C.mono }, value || '—'));
    }

    function GuardPage() {
      const [data, setData] = React.useState(null);
      const [busy, setBusy] = React.useState('');
      const [out, setOut] = React.useState('');
      const [note, setNote] = React.useState('');
      const [open, setOpen] = React.useState(null);

      const load = React.useCallback(async () => {
        const next = await call('/state');
        if (next && next.ok) {
          // Keep the previous object when nothing changed so polling does not
          // re-render the whole page every tick.
          setData((previous) => (previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
        } else {
          setOut(next && next.output ? next.output : '');
        }
      }, []);

      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => {
        const id = setInterval(() => { load(); }, 8000);
        return () => clearInterval(id);
      }, [load]);

      const act = async (action, ref, extra) => {
        setBusy(action);
        setOut('');
        const result = await call('/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ref, ...(extra || {}) }),
        });
        setOut(result.output || (result.ok ? 'ok' : 'failed'));
        setBusy('');
        if (action === 'snapshot') setNote('');
        await load();
      };

      if (!data) return h('div', { style: C.page }, h('div', { style: C.dim }, out || t('loading')));

      const last = data.last;
      const good = data.lastGood;
      const diverged = last && good && last.commit !== good.commit;
      const short = (value) => (value ? `${value.commit} ${value.at.slice(0, 16).replace('T', ' ')}` : '—');

      return h('div', { style: C.page },
        h('h1', { style: C.title }, t('title')),
        h('p', { style: C.sub }, data.profileDir),
        !data.cli && h('div', { style: { ...C.card, borderColor: 'rgba(220,80,80,.6)' } }, t('noCli')),
        h('div', { style: C.bar },
          h(Badge, { label: t('last'), value: short(last) }),
          h(Badge, { label: t('good'), value: short(good) }),
          h(Badge, { label: t('crashes'), value: String(data.crashes.length) }),
        ),
        diverged && h('div', { style: { ...C.card, borderColor: 'rgba(230,170,60,.6)' } }, t('diverged')),
        h('div', { style: C.bar },
          h('input', {
            value: note,
            onChange: (event) => setNote(event.target.value),
            placeholder: t('notePlaceholder'),
            style: { ...C.btn, width: 240, cursor: 'text' },
          }),
          h('button', { style: C.btn, disabled: !!busy, onClick: () => act('snapshot', undefined, { note }) }, busy === 'snapshot' ? t('busySnapshot') : t('snapshot')),
          h('button', { style: C.btn, disabled: !!busy, onClick: () => act('verify') }, busy === 'verify' ? t('busyVerify') : t('verify')),
          h('button', { style: C.btn, disabled: !!busy, onClick: () => act('plan-rollback') }, busy === 'plan-rollback' ? t('busyPlan') : t('plan')),
          h('button', { style: { ...C.btn, ...C.btnDanger }, disabled: !!busy, onClick: () => act('rollback') }, busy === 'rollback' ? t('busyRollback') : t('rollback')),
          h('button', { style: C.btn, disabled: !!busy, onClick: () => act('undo') }, busy === 'undo' ? t('busyUndo') : t('undo')),
          h('button', { style: C.btn, disabled: !!busy, onClick: () => load() }, t('refresh')),
        ),
        out && h('pre', { style: C.pre }, out),
        h('h2', { style: { fontSize: 14, fontWeight: 600, margin: '22px 0 10px' } }, `${t('history')} (${data.commits.length})`),
        data.commits.length === 0 && h('div', { style: C.dim }, t('none')),
        data.commits.map((commit) => h('div', { key: commit.hash, style: C.card },
          h('div', { style: C.grid },
            h('div', null,
              h('div', { style: C.mono }, commit.subject),
              h('div', { style: { ...C.dim, fontSize: 11 } },
                `${commit.short}  ${commit.date}`,
                commit.note ? `  ·  ${commit.note.replace(/\s+/g, ' ').slice(0, 36)}` : '')),
            h('button', { style: C.btn, onClick: () => setOpen(open === commit.hash ? null : commit.hash) }, open === commit.hash ? t('collapse') : t('details')),
            h('button', { style: C.btn, disabled: !!busy, onClick: () => act('plan-rollback', commit.hash) }, t('plan')),
            h('button', { style: { ...C.btn, ...C.btnDanger }, disabled: !!busy, onClick: () => act('rollback', commit.hash) }, t('rollback')),
          ),
          open === commit.hash && h('div', {
            style: { ...C.dim, fontSize: 11.5, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.7 },
          },
          `${t('detailCommit')}  ${commit.hash}\n`,
          `${t('detailTime')}    ${commit.date}\n`,
          `${t('detailNote')}    ${commit.note || t('detailNoNote')}\n`,
          `${t('detailMark')}    ${[last && last.commit === commit.hash ? t('last') : '', good && good.commit === commit.hash ? t('good') : ''].filter(Boolean).join(' / ') || '—'}`),
        )),
      );
    }

    function GuardIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false,
      },
      h('path', { d: 'M12 3l7 3v5.5c0 4.4-2.9 7.6-7 9.5-4.1-1.9-7-5.1-7-9.5V6l7-3z' }),
      h('path', { d: 'M8.8 12.1l2.2 2.2 4.2-4.4' }));
    }

    const inject = ['slots', 'locale', 'layout'];

    /**
     * Register the dictionaries, tolerating both contract forms.
     *
     * `register(ns, { zh, en })` registers every built-in locale at once and
     * enforces bilingual balance, so it is the right call today — but it throws
     * the moment DSH ships a third built-in language, and a throw here fails the
     * whole entry activation, which takes the boot down with it. The three-arg
     * form registers one locale at a time and has no such coupling, so a failed
     * combined call degrades into per-locale calls instead of failing the plugin.
     */
    function registerDictionaries(locale) {
      const disposers = [];
      try {
        const dispose = locale.register(NS, { zh: ZH, en: EN });
        if (typeof dispose === 'function') disposers.push(dispose);
        return () => { for (const stop of disposers) stop(); };
      } catch {
        // A partial combined registration may have already claimed one locale;
        // its duplicate error is swallowed so the other languages still land.
        disposers.length = 0;
        for (const [tag, dict] of [['zh', ZH], ['en', EN]]) {
          try {
            const dispose = locale.register(NS, tag, dict);
            if (typeof dispose === 'function') disposers.push(dispose);
          } catch { /* this tag is already registered */ }
        }
        return () => { for (const stop of disposers.reverse()) stop(); };
      }
    }

    /** Register the dictionaries and return the namespace-bound translator. */
    function bindLocale(ctx) {
      try {
        const locale = ctx.locale;
        if (!locale || typeof locale.register !== 'function' || typeof locale.bind !== 'function') return null;
        ctx.effect(() => registerDictionaries(locale), 'dsh-guard-panel: dictionaries');
        const bound = locale.bind(NS);
        return (key) => {
          try {
            const value = bound(key);
            if (typeof value === 'string' && value !== '' && value !== key) return value;
          } catch { /* unregistered key */ }
          return ZH[key] || key;
        };
      } catch {
        return null;
      }
    }

    return {
      inject,
      apply(ctx) {
        const bound = bindLocale(ctx);
        if (bound) translate = bound;
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID, locale: NS,
        }, GuardPage));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 35, label: () => t('title'), locale: NS,
        }, GuardIcon));
      },
    };
  },
});
