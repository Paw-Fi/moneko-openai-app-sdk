import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSET_BASE_URL_PLACEHOLDER = '__MONEKO_ASSET_BASE_URL__';

/**
 * Widget metadata
 */
export interface WidgetMetadata {
  uri: string;
  name: string;
  description: string;
  html: string;
}

/**
 * Widget URIs for tool registration
 */
export interface WidgetUris {
  app: string;
  budget: string;
  categoryBreakdown: string;
  expenseTable: string;
  categories: string;
  auth: string;
  membership: string;
  chart: string;
}

function buildCssMissingBanner(): string {
  return `<div class="moneko-css-missing" role="alert" style="padding:12px;margin:0 0 12px 0;border:1px solid #fecaca;border-radius:12px;background:#fff1f2;color:#7f1d1d;font:13px/1.4 system-ui,sans-serif;">
  Styles are not loading. This widget expects a compiled <code>&lt;style&gt;</code> tag to be present and applied.
</div>`;
}

function buildWidgetHtml(options: {
  title: string;
  rootId: string;
  runtimeJs: string;
  css: string;
}): string {
  const { title, rootId, runtimeJs, css } = options;
  const safeRuntimeJs = runtimeJs.replace(/<\/script>/gi, '<\\/script>');

  return `
${buildCssMissingBanner()}
<div id="${rootId}">
  <div data-widget-boot="1" style="padding:12px;color:var(--color-text-secondary, #6b7280);font:14px system-ui,sans-serif;">
    Loading…
  </div>
</div>
<style>${css}</style>
<script type="module">${safeRuntimeJs}</script>
`;
}

function buildCategoriesWidgetHtml(css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Categories</title>
</head>
<body>
  ${buildCssMissingBanner()}
  <div id="categories-root" class="categories-card">
    <div class="categories-header">
      <div class="categories-title">Categories</div>
      <div class="categories-subtitle">Used when you log expenses.</div>
    </div>

    <form id="categories-form" class="categories-form">
      <input id="categories-name" class="categories-input" type="text" placeholder="Add a category (e.g. Coffee)" autocomplete="off" />
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    <ul id="categories-list" class="categories-list"></ul>
    <div id="categories-error" class="categories-error" role="alert" aria-live="polite"></div>
  </div>

  <script>
    (function () {
      function applyTheme() {
        try {
          var theme = window.openai && window.openai.theme;
          if (theme) document.documentElement.setAttribute('data-theme', String(theme));
        } catch {}
      }

      var listEl = document.getElementById('categories-list');
      var formEl = document.getElementById('categories-form');
      var inputEl = document.getElementById('categories-name');
      var errorEl = document.getElementById('categories-error');

      function getToolOutput() {
        try { return (window.openai && window.openai.toolOutput) || null; } catch { return null; }
      }

      function setError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg || '';
      }

      function render(categories) {
        if (!listEl) return;
        listEl.innerHTML = '';
        (categories || []).forEach(function (name) {
          var li = document.createElement('li');
          li.className = 'categories-pill';
          li.textContent = name;
          listEl.appendChild(li);
        });
      }

      function currentCategories() {
        var out = getToolOutput();
        if (out && Array.isArray(out.categories)) return out.categories;
        return [];
      }

      async function callTool(name, args) {
        if (!window.openai || !window.openai.callTool) {
          throw new Error('window.openai.callTool is not available');
        }
        var resp = await window.openai.callTool(name, args || {});
        var parsed = null;
        try { parsed = JSON.parse(resp.result || '{}'); } catch {}
        return parsed;
      }

      async function refresh() {
        var parsed = await callTool('list_categories', {});
        if (parsed && parsed.structuredContent && Array.isArray(parsed.structuredContent.categories)) {
          render(parsed.structuredContent.categories);
        } else {
          render(currentCategories());
        }
      }

      function onSetGlobals(e) {
        try {
          applyTheme();
          var globals = e && e.detail && e.detail.globals;
          if (!globals || globals.toolOutput === undefined) return;
          render(currentCategories());
        } catch {}
      }

      if (formEl) {
        formEl.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          setError('');
          var name = (inputEl && inputEl.value ? inputEl.value : '').trim();
          if (!name) return;
          try {
            var parsed = await callTool('create_category', { name: name });
            if (inputEl) inputEl.value = '';
            if (parsed && parsed.structuredContent && Array.isArray(parsed.structuredContent.categories)) {
              render(parsed.structuredContent.categories);
            } else {
              await refresh();
            }
          } catch (err) {
            setError(err && err.message ? err.message : 'Failed to create category');
          }
        });
      }

      applyTheme();
      window.addEventListener('openai:set_globals', onSetGlobals, { passive: true });
      render(currentCategories());
    })();
  </script>
  <style>${css}</style>
