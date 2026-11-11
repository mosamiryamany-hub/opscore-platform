'use strict';
function parseVersion(value){const m=String(value||'').match(/^v?(\d+)\.(\d+)\.(\d+)$/);return m?m.slice(1).map(Number):null;}
function compareVersions(a,b){for(let i=0;i<3;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1;}return 0;}
function parseBoundedEngineRange(range){
 const m=String(range||'').match(/^\s*>=\s*(\d+)\.(\d+)\.(\d+)\s+<\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/);
 if(!m)return null;
 return {minimum:m.slice(1,4).map(Number),maximumExclusive:[Number(m[4]),Number(m[5]||0),Number(m[6]||0)]};
}
function satisfiesNodeMinimum(version,range){const v=parseVersion(version),r=parseBoundedEngineRange(range);return Boolean(v&&r&&compareVersions(v,r.minimum)>=0);}
function satisfiesNodeEngine(version,range){const v=parseVersion(version),r=parseBoundedEngineRange(range);return Boolean(v&&r&&compareVersions(v,r.minimum)>=0&&compareVersions(v,r.maximumExclusive)<0);}
module.exports={compareVersions,parseBoundedEngineRange,parseVersion,satisfiesNodeEngine,satisfiesNodeMinimum};
