'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateOsrmBaseUrl,assertOsrmHostResolvesSafely}=require('../src/firewall');

function withEnv(values,fn){
  const previous=new Map();
  for(const [key,value] of Object.entries(values)){
    previous.set(key,Object.prototype.hasOwnProperty.call(process.env,key)?process.env[key]:undefined);
    if(value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
  let restored=false;
  const restore=()=>{
    if(restored)return;
    restored=true;
    for(const [key,value] of previous){
      if(value===undefined) delete process.env[key];
      else process.env[key]=value;
    }
  };
  try{
    const result=fn();
    if(result && typeof result.then==='function') return result.finally(restore);
    restore();
    return result;
  }catch(error){
    restore();
    throw error;
  }
}

test('production OSRM rejects cleartext HTTP before host checks or network access',()=>{
  withEnv({OSRM_ALLOWED_HOSTS:'router.example.test'},()=>{
    assert.throws(()=>validateOsrmBaseUrl('http://router.example.test',{production:true}),/OSRM_HTTPS_REQUIRED/);
  });
});

test('production OSRM accepts HTTPS only for an explicitly allowlisted host',()=>{
  withEnv({OSRM_ALLOWED_HOSTS:'router.example.test'},()=>{
    const url=validateOsrmBaseUrl('https://router.example.test',{production:true});
    assert.equal(url.protocol,'https:');
    assert.equal(url.hostname,'router.example.test');
  });
});

test('production OSRM rejects HTTPS hosts that are not on the allowlist',()=>{
  withEnv({OSRM_ALLOWED_HOSTS:'router.example.test'},()=>{
    assert.throws(()=>validateOsrmBaseUrl('https://other.example.test',{production:true}),/OSRM_HOST_NOT_ALLOWLISTED/);
  });
});

test('non-production OSRM retains explicit HTTP compatibility',()=>{
  withEnv({OSRM_ALLOWED_HOSTS:undefined},()=>{
    const url=validateOsrmBaseUrl('http://127.0.0.1:5000',{production:false});
    assert.equal(url.protocol,'http:');
  });
});

test('Vercel Production target rejects HTTP even when NODE_ENV is not production',async()=>{
  await withEnv({NODE_ENV:'test',VERCEL_ENV:'production',OSRM_ALLOWED_HOSTS:'router.example.test'},async()=>{
    await assert.rejects(assertOsrmHostResolvesSafely('http://router.example.test'),/OSRM_HTTPS_REQUIRED/);
  });
});