</body>
</html>
`;
}

function buildAuthWidgetHtml(css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in</title>
</head>
<body>
  ${buildCssMissingBanner()}
  <div id="auth-root" class="auth-card">
    <div class="auth-header">
      <div class="auth-title" id="auth-title">Sign in to Moneko</div>
      <div class="auth-subtitle" id="auth-subtitle">Use your Moneko account to save and view your data.</div>
    </div>

    <form id="auth-form" class="auth-form">
      <div class="auth-row">
        <div class="auth-label">Email</div>
        <input id="auth-email" class="auth-input" type="email" autocomplete="email" required />
      </div>
      <div class="auth-row">
        <div class="auth-label">Password</div>
        <input id="auth-password" class="auth-input" type="password" autocomplete="current-password" required />
      </div>

      <div class="auth-actions">
        <button id="auth-submit" class="btn btn-primary" type="submit">Sign in</button>
        <button id="auth-toggle" class="auth-link" type="button">Create an account</button>
      </div>

      <div class="auth-hint" id="auth-hint">
        This form signs you into your Moneko (Supabase) account inside the ChatGPT widget.
      </div>
    </form>

    <div id="auth-error" class="auth-error" role="alert" aria-live="polite"></div>
    <div id="auth-success" class="auth-success" role="status" aria-live="polite"></div>
  </div>

  <script>
    (function () {
      var formEl = document.getElementById('auth-form');
      var emailEl = document.getElementById('auth-email');
      var passEl = document.getElementById('auth-password');
      var submitEl = document.getElementById('auth-submit');
      var toggleEl = document.getElementById('auth-toggle');
      var titleEl = document.getElementById('auth-title');
      var hintEl = document.getElementById('auth-hint');
      var errorEl = document.getElementById('auth-error');
      var successEl = document.getElementById('auth-success');

      var mode = 'sign_in'; // or sign_up

      function applyTheme() {
        try {
          var theme = window.openai && window.openai.theme;
          if (theme) document.documentElement.setAttribute('data-theme', String(theme));
        } catch {}
      }

      function getToolOutput() {
        try { return (window.openai && window.openai.toolOutput) || {}; } catch { return {}; }
      }

      function getConfig() {
        var out = getToolOutput();
        return {
          supabaseUrl: out.supabaseUrl,
          supabaseAnonKey: out.supabaseAnonKey,
        };
      }

      function setError(msg) {
        if (errorEl) errorEl.textContent = msg || '';
        if (successEl) successEl.textContent = '';
      }

      function setSuccess(msg) {
        if (successEl) successEl.textContent = msg || '';
        if (errorEl) errorEl.textContent = '';
      }

      function setBusy(busy) {
        if (!submitEl) return;
        submitEl.disabled = !!busy;
        submitEl.textContent = busy ? 'Working…' : (mode === 'sign_in' ? 'Sign in' : 'Create account');
      }

      function renderMode() {
        if (!titleEl || !toggleEl || !hintEl) return;
        if (mode === 'sign_in') {
          titleEl.textContent = 'Sign in to Moneko';
          toggleEl.textContent = 'Create an account';
          hintEl.textContent = 'Sign in to save expenses and see your totals in this ChatGPT chat.';
          if (passEl) passEl.autocomplete = 'current-password';
        } else {
          titleEl.textContent = 'Create your Moneko account';
          toggleEl.textContent = 'I already have an account';
          hintEl.textContent = 'Create an account to use Moneko inside this ChatGPT chat.';
          if (passEl) passEl.autocomplete = 'new-password';
        }
        setError('');
      }

      async function callTool(name, args) {
        if (!window.openai || !window.openai.callTool) {
          throw new Error('window.openai.callTool is not available');
        }
        var resp = await window.openai.callTool(name, args || {});
        var parsed = null;
        try { parsed = JSON.parse(resp.result || '{}'); } catch {}
        return parsed;
      }

      async function supabaseRequest(endpoint, payload) {
        var cfg = getConfig();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          throw new Error('Missing Supabase configuration. Ask Moneko to sign in again.');
        }
        var url = String(cfg.supabaseUrl).replace(/\\/+$/, '') + endpoint;
        var res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': String(cfg.supabaseAnonKey),
            'Authorization': 'Bearer ' + String(cfg.supabaseAnonKey),
          },
          body: JSON.stringify(payload || {}),
        });
        var text = await res.text();
        var data = null;
        try { data = JSON.parse(text || '{}'); } catch { data = { raw: text }; }
        if (!res.ok) {
          var msg = (data && (data.msg || data.error_description || data.error)) || 'Authentication failed';
          throw new Error(String(msg));
        }
        return data;
      }

      async function handleSubmit(ev) {
        ev.preventDefault();
        setError('');
        setSuccess('');

        var email = (emailEl && emailEl.value ? emailEl.value : '').trim();
        var password = (passEl && passEl.value ? passEl.value : '').trim();
        if (!email || !password) {
          setError('Please enter your email and password.');
          return;
        }

        setBusy(true);
        try {
          var data;
          if (mode === 'sign_in') {
            data = await supabaseRequest('/auth/v1/token?grant_type=password', { email: email, password: password });
          } else {
            data = await supabaseRequest('/auth/v1/signup', { email: email, password: password });
          }

          var accessToken = data && (data.access_token || (data.session && data.session.access_token));
          if (!accessToken) {
            setSuccess('Account created. Check your email to confirm, then sign in here.');
            return;
          }

          await callTool('moneko.set_auth_session', { access_token: accessToken });
          setSuccess('Signed in. You can return to the chat and continue.');
          if (passEl) passEl.value = '';
        } catch (err) {
          setError(err && err.message ? err.message : 'Authentication failed.');
        } finally {
          setBusy(false);
        }
      }

      if (toggleEl) {
        toggleEl.addEventListener('click', function () {
          mode = mode === 'sign_in' ? 'sign_up' : 'sign_in';
          renderMode();
          if (submitEl) submitEl.textContent = mode === 'sign_in' ? 'Sign in' : 'Create account';
        });
      }

      if (formEl) {
        formEl.addEventListener('submit', handleSubmit);
      }

      window.addEventListener('openai:set_globals', function () {
        applyTheme();
        renderMode();
      }, { passive: true });

      applyTheme();
      renderMode();
    })();
  </script>
  <style>${css}</style>
</body>
</html>
`;
}

