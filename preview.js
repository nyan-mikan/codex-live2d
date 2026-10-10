(async()=>{
  const report=document.querySelector('#report');
  const send=async value=>{report.textContent=JSON.stringify(value,null,2);await fetch('/report',{method:'POST',body:JSON.stringify(value)});};
  try{
    await mountCompanion(await(await fetch('/assets.json')).json());
    await new Promise(r=>setTimeout(r,2500));
    await send({phase:'loaded',health:__codexCompanion.health(),pixels:__codexCompanion.pixels()});
    const played=await __codexCompanion.motion();
    await new Promise(r=>setTimeout(r,1500));
    await send({phase:'motion',played,health:__codexCompanion.health(),pixels:__codexCompanion.pixels()});
    document.getElementById('codex-live2d-companion').addEventListener('click',()=>setTimeout(()=>send({phase:'interaction',health:__codexCompanion.health(),pixels:__codexCompanion.pixels()}),300));
  }catch(error){await send({phase:'error',error:String(error.stack||error)});}
})();
