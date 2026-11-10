const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const inventory=JSON.parse(fs.readFileSync(path.join(root,'docs','API_INVENTORY.json'),'utf8'));
const openapi=JSON.parse(fs.readFileSync(path.join(root,'docs','openapi.json'),'utf8'));
openapi.info.version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
openapi.paths=openapi.paths||{};
const supportedMethods=new Set(['get','post','put','patch','delete','head','options','trace']);
const inventoryOperations=new Set(inventory.routes.map(entry=>`${entry.method.toLowerCase()} ${entry.route}`));
let removed=0;
// Remove stale source-derived methods left behind when the route inventory becomes more precise.
for(const [route,operations] of Object.entries(openapi.paths)){
  for(const [method,operation] of Object.entries(operations||{})){
    if(supportedMethods.has(method)&&operation&&operation['x-opscore-source']&&!inventoryOperations.has(`${method} ${route}`)){
      delete operations[method];removed++;
    }
  }
  if(!Object.keys(operations||{}).some(method=>supportedMethods.has(method))) delete openapi.paths[route];
}
function fallbackOperation(route,entry){
  const method=entry.method.toLowerCase();
  const op={summary:`Source-derived route: ${entry.method} ${route}`,responses:{'200':{description:'Successful response'},'400':{description:'Invalid request'},'401':{description:'Unauthenticated'},'403':{description:'Forbidden'},'404':{description:'Not found'},'409':{description:'Conflict'},'422':{description:'Validation failure'}}};
  if(entry.auth==='required') op.security=[{bearerAuth:[]}];
  op['x-opscore-source']=`src/server.js:${entry.sourceLine}`;
  op['x-opscore-schema-note']='Request/response schemas are omitted here when they are not statically derived from the server branch. No payload shape is inferred.';
  return op;
}
let added=0;
for(const entry of inventory.routes){
  const route=entry.route;
  const method=entry.method.toLowerCase();
  if(!openapi.paths[route]) openapi.paths[route]={};
  if(!openapi.paths[route][method]){openapi.paths[route][method]=fallbackOperation(route,entry);added++;}
}
fs.writeFileSync(path.join(root,'docs','openapi.json'),JSON.stringify(openapi,null,2)+'\n');
console.log(JSON.stringify({added,removed,totalPaths:Object.keys(openapi.paths).length,version:openapi.info.version},null,2));
