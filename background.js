// Troca de abas em ordem MRU (most recently used), como o Ctrl+Tab do VS Code.
//
// Modo overlay (padrão): o primeiro aperto do atalho mostra uma lista das abas
// na página atual; cada aperto seguinte só move a seleção. Ao soltar o Ctrl
// (detectado pelo content.js) vai para a aba selecionada. Esc cancela.
//
// Modo direto (fallback): em páginas onde content scripts não rodam (chrome://,
// Nova aba, Web Store) não dá para mostrar a lista, então cada aperto já troca
// de aba, e a escolha é confirmada ao soltar o Ctrl ou após DIRECT_COMMIT_MS.

const DIRECT_COMMIT_MS = 1500;
// Rede de segurança caso o "soltou o Ctrl" nunca chegue (ex.: foco na barra de endereço).
const OVERLAY_COMMIT_MS = 6000;

/** @type {Record<string, number[]> | null} windowId -> tabIds, mais recente primeiro */
let mru = null;
let ready = null;
/**
 * @type {{ windowId: number, hostTabId: number, list: number[], index: number,
 *          mode: 'overlay' | 'direct' } | null}
 */
let cycle = null;
let commitTimer = null;

// Todos os eventos passam por esta fila, para que apertos rápidos não se atropelem.
let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(fn).catch((err) => console.error('[mru]', err));
  return queue;
}

function load() {
  ready ??= (async () => {
    const { mru: stored } = await chrome.storage.session.get('mru');
    if (stored) {
      mru = stored;
      return;
    }
    // Primeira execução: semeia a ordem com tab.lastAccessed.
    mru = {};
    const tabs = await chrome.tabs.query({});
    tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    for (const t of tabs) (mru[t.windowId] ??= []).push(t.id);
    await save();
  })();
  return ready;
}

function save() {
  return chrome.storage.session.set({ mru });
}

function touch(windowId, tabId) {
  const list = (mru[windowId] ?? []).filter((id) => id !== tabId);
  list.unshift(tabId);
  mru[windowId] = list;
}

function removeFromMru(windowId, tabId) {
  if (mru[windowId]) mru[windowId] = mru[windowId].filter((id) => id !== tabId);
}

function sendToTab(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
}

async function buildCycle(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const ids = new Set(tabs.map((t) => t.id));
  let list = (mru[windowId] ?? []).filter((id) => ids.has(id));
  for (const t of tabs) if (!list.includes(t.id)) list.push(t.id);
  const active = tabs.find((t) => t.active);
  if (!active) return null;
  list = [active.id, ...list.filter((id) => id !== active.id)];
  return { windowId, hostTabId: active.id, list, index: 0, mode: 'direct' };
}

async function overlayItems(c) {
  const tabs = await chrome.tabs.query({ windowId: c.windowId });
  const byId = new Map(tabs.map((t) => [t.id, t]));
  c.list = c.list.filter((id) => byId.has(id));
  return c.list.map((id) => {
    const t = byId.get(id);
    return { title: t.title || t.url || 'Nova aba', url: t.url || t.pendingUrl || '' };
  });
}

function scheduleCommit() {
  clearTimeout(commitTimer);
  const ms = cycle?.mode === 'overlay' ? OVERLAY_COMMIT_MS : DIRECT_COMMIT_MS;
  commitTimer = setTimeout(() => enqueue(() => finish('commit')), ms);
}

/**
 * Encerra o ciclo.
 * - 'commit': vai para a aba selecionada.
 * - 'cancel': Esc; volta para a aba de origem.
 * - 'abandon': o usuário trocou de aba por outro meio; só fecha a lista.
 */
async function finish(how) {
  clearTimeout(commitTimer);
  const c = cycle;
  cycle = null;
  if (!c) return;

  if (c.mode === 'overlay') sendToTab(c.hostTabId, { type: 'overlay-hide' }).catch(() => {});
  if (how === 'abandon') return;

  const target = how === 'commit' ? c.list[c.index] : c.list[0];
  if (target === undefined) return;
  try {
    await chrome.tabs.update(target, { active: true });
  } catch {
    return; // aba fechada nesse meio-tempo
  }
  touch(c.windowId, target);
  await save();
}

