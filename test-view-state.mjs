import test from 'node:test';
import assert from 'node:assert/strict';
import './view-state.js';
const {chatRoute,decide,isVisible}=Live2DView;
const chat={chat:true,sidebarOpen:false,settingsOpen:false,modalOpen:false};
test('Chat-only mode hides for sidebars, settings and non-chat pages and restores on return',()=>{
  assert.deepEqual(decide(chat,true),{hidden:false,reason:null});
  for(const [field,reason] of [['sidebarOpen','sidebar'],['settingsOpen','settings'],['modalOpen','dialog']]){
    assert.deepEqual(decide({...chat,[field]:true},true),{hidden:true,reason});
    assert.equal(decide(chat,true).hidden,false);
  }
  assert.deepEqual(decide({...chat,chat:false},true),{hidden:true,reason:'non-chat'});
});
test('Turning the preference off restores normal pages but preserves existing modal hiding',()=>{
  for(const view of [{...chat,chat:false},{...chat,sidebarOpen:true},{...chat,settingsOpen:true}])assert.equal(decide(view,false).hidden,false);
  assert.deepEqual(decide({...chat,modalOpen:true},false),{hidden:true,reason:'dialog'});
});
test('Codex, Work, Chat and new-chat routes are classified without treating utility pages as chats',()=>{
  for(const route of ['/local/test','/remote/test','/thread/test','/c/test','/codex/thread/test','/work/thread/test','/g/test/c/test'])assert.equal(chatRoute(route),true,route);
  for(const route of ['/settings','/settings/personalization','/plugins','/projects','/library','/space/test','/browser-use/history','/automations','/unknown'])assert.equal(chatRoute(route),false,route);
  for(const route of ['/','/work','/new-thread','/codex/new-thread','/index.html','/visibility-preview.html'])assert.equal(chatRoute(route),null,route);
});
test('Pre-mounted invisible dialogs, offscreen hidden controls and the companion itself do not qualify',()=>{
  const element=({hidden=false,rects=1,visibility='visible',display='block'}={})=>({closest:()=>hidden?{}:null,getClientRects:()=>Array(rects),ownerDocument:{defaultView:{getComputedStyle:()=>({visibility,display})}}});
  assert.equal(isVisible(element()),true);
  for(const options of [{hidden:true},{rects:0},{visibility:'hidden'},{visibility:'collapse'},{display:'none'}])assert.equal(isVisible(element(options)),false);
});

// Model the desktop's visible layout, including an expanded navigation toggle.
function desktopView({responsive=false,expanded=true,peek=false,sidebarVisible=true}={}){
  const doc={defaultView:{location:{pathname:'/index.html'},getComputedStyle:()=>({display:'block',visibility:'visible'})}};
  const element=(attrs={})=>({ownerDocument:doc,closest:()=>null,getClientRects:()=>[{}],getAttribute:key=>attrs[key]??null,matches:selector=>selector==='[data-app-shell-main-surface]',querySelectorAll:()=>[]});
  const main=element();main.__reactFiber$fixture={memoizedProps:{value:{location:{pathname:'/local/current-chat'}}},return:null};
  const trigger=element({'aria-expanded':String(expanded)}),sidebar=element(),shell=element();
  doc.querySelectorAll=selector=>{
    if(selector==='main,[data-app-shell-main-surface]')return [main];
    if(selector==='[data-app-shell-responsive-sidebar="true"]')return responsive?[shell]:[];
    if(selector==='[aria-controls="app-shell-sidebar"][aria-expanded]')return [trigger];
    if(selector==='#app-shell-sidebar,[data-sidebar="sidebar"]')return sidebarVisible?[sidebar]:[];
    if(selector==='[data-slate-sidebar-peeking="true"],[data-app-shell-docking-peek="true"]')return peek?[shell]:[];
    return [];
  };
  return Live2DView.read(doc);
}
test('An expanded docked chat list must not hide a real chat',()=>{
  const view=desktopView();
  assert.equal(view.chat,true);
  assert.equal(view.sidebarOpen,false);
  assert.deepEqual(decide(view,true),{hidden:false,reason:null});
});
test('Responsive sidebar overlays hide, then restore when closed or docked',()=>{
  assert.deepEqual(decide(desktopView({responsive:true}),true),{hidden:true,reason:'sidebar'});
  assert.equal(decide(desktopView({responsive:true,expanded:false,sidebarVisible:false}),true).hidden,false);
  assert.equal(decide(desktopView({responsive:false}),true).hidden,false);
});
test('Temporary docking peeks hide without requiring a responsive layout',()=>{
  assert.deepEqual(decide(desktopView({peek:true,expanded:false}),true),{hidden:true,reason:'sidebar'});
  assert.equal(decide(desktopView({peek:false,expanded:false}),true).hidden,false);
});
