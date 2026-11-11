// Roda em todas as páginas (e iframes).
// - Em qualquer frame: avisa o background quando o Ctrl/Alt é solto ou Esc é apertado.
// - Só no frame principal: desenha a lista de abas (overlay estilo VS Code).

(() => {
  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // extensão recarregada: este script ficou órfão
    }
  }

  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Control' || e.key === 'Alt') send({ type: 'modifier-up' });
    },
    true,
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && (e.ctrlKey || e.altKey)) send({ type: 'cancel' });
    },
    true,
  );

  if (window.top !== window) return;

  const STYLE = `
    :host { all: initial; }
    .wrap {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; justify-content: center; align-items: flex-start;
      pointer-events: none;
    }
    .panel {
      --bg: #252526; --fg: #cccccc; --muted: #8b8b8b; --border: #454545;
      --sel-bg: #04395e; --sel-fg: #ffffff; --hover: #2a2d2e;
      pointer-events: auto;
      margin-top: 12px; width: min(620px, calc(100vw - 32px));
      max-height: 60vh; overflow-y: auto; box-sizing: border-box;
      background: var(--bg); color: var(--fg);
      border: 1px solid var(--border); border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .45);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      padding: 4px;
    }
    @media (prefers-color-scheme: light) {
      .panel {
        --bg: #f8f8f8; --fg: #1f1f1f; --muted: #6b6b6b; --border: #d4d4d4;
        --sel-bg: #0060c0; --sel-fg: #ffffff; --hover: #e8e8e8;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
      }
    }
    .title {
      padding: 4px 8px 6px; font-size: 11px; color: var(--muted);
      text-transform: uppercase; letter-spacing: .04em;
    }
    ul { list-style: none; margin: 0; padding: 0; }
    li {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 8px; border-radius: 4px; cursor: default; white-space: nowrap;
    }
    li:hover { background: var(--hover); }
    li.sel, li.sel:hover { background: var(--sel-bg); color: var(--sel-fg); }
    li.sel .host { color: inherit; opacity: .8; }
    img, .ph { width: 16px; height: 16px; flex: none; }
    .ph { border-radius: 3px; background: var(--border); }
    .name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .host {
      color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis;
      flex: none; max-width: 40%; margin-left: auto; padding-left: 12px;
    }
  `;

  let host = null;
  let listEl = null;
  let items = [];
  let index = 0;

  function faviconUrl(pageUrl) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', '32');
    return u.toString();
  }

  function hostname(url) {
    try {
      const u = new URL(url);
      return u.protocol.startsWith('http') ? u.hostname.replace(/^www\./, '') : u.protocol.replace(':', '');
    } catch {
      return '';
    }
  }

  function placeholder() {
    const s = document.createElement('span');
    s.className = 'ph';
    return s;
  }

  function ensure() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Abas recentes';
    listEl = document.createElement('ul');
    panel.append(title, listEl);
    wrap.append(panel);
    shadow.append(style, wrap);
    document.documentElement.append(host);
  }

  function render() {
    listEl.replaceChildren(
      ...items.map((it, i) => {
        const li = document.createElement('li');
        if (i === index) li.className = 'sel';

        if (it.url) {
          const img = document.createElement('img');
          img.src = faviconUrl(it.url);
          img.onerror = () => img.replaceWith(placeholder());
          li.append(img);
        } else {
          li.append(placeholder());
        }

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = it.title;
        const h = document.createElement('span');
        h.className = 'host';
        h.textContent = hostname(it.url);
        li.append(name, h);

        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          send({ type: 'pick', index: i });
        });
        return li;
      }),
    );
    listEl.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function hide() {
    host?.remove();
    host = null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'overlay-show') {
      items = msg.items;
      index = msg.index;
      ensure();
      render();
      sendResponse({ ok: true });
    } else if (msg?.type === 'overlay-update') {
      index = msg.index;
      if (!host?.isConnected) return sendResponse({ ok: false });
      render();
      sendResponse({ ok: true });
    } else if (msg?.type === 'overlay-hide') {
      hide();
      sendResponse({ ok: true });
    }
  });
})();