async function onCommand(command, tab) {
  if (command !== 'mru-next' && command !== 'mru-prev') return;
  await load();
  const step = command === 'mru-prev' ? -1 : 1;
  const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id;

  if (cycle && cycle.windowId !== windowId) await finish('abandon');

  if (!cycle) {
    const c = await buildCycle(windowId);
    if (!c || c.list.length < 2) return;
    try {
      const items = await overlayItems(c);
      c.index = (step + c.list.length) % c.list.length;
      const res = await sendToTab(c.hostTabId, { type: 'overlay-show', items, index: c.index });
      if (res?.ok) c.mode = 'overlay';
    } catch {
      c.mode = 'direct'; // sem content script nesta página
    }
    c.index = (step + c.list.length) % c.list.length;
    cycle = c;
  } else {
    const n = cycle.list.length;
    cycle.index = (cycle.index + step + n) % n;
  }

  scheduleCommit();

  if (cycle.mode === 'overlay') {
    const res = await sendToTab(cycle.hostTabId, { type: 'overlay-update', index: cycle.index }).catch(
      () => null,
    );
    if (!res?.ok) await finish('commit'); // página navegou e a lista sumiu
  } else {
    try {
      await chrome.tabs.update(cycle.list[cycle.index], { active: true });
    } catch {
      cycle.list.splice(cycle.index, 1);
      cycle.index = Math.min(cycle.index, cycle.list.length - 1);
    }
  }
}

chrome.commands.onCommand.addListener((command, tab) => enqueue(() => onCommand(command, tab)));

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'modifier-up') enqueue(() => finish('commit'));
  else if (msg?.type === 'cancel') enqueue(() => finish('cancel'));
  else if (msg?.type === 'pick')
    enqueue(() => {
      if (cycle?.mode !== 'overlay') return;
      if (msg.index >= 0 && msg.index < cycle.list.length) cycle.index = msg.index;
      return finish('commit');
    });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) =>
  enqueue(async () => {
    await load();
    if (cycle && cycle.windowId === windowId) {
      // No modo direto as abas intermediárias não entram na lista.
      if (cycle.mode === 'direct') return;
      await finish('abandon'); // trocou de aba com o mouse com a lista aberta
    }
    touch(windowId, tabId);
    await save();
  }),
);

chrome.tabs.onCreated.addListener((tab) =>
  enqueue(async () => {
    await load();
    const list = (mru[tab.windowId] ??= []);
    if (!list.includes(tab.id)) list.push(tab.id);
    await save();
  }),
);

chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) =>
  enqueue(async () => {
    await load();
    if (isWindowClosing) return;
    removeFromMru(windowId, tabId);
    await save();
    if (!cycle || cycle.windowId !== windowId) return;
    if (tabId === cycle.hostTabId) return finish('abandon');
    const i = cycle.list.indexOf(tabId);
    if (i === -1) return;
    cycle.list.splice(i, 1);
    if (i <= cycle.index) cycle.index = Math.max(1, cycle.index - 1);
    if (cycle.list.length < 2) return finish('abandon');
    if (cycle.mode === 'overlay') {
      const items = await overlayItems(cycle);
      await sendToTab(cycle.hostTabId, { type: 'overlay-show', items, index: cycle.index }).catch(
        () => {},
      );
    }
  }),
);

chrome.tabs.onDetached.addListener((tabId, { oldWindowId }) =>
  enqueue(async () => {
    await load();
    removeFromMru(oldWindowId, tabId);
    await save();
  }),
);

chrome.tabs.onAttached.addListener((tabId, { newWindowId }) =>
  enqueue(async () => {
    await load();
    touch(newWindowId, tabId);
    await save();
  }),
);

chrome.windows.onRemoved.addListener((windowId) =>
  enqueue(async () => {
    await load();
    delete mru[windowId];
    if (cycle?.windowId === windowId) cycle = null;
    await save();
  }),
);

chrome.runtime.onStartup.addListener(() => enqueue(load));

chrome.runtime.onInstalled.addListener(() =>
  enqueue(async () => {
    await load();
    // Injeta o content script nas abas que já estavam abertas.
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      chrome.scripting
        .executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] })
        .catch(() => {}); // páginas chrome:// etc. não aceitam
    }
  }),
);
