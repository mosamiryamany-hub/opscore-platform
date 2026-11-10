const os=require('node:os');const path=require('node:path');
function tmpDbPath(name){return path.join(os.tmpdir(),`opscore-${name}-${process.pid}-${Date.now()}.db`)}
function cleanup(fs,p){for(const x of [p,p+'-wal',p+'-shm']){try{fs.rmSync(x,{force:true})}catch{}}}
module.exports={tmpDbPath,cleanup};
