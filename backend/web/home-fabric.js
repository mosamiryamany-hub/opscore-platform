'use strict';
/* Command Fabric home — externalized runtime (CSP script-src 'self'); visual model, clearly labeled. */
(function(){
  const canvas=document.getElementById('radar');
  const ctx=canvas?canvas.getContext('2d'):null;
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=640,H=640,cx=320,cy=320,angle=0,pulses=[];
  function size(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const cssW=canvas.clientWidth||320;
    W=H=cssW;cx=W/2;cy=H/2;
    canvas.width=W*dpr;canvas.height=H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    const g=ctx.createRadialGradient(cx,cy,10,cx,cy,W*0.5);
    g.addColorStop(0,'rgba(109,243,255,0.14)');g.addColorStop(1,'rgba(4,6,14,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,W*0.48,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(109,243,255,0.2)';ctx.lineWidth=1.5;
    for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,i*W*0.105,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='rgba(168,139,255,0.16)';
    ctx.beginPath();ctx.moveTo(cx-W*0.46,cy);ctx.lineTo(cx+W*0.46,cy);ctx.moveTo(cx,cy-W*0.46);ctx.lineTo(cx,cy+W*0.46);ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);
    const grd=ctx.createLinearGradient(0,0,W*0.46,0);
    grd.addColorStop(0,'rgba(109,243,255,0)');grd.addColorStop(1,'rgba(109,243,255,0.5)');
    ctx.fillStyle=grd;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,W*0.46,-0.38,0.04);ctx.closePath();ctx.fill();
    ctx.restore();
    pulses.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.strokeStyle='rgba(125,245,189,'+Math.max(0,1-p.r/46)+')';ctx.lineWidth=1.5;ctx.stroke();p.r+=0.7;});
    pulses=pulses.filter(p=>p.r<46);
    angle+=0.022;
    if(!reduce)requestAnimationFrame(draw);
  }
  if(canvas&&ctx){
    size();window.addEventListener('resize',()=>{size();if(reduce)draw();});draw();
    if(!reduce)setInterval(()=>{const a=Math.random()*Math.PI*2,r=30+Math.random()*W*0.26;
      pulses.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,r:2});},900);
  }
  const t0=performance.now();
  fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(d=>{
    const ms=Math.round(performance.now()-t0),ok=!!d.ok;
    const set=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t;};
    set('livePill',ok?'RUNTIME · LIVE':'RUNTIME · DEGRADED');
    const lp=document.getElementById('livePill');if(lp)lp.className='pill'+(ok?' ok':'');
    set('engPill','ENGINE · '+String(d.engine||'—').toUpperCase());
    set('mStatus',ok?'HEALTHY':'DEGRADED');
    const ms2=document.getElementById('mStatus');if(ms2)ms2.style.color=ok?'#7df5bd':'#ffcf87';
    set('mStatusSub',d.status||'probe');
    set('mEngine',String(d.engine||'—').toUpperCase());
    set('mVer',d.version||'0.11.62');
    set('mLat',ms+'ms');
  }).catch(()=>{const e=document.getElementById('livePill');if(e)e.textContent='RUNTIME · UNREACHABLE';
    const m=document.getElementById('mStatus');if(m)m.textContent='OFFLINE';});
})();
