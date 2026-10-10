// Decide recovery without touching applications. A user quit is always respected.
export function recoveryDecision(previous, observation, graceMs=45000){
  const state={...previous};
  const {running,version,debugReady,watcherAlive,disabled,now}=observation;
  if(running&&observation.pid){
    if(state.lastSeenPid&&state.lastSeenPid!==observation.pid){
      delete state.lastAttemptedVersion;delete state.failure;
      delete state.missingSince;delete state.missingVersion;
    }
    state.lastSeenPid=observation.pid;
  }
  if(disabled||!running){
    delete state.missingSince;delete state.missingVersion;
    // Never reopen a deliberately quit app. A later user launch may try again.
    if(!running){delete state.lastAttemptedVersion;delete state.failure;}
    return {state,action:'idle'};
  }
  if(debugReady){
    state.lastDebugVersion=version;delete state.missingSince;delete state.missingVersion;delete state.failure;
    return {state,action:watcherAlive?'idle':'start-watcher'};
  }
  // Ordinary launches without debugging must not cause surprise restart loops.
  if(!version||!state.lastDebugVersion||version===state.lastDebugVersion)return {state,action:'idle'};
  if(state.lastAttemptedVersion===version)return {state,action:'already-attempted'};
  if(state.missingVersion!==version){state.missingVersion=version;state.missingSince=now;}
  if(now-state.missingSince<graceMs)return {state,action:'wait-for-update'};
  state.lastAttemptedVersion=version;state.lastAttemptedAt=now;
  return {state,action:'restore-update'};
}