function buildChartWidgetHtml(css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chart</title>
</head>
<body>
  ${buildCssMissingBanner()}
  <div id="chart-root" class="chart-card">
    <div class="chart-header">
      <div id="chart-title" class="chart-title">Chart</div>
      <div id="chart-subtitle" class="chart-subtitle">Visualization generated by Moneko.</div>
    </div>

    <div class="chart-canvas-wrap">
      <canvas id="chart-canvas" class="chart-canvas" width="680" height="420"></canvas>
      <div id="chart-empty" class="chart-empty" hidden>No chart data.</div>
    </div>

    <ul id="chart-legend" class="chart-legend" aria-label="Chart legend"></ul>
  </div>

  <script>
    (function () {
      var canvas = document.getElementById('chart-canvas');
      var emptyEl = document.getElementById('chart-empty');
      var legendEl = document.getElementById('chart-legend');
      var titleEl = document.getElementById('chart-title');
      var subtitleEl = document.getElementById('chart-subtitle');

      var COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b','#22c55e'];

      function applyTheme() {
        try {
          var theme = window.openai && window.openai.theme;
          if (theme) document.documentElement.setAttribute('data-theme', String(theme));
        } catch {}
      }

      function getToolOutput() {
        try { return (window.openai && window.openai.toolOutput) || null; } catch { return null; }
      }

      function setText(el, text) {
        if (!el) return;
        el.textContent = text || '';
      }

      function showEmpty(show) {
        if (!emptyEl || !canvas) return;
        emptyEl.hidden = !show;
        canvas.style.display = show ? 'none' : 'block';
      }

      function renderLegend(labels, values) {
        if (!legendEl) return;
        legendEl.innerHTML = '';
        for (var i = 0; i < labels.length; i++) {
          var li = document.createElement('li');
          li.className = 'chart-legend-item';
          var sw = document.createElement('span');
          sw.className = 'chart-swatch';
          sw.style.background = COLORS[i % COLORS.length];
          var txt = document.createElement('span');
          txt.textContent = labels[i] + ' — ' + String(values[i]);
          li.appendChild(sw);
          li.appendChild(txt);
          legendEl.appendChild(li);
        }
      }

      function clearCanvas(ctx) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }

      function drawBar(ctx, labels, values) {
        clearCanvas(ctx);
        var w = ctx.canvas.width;
        var h = ctx.canvas.height;
        var pad = 40;
        var chartW = w - pad * 2;
        var chartH = h - pad * 2;
        var max = Math.max.apply(null, values.concat([1]));
        var barW = chartW / Math.max(1, values.length);

        ctx.fillStyle = '#0f172a';
        ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.textBaseline = 'middle';

        // axis
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, pad + chartH);
        ctx.lineTo(pad + chartW, pad + chartH);
        ctx.stroke();

        for (var i = 0; i < values.length; i++) {
          var v = values[i];
          var bh = Math.round((v / max) * (chartH - 10));
          var x = pad + i * barW + Math.round(barW * 0.15);
          var y = pad + chartH - bh;
          var bw = Math.max(6, Math.round(barW * 0.7) - 4);
          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.fillRect(x, y, bw, bh);

          // label
          ctx.fillStyle = '#334155';
          var lab = String(labels[i] || '').slice(0, 12);
          ctx.save();
          ctx.translate(x + bw / 2, pad + chartH + 14);
          ctx.rotate(-0.35);
          ctx.textAlign = 'right';
          ctx.fillText(lab, 0, 0);
          ctx.restore();
        }
      }

      function drawPie(ctx, labels, values, donut) {
        clearCanvas(ctx);
        var w = ctx.canvas.width;
        var h = ctx.canvas.height;
        var cx = Math.round(w / 2);
        var cy = Math.round(h / 2);
        var r = Math.min(w, h) * 0.33;
        var total = values.reduce(function (a, b) { return a + b; }, 0);
        if (!total) return;

        var start = -Math.PI / 2;
        for (var i = 0; i < values.length; i++) {
          var v = values[i];
          var ang = (v / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, start, start + ang);
          ctx.closePath();
          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.fill();
          start += ang;
        }

        if (donut) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      function render() {
        var out = getToolOutput() || {};
        var labels = Array.isArray(out.labels) ? out.labels : [];
        var data = Array.isArray(out.data) ? out.data : [];
        var chartType = String(out.chart_type || 'bar');
        var title = out.title ? String(out.title) : 'Chart';

        setText(titleEl, title);
        setText(subtitleEl, chartType === 'radar' ? 'Radar charts render as bars in this widget.' : 'Visualization generated by Moneko.');

        if (!canvas || !canvas.getContext || labels.length === 0 || data.length === 0) {
          showEmpty(true);
          renderLegend([], []);
          return;
        }

        var values = data.map(function (n) { return Number(n) || 0; });
        if (values.every(function (n) { return n === 0; })) {
          showEmpty(true);
          renderLegend([], []);
          return;
        }

        showEmpty(false);
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (chartType === 'pie') {
          drawPie(ctx, labels, values, false);
        } else if (chartType === 'donut') {
          drawPie(ctx, labels, values, true);
        } else {
          drawBar(ctx, labels, values);
        }

        renderLegend(labels, values);
      }

      window.addEventListener('openai:set_globals', function () {
        applyTheme();
        render();
      }, { passive: true });

      applyTheme();
      render();
    })();
  </script>
  <style>${css}</style>
