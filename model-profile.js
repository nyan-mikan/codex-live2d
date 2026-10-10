/* Model-independent parameter configuration; supplied locally by each user. */
(() => {
  function parameterMap(value={}){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Profile parameters must be an object.');
    const entries=Object.entries(value);
    if(entries.length>200)throw new Error('Too many profile parameters.');
    for(const [id,n] of entries)if(!/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(id)||typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000)throw new Error('Invalid profile parameter.');
    return Object.fromEntries(entries);
  }
  function readProfile(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Model profile must be an object.');
    const neutral=parameterMap(input.neutral),speechNeutral=parameterMap(input.speechNeutral??{PARAM_EYE_L_SMILE:0,PARAM_EYE_R_SMILE:0,PARAM_MOUTH_FORM_Y:0});
    const entries=Object.entries(input.expressions??{});
    if(entries.length>30)throw new Error('Too many profile expressions.');
    const expressions=Object.fromEntries(entries.map(([name,value])=>{
      if(!/^[a-z][a-z0-9_-]{0,31}$/i.test(name)||name==='neutral'||!value||typeof value!=='object')throw new Error('Invalid profile expression.');
      const label=typeof value.label==='string'?value.label.slice(0,80):name;
      return [name,{label,parameters:parameterMap(value.parameters)}];
    }));
    const mouthParameter=input.mouthParameter??'PARAM_MOUTH_OPEN_Y';parameterMap({[mouthParameter]:0});
    const group=key=>{const value=input[key]??(key==='idleMotionGroup'?'idle':'tap');if(typeof value!=='string'||!value||value.length>80)throw new Error('Invalid motion group.');return value;};
    return {neutral,speechNeutral,expressions,mouthParameter,idleMotionGroup:group('idleMotionGroup'),clickMotionGroup:group('clickMotionGroup')};
  }
  globalThis.Live2DProfile={readProfile};
})();
