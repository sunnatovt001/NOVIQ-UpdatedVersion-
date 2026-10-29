import {fieldAt} from '../../../shared/mongoValues.mjs';
const compare=(a,b)=>typeof a==='object'||typeof b==='object'?JSON.stringify(a).localeCompare(JSON.stringify(b)):a<b?-1:a>b?1:0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function canonicalMemory(){
  let tables=new Map(),tail=Promise.resolve();
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  function matches(row,query){return Object.entries(query).every(([key,condition])=>{
    if(key==='$and')return condition.every(q=>matches(row,q));if(key==='$or')return condition.some(q=>matches(row,q));
    const value=fieldAt(row,key);
    if(condition&&typeof condition==='object'&&!Array.isArray(condition)&&Object.keys(condition).some(k=>k.startsWith('$')))
      return Object.entries(condition).every(([op,target])=>op==='$eq'?same(value,target)||Array.isArray(value)&&value.some(v=>same(v,target)):
        op==='$ne'?!same(value,target):op==='$in'?target.some(t=>same(value,t)||Array.isArray(value)&&value.some(v=>same(v,t))):
          op==='$exists'?(value!==undefined)===target:op==='$gt'?compare(value,target)>0:op==='$gte'?compare(value,target)>=0:op==='$lt'?compare(value,target)<0:op==='$lte'?compare(value,target)<=0:false);
    return same(value,condition);
  });}
  function find(name,query){let orders={},limit=Infinity;return {
    sort(spec){orders=spec;return this;},limit(n){limit=n;return this;},maxTimeMS(){return this;},
    async toArray(){return [...table(name).values()].filter(row=>matches(row,query)).sort((a,b)=>{for(const [key,direction]of Object.entries(orders)){const result=compare(fieldAt(a,key),fieldAt(b,key));if(result)return result*direction;}return 0;}).slice(0,limit).map(row=>structuredClone(row));},
    async *[Symbol.asyncIterator](){yield* await this.toArray();},
  };}
  const db={collection(name){return {
    find(query={}){return find(name,query);},async findOne(query){return structuredClone([...table(name).values()].find(row=>matches(row,query)));},
    async insertOne(row){if(table(name).has(row._id))throw Object.assign(new Error('duplicate'),{code:11000});table(name).set(row._id,structuredClone(row));return {insertedId:row._id};},
    async replaceOne(query,row){const old=[...table(name).values()].find(row=>matches(row,query));if(!old)return {matchedCount:0,modifiedCount:0};table(name).set(row._id,structuredClone(row));return {matchedCount:1,modifiedCount:1};},
    async updateOne(query,patch,options={}){let row=[...table(name).values()].find(row=>matches(row,query));if(!row){if(!options.upsert)return {matchedCount:0,modifiedCount:0};row={...query,...patch.$setOnInsert};table(name).set(row._id,row);}Object.assign(row,patch.$set||{});for(const [key,value]of Object.entries(patch.$inc||{}))row[key]=(row[key]||0)+value;return {matchedCount:1,modifiedCount:1};},
    async countDocuments(query={}){return [...table(name).values()].filter(row=>matches(row,query)).length;},
  };}};
  const transaction=work=>{
    const run=tail.then(async()=>{const before=structuredClone(tables);try{return await work({});}catch(error){tables=before;throw error;}});
    tail=run.catch(()=>{});return run;
  };
  return {db,table,transaction};
}
