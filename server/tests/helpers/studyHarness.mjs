import http from 'node:http';
export async function studyHarness(t,create,options={}) {
  const tables=new Map();let reads=0,writes=0;
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  const get=(row,path)=>path.split('.').reduce((v,k)=>v?.[k],row);
  const matches=(row,q)=>Object.entries(q).every(([k,v])=>v&&typeof v==='object'?get(row,k)>v.$gt:get(row,k)===v);
  const db={collection(name){const rows=table(name);return {
    async findOne(q){reads++;return structuredClone([...rows.values()].find(row=>matches(row,q)));},
    find(q){reads++;return {sort(spec){this.sortKey=Object.keys(spec)[0];return this;},limit(n){this.n=n;return this;},maxTimeMS(){return this;},
      async toArray(){return [...rows.values()].filter(row=>matches(row,q)).sort((a,b)=>String(a[this.sortKey]).localeCompare(String(b[this.sortKey]))).slice(0,this.n).map(r=>structuredClone(r));}};},
    async insertOne(row){if(rows.has(row._id))throw Object.assign(new Error(),{code:11000});writes++;rows.set(row._id,structuredClone(row));},
    async replaceOne(q,row){const old=[...rows.values()].find(r=>matches(r,q));if(!old)return {modifiedCount:0};writes++;rows.set(row._id,structuredClone(row));return {modifiedCount:1};},
    async updateOne(q,update){const old=[...rows.values()].find(r=>matches(r,q));if(!old)return {modifiedCount:0};
      options.beforeUpdate?.(old);for(const [path,value]of Object.entries(update.$set)){const keys=path.split('.');let current=old;for(const k of keys.slice(0,-1))current=current[k]??={};current[keys.at(-1)]=structuredClone(value);}writes++;return {modifiedCount:1};},
  };}};
  const sessions={resolve:async token=>token==='a'.repeat(64)?{uid:'owner',email:'owner@example.invalid'}:token==='b'.repeat(64)?{uid:'other'}:null};
  const server=http.createServer(create(db,sessions,{origin:'https://app.invalid',...options}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {tables,table,reads:()=>reads,writes:()=>writes,async request(method,path,body,identity='a',origin='https://app.invalid'){
    return fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{...(identity?{Cookie:`__Host-noviq_session=${identity.repeat(64)}`} :{}),Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }};
}
