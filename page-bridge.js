/* Main-world page metadata for the isolated companion. No answer content crosses this bridge. */
(() => {
  globalThis.__codexCompanionPageBridge?.stop();
  let stopped = false, last = '', scheduled = null;
  function scan(force = false) {
    if (stopped) return;
    const detail = JSON.stringify(Live2DView.read());
    if (force || detail !== last) {
      last = detail;
      document.dispatchEvent(new CustomEvent('codex-live2d-page-state', {detail}));
    }
  }
  function control(event) {
    if (event.detail === 'stop') stop();
    if (event.detail === 'refresh') scan(true);
  }
  function stop() {
    if (stopped) return;
    stopped = true; clearInterval(interval);observer.disconnect();
    if(scheduled!==null)cancelAnimationFrame(scheduled);
    document.removeEventListener('codex-live2d-page-control', control);
    window.removeEventListener('popstate', refresh);
    window.removeEventListener('hashchange', refresh);
  }
  const refresh = () => scan(true);
  const interval = setInterval(scan, 250);
  const observer=new MutationObserver(records=>{
    if(records.every(record=>record.target.nodeType===1&&record.target.closest('[data-live2d-companion]')))return;
    if(scheduled===null)scheduled=requestAnimationFrame(()=>{scheduled=null;scan();});
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','aria-expanded','aria-modal','open','inert','class','style','data-state','data-slate-sidebar-peeking','data-app-shell-responsive-sidebar','data-app-shell-docking-peek']});
  document.addEventListener('codex-live2d-page-control', control);
  window.addEventListener('popstate', refresh);
  window.addEventListener('hashchange', refresh);
  globalThis.__codexCompanionPageBridge = {stop, refresh, health: () => ({version: 1, stopped})};
  scan(true);
})();
