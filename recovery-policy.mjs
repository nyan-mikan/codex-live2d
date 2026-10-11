// Decide recovery without touching applications. A user quit is always respected.
export function recoveryDecision(previous, observation, graceMs=10000){
  const state={...previous};
  const {running,version,debugReady,watcherAlive,disabled,now}=observation;
  if(running&&observation.pid){
    if(state.lastSeenPid&&state.lastSeenPid!==observation.pid){
      delete state.lastAttemptedVersion;delete state.failure;
      delete state.missingSince;delete state.missingVersion;delete state.modelMissingSince;delete state.nextRepairAt;delete state.repairAttempts;
    }
    state.lastSeenPid=observation.pid;
  }
  if(disabled||!running){
    delete state.missingSince;delete state.missingVersion;delete state.modelMissingSince;delete state.nextRepairAt;delete state.repairAttempts;
    // Never reopen a deliberately quit app. A later user launch may try again.
    if(!running){delete state.lastAttemptedVersion;delete state.failure;}
    return {state,action:'idle'};
  }
  if(debugReady){
    state.lastDebugVersion=version;delete state.missingSince;delete state.missingVersion;delete state.lastAttemptedVersion;
    const healthy=watcherAlive&&observation.modelHealthy!==false;
    if(healthy){delete state.failure;delete state.modelMissingSince;delete state.nextRepairAt;delete state.repairAttempts;return {state,action:'idle'};}
    if(observation.launcherBusy)return {state,action:'wait-for-model'};
    if(watcherAlive&&observation.modelLoading){state.modelMissingSince=now;return {state,action:'wait-for-model'};}
    state.modelMissingSince??=now;
    if(now-state.modelMissingSince<graceMs)return {state,action:'wait-for-model'};
    if(now<(state.nextRepairAt||0))return {state,action:'wait-for-retry'};
    state.repairAttempts=(state.repairAttempts||0)+1;
    state.nextRepairAt=now+Math.min(60000,5000*2**Math.min(state.repairAttempts-1,4));
    return {state,action:watcherAlive?'repair-watcher':'start-watcher'};
  }
  // Ordinary Dock/Finder launches need a single normal restart with connection flags.
  // Never interrupt a prepared app that is still opening its renderer or a live launcher.
  if(observation.launcherBusy)return {state,action:'wait-for-launcher'};
  if(observation.debugDeclared){delete state.missingSince;delete state.missingVersion;return {state,action:'wait-for-endpoint'};}
  if(state.lastAttemptedVersion===version)return {state,action:'already-attempted'};
  if(state.missingVersion!==version){state.missingVersion=version;state.missingSince=now;}
  state.missingSince??=now;
  if(now-state.missingSince<graceMs)return {state,action:'wait-for-startup'};
  state.lastAttemptedVersion=version;
  return {state,action:'restart-app'};
}
