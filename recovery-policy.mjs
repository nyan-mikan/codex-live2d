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
    state.lastDebugVersion=version;delete state.missingSince;delete state.missingVersion;
    const healthy=watcherAlive&&observation.modelHealthy!==false;
    if(healthy){delete state.failure;delete state.modelMissingSince;delete state.nextRepairAt;delete state.repairAttempts;return {state,action:'idle'};}
    if(watcherAlive&&observation.modelLoading){state.modelMissingSince=now;return {state,action:'wait-for-model'};}
    state.modelMissingSince??=now;
    if(now-state.modelMissingSince<graceMs)return {state,action:'wait-for-model'};
    if(now<(state.nextRepairAt||0))return {state,action:'wait-for-retry'};
    state.repairAttempts=(state.repairAttempts||0)+1;
    state.nextRepairAt=now+Math.min(60000,5000*2**Math.min(state.repairAttempts-1,4));
    return {state,action:watcherAlive?'repair-watcher':'start-watcher'};
  }
  // A successful previous activation opts into recovery for Dock launches as well as updates.
  // The disabled flag, grace period and per-run attempt guard also apply to ordinary starts.
  if(!version||!state.lastDebugVersion)return {state,action:'idle'};
  const updated=version!==state.lastDebugVersion;
  if(state.lastAttemptedVersion===version)return {state,action:'already-attempted'};
  if(state.missingVersion!==version){state.missingVersion=version;state.missingSince=now;}
  if(now-state.missingSince<graceMs)return {state,action:updated?'wait-for-update':'wait-for-startup'};
  state.lastAttemptedVersion=version;state.lastAttemptedAt=now;
  return {state,action:updated?'restore-update':'restore-startup'};
}
