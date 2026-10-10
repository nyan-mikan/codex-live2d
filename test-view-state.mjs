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
