/* Read only page structure and router paths; never read conversation bodies. */
(() => {
  function isVisible(element) {
    if (!element || element.closest('[hidden],[aria-hidden="true"],[inert],[data-live2d-companion]')) return false;
    if (!element.getClientRects().length) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
  }
  function currentFiber(fiber) {
    if (!fiber) return null;
    let root = fiber;
    while (root.return) root = root.return;
    return root.stateNode?.current && root.stateNode.current !== root ? fiber.alternate : fiber;
  }
  function routerPath(element) {
    // React expandos are available only in the main world. Isolated renderers use the page bridge.
    let fiber = currentFiber(element?.[Object.keys(element || {}).find(key => key.startsWith('__reactFiber$'))]);
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const path = props?.location?.pathname ?? props?.value?.location?.pathname;
      if (typeof path === 'string' && path.startsWith('/')) return path;
    }
    return null;
  }
  function chatRoute(path) {
    if (!path || path === '/index.html' || /\.html$/.test(path)) return null;
    if (/^\/(?:local|remote|thread|c)\/[^/]+\/?$/.test(path)) return true;
    if (/^\/(?:codex|work)\/(?:local|remote|thread|c)\/[^/]+\/?$/.test(path)) return true;
    if (/^\/(?:g|project)\/[^/]+\/c\/[^/]+\/?$/.test(path)) return true;
    if (['/', '/work', '/codex', '/chat', '/new-thread', '/codex/new-thread', '/work/new-thread'].includes(path)) return null;
    return false;
  }
  function decide({chat, sidebarOpen, settingsOpen, modalOpen}, chatOnly) {
    const reason = modalOpen ? 'dialog' : chatOnly ? settingsOpen ? 'settings' : sidebarOpen ? 'sidebar' : !chat ? 'non-chat' : null : null;
    return {hidden: reason !== null, reason};
  }
  function read(doc = document, path) {
    const visibleAll = selector => Array.from(doc.querySelectorAll(selector)).filter(isVisible);
    const mains = visibleAll('main,[data-app-shell-main-surface]');
    const main = mains.find(element => element.matches('[data-app-shell-main-surface]')) || mains.at(-1);
    path ??= routerPath(main) ?? doc.defaultView.location.pathname;
    const route = chatRoute(path);
    const chatMarkers = '[data-thread-find-target="conversation"],[data-chatgpt-selection-conversation-id],[data-local-conversation-final-assistant],[data-composer-body],[contenteditable="true"][role="textbox"],#prompt-textarea';
    const chat = route ?? !!Array.from((main || doc).querySelectorAll(chatMarkers)).find(isVisible);
    // A docked conversation list is part of the chat layout, not a blocking overlay.
    // Only the responsive sidebar and temporary docking peeks hide the companion.
    const responsive = visibleAll('[data-app-shell-responsive-sidebar="true"]').length > 0;
    const triggers = visibleAll('[aria-controls="app-shell-sidebar"][aria-expanded]');
    const expanded = triggers.length ? triggers.some(element => element.getAttribute('aria-expanded') === 'true') : visibleAll('#app-shell-sidebar,[data-sidebar="sidebar"]').some(element => element.getAttribute('data-state') !== 'collapsed');
    const sidebarOpen = responsive && expanded;
    const peeking = visibleAll('[data-slate-sidebar-peeking="true"],[data-app-shell-docking-peek="true"]').length > 0;
    const settingsOpen = /(?:^|\/)settings(?:\/|$)/.test(path) || visibleAll('[data-testid="settings-dialog"],[data-testid="settings-page"]').length > 0;
    const modalOpen = visibleAll('[role="dialog"][aria-modal="true"],dialog[open]').length > 0;
    return {chat: !!chat, sidebarOpen: sidebarOpen || peeking, settingsOpen, modalOpen};
  }
  globalThis.Live2DView = {read, decide, chatRoute, isVisible};
})();
