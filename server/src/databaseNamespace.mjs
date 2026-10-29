// Preview traffic gets separate application collections inside the owner's
// existing authorized database. Native migration archives remain untouched.
export function databaseNamespace(db,prefix=''){
  if(prefix!==''&&!/^[a-z][a-z0-9_]{0,30}_$/.test(prefix))throw new Error('Invalid application collection prefix.');
  if(!prefix)return db;
  return new Proxy(db,{get(target,key){
    if(key==='collection')return name=>target.collection(`${prefix}${name}`);
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
}
