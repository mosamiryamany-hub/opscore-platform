const fs = require('node:fs');
const path = require('node:path');
// Source-derived route inventory. It intentionally does not invent payload schemas.
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
const lines = src.split(/\n/);
const EXACT = /if\s*\(\s*req\.method\s*===\s*'(GET|POST|PUT|PATCH|DELETE)'\s*&&\s*url\.pathname\s*===\s*'([^']+)'\s*\)/;
const MATCH = /const\s+(\w+)\s*=\s*url\.pathname\.match\(\/\^(.+?)\$\/\);/;
const METHOD = /req\.method\s*===\s*'(GET|POST|PUT|PATCH|DELETE)'/g;
const SCOPE = /requireScope\s*\(\s*c\s*,\s*'(admin|write|read)'\s*\)/g;
const routes = [];
function classifyAuth(route) {
  if (route === '/api/health' || route === '/api/openapi.json' ||
      route === '/api/verify/database' ||
      route === '/api/verify/database-security' ||
      route === '/api/verify/deployment') return 'public';
  if (route.startsWith('/api/v1/auth/') || route === '/api/v1/portal/overview' || route.startsWith('/api/v1/portal/')) return 'public/scoped';
  return 'required';
}
function normalizeRegex(raw) {
  let r = raw.replaceAll('\\/', '/').replaceAll('\\.', '.');
  r = r.replace(/\(\[\^\/\]\+\)/g, '{id}');
  r = r.replace(/\(\d\+\)/g, '{index}');
  r = r.replace(/\([^()]+\|[^()]+\)/g, '{param}');
  return '/' + r.replace(/^\//, '');
}
function isRouteSelector(line) {
  return EXACT.test(line) || /^\s*const\s+\w+\s*=\s*url\.pathname\.match\(/.test(line);
}
function nextRouteMatchIndex(start) {
  for (let j=start+1;j<lines.length;j++) if (isRouteSelector(lines[j])) return j;
  return lines.length;
}
function blockFrom(start) {
  return lines.slice(start,nextRouteMatchIndex(start)).join(' ');
}
for (let i=0;i<lines.length;i++) {
  const line=lines[i];
  const exact=line.match(EXACT);
  if (exact) {
    const method=exact[1], route=exact[2], block=blockFrom(i,12);
    const scopes=[...block.matchAll(SCOPE)].map(x=>x[1]);
    routes.push({method,route,auth:classifyAuth(route),scope:scopes[0]||null,sourceLine:i+1});
    continue;
  }
  const match=line.match(MATCH);
  if (!match) continue;
  const block=blockFrom(i,30);
  const methods=[...block.matchAll(METHOD)].map(x=>x[1]);
  const scopes=[...block.matchAll(SCOPE)].map(x=>x[1]);
  for (const method of [...new Set(methods)]) {
    routes.push({method,route:normalizeRegex(match[2]),auth:classifyAuth(normalizeRegex(match[2])),scope:scopes[0]||null,sourceLine:i+1,patternVariable:match[1]});
  }
}
const seen=new Set();
const unique=routes.filter(r=>{const k=`${r.method} ${r.route}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.route.localeCompare(b.route)||a.method.localeCompare(b.method));
const outputPath = process.env.OPSC_API_INVENTORY_PATH ? path.resolve(process.env.OPSC_API_INVENTORY_PATH) : path.join(root,'docs','API_INVENTORY.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath,JSON.stringify({routeCount:unique.length,routePatternInventory:'source-derived.v3',routes:unique},null,2)+'\n');
console.log(JSON.stringify({routeCount:unique.length,path:path.relative(root,outputPath) || outputPath},null,2));