</body>
</html>
`;
}

/**
 * Register all widget resources and return their URIs
 */
export function registerWidgets(): { widgets: WidgetMetadata[]; uris: WidgetUris } {
  // Find the web/dist directory (contains built JS/CSS assets for the widgets)
  // Server is at moneko-openai-app-sdk/server
  // Web is at moneko-openai-app-sdk/web
  const serverRoot = path.resolve(__dirname, '..', '..');
  const projectRoot = path.resolve(serverRoot, '..');
  const webDir = path.join(projectRoot, 'web', 'dist');

  if (!fs.existsSync(webDir)) {
    throw new Error(
      `Widget assets not found. Expected directory ${webDir}. ` +
      `Run "pnpm run build" in the web directory before starting the server.`
    );
  }

  logger.info({ webDir }, 'Loading widget HTML from directory');

  const requiredJs = ['widget-runtime.js'];
  for (const jsFile of requiredJs) {
    const fullPath = path.join(webDir, jsFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `Widget JS asset not found: ${fullPath}. ` +
        `Run "pnpm --filter web build" to generate the widget bundles.`
      );
    }
  }

  const runtimeCssPath = path.join(webDir, 'widget-runtime.css');
  if (!fs.existsSync(runtimeCssPath)) {
    throw new Error(
      `Widget CSS asset not found: ${runtimeCssPath}. ` +
      `Run "pnpm --filter web build" to generate the widget bundles.`
    );
  }
  const runtimeJs = fs.readFileSync(path.join(webDir, 'widget-runtime.js'), 'utf8');
  const runtimeCss = fs.readFileSync(runtimeCssPath, 'utf8');

  const widgets: WidgetMetadata[] = [
    {
      uri: 'ui://widget/app.html',
      name: 'Moneko App',
      description: 'Multi-page budgeting app shell (sign-in, subscription, dashboard)',
      html: buildWidgetHtml({
        title: 'Moneko',
        rootId: 'app-shell-root',
        runtimeJs,
        css: runtimeCss,
      }),
    },
    {
      uri: 'ui://widget/budget-status-card.html',
      name: 'Budget Status Card',
      description: 'Budget pacing and remaining balance widget',
      html: buildWidgetHtml({
        title: 'Budget Status Card',
        rootId: 'budget-status-root',
        runtimeJs,
        css: runtimeCss,
      }),
    },
    {
      uri: 'ui://widget/category-breakdown.html',
      name: 'Category Breakdown Chart',
      description: 'Expense breakdown by category widget',
      html: buildWidgetHtml({
        title: 'Category Breakdown',
        rootId: 'category-breakdown-root',
        runtimeJs,
        css: runtimeCss,
      }),
    },
    {
      uri: 'ui://widget/expense-table.html',
      name: 'Expense Table',
      description: 'Transaction list widget with edit/delete capabilities',
      html: buildWidgetHtml({
        title: 'Expense Table',
        rootId: 'expense-table-root',
        runtimeJs,
        css: runtimeCss,
      }),
    },
    {
      uri: 'ui://widget/categories.html',
      name: 'Categories',
      description: 'List and manage expense categories',
      html: buildCategoriesWidgetHtml(runtimeCss),
    },
    {
      uri: 'ui://widget/membership.html',
      name: 'Membership',
      description: 'Subscription status and upgrade options (external checkout)',
      html: buildWidgetHtml({
        title: 'Membership',
        rootId: 'membership-root',
        runtimeJs,
        css: runtimeCss,
      }),
    },
    {
      uri: 'ui://widget/auth.html',
      name: 'Sign in',
      description: 'Sign in or create a Moneko account in this chat',
      html: buildAuthWidgetHtml(runtimeCss),
    },
    {
      uri: 'ui://widget/chart.html',
      name: 'Chart',
      description: 'Generic chart widget (bar/pie/donut) rendered locally',
      html: buildChartWidgetHtml(runtimeCss),
    },
  ];

  logger.info({ count: widgets.length }, 'Loaded widget HTML files');

  const uris: WidgetUris = {
    app: 'ui://widget/app.html',
    budget: 'ui://widget/budget-status-card.html',
    categoryBreakdown: 'ui://widget/category-breakdown.html',
    expenseTable: 'ui://widget/expense-table.html',
    categories: 'ui://widget/categories.html',
    auth: 'ui://widget/auth.html',
    membership: 'ui://widget/membership.html',
    chart: 'ui://widget/chart.html',
  };

  return { widgets, uris };
}
