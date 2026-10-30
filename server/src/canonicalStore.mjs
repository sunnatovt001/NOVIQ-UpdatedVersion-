import { randomBytes } from 'node:crypto';
import {documentOrderKeys,orderField,scalarOrderKey} from './documentOrder.mjs';
import { pack,revive,Timestamp,FieldValue,validPath,validField,fieldAt,equal,applyDocumentWrite } from '../../shared/mongoValues.mjs';
export {Timestamp,FieldValue};
const fail=(code,message='Database request rejected.')=>Object.assign(new Error(message),{code});
const newId=()=>randomBytes(15).toString('base64url');
// Firestore sorts timestamps before strings, whereas their lossless MongoDB
// representation is an object. Compare the original value types, including
// mixed legacy fields, before applying cursors and limits.
export function compareDocumentValues(a,b){
  const rank=v=>v===null?0:typeof v==='boolean'?1:typeof v==='number'?2:v?.__noviqTimestamp===true?3:typeof v==='string'?4:Array.isArray(v)?8:9;
  const ra=rank(a),rb=rank(b);if(ra!==rb)return ra-rb;
  if(ra===0)return 0;
  if(ra===3)return a.seconds-b.seconds||a.nanoseconds-b.nanoseconds;
  if(ra===4)return Buffer.compare(Buffer.from(a),Buffer.from(b));
  if(ra===8){for(let i=0;i<Math.min(a.length,b.length);i++){const result=compareDocumentValues(a[i],b[i]);if(result)return result;}return a.length-b.length;}
  if(ra===9){const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();for(let i=0;i<Math.min(ak.length,bk.length);i++){const result=compareDocumentValues(ak[i],bk[i])||compareDocumentValues(a[ak[i]],b[bk[i]]);if(result)return result;}return ak.length-bk.length;}
  return a<b?-1:a>b?1:0;
}
export const AggregateField={sum:field=>({operation:'sum',field}),count:()=>({operation:'count'})};
function pathOf(path,document){if(!validPath(path)||(path.split('/').length%2===0)!==document)throw fail('invalid-argument');return path;}
function predicate(condition,parent){
  if(condition.kind==='or'||condition.kind==='and'){
    if(!Array.isArray(condition.conditions)||!condition.conditions.length||condition.conditions.length>10)throw fail('invalid-argument');
    return {[condition.kind==='or'?'$or':'$and']:condition.conditions.map(c=>predicate(c,parent))};
  }
  if(condition.kind!=='where'||!validField(condition.field))throw fail('invalid-argument');
  const field=condition.field==='__name__'?'_id':`data.${condition.field}`;
  const value=condition.field==='__name__'&&typeof condition.value==='string'&&!condition.value.includes('/')?`${parent}/${condition.value}`:pack(condition.value);
  const operators={'==':'$eq','!=':'$ne','<':'$lt','<=':'$lte','>':'$gt','>=':'$gte','in':'$in','not-in':'$nin','array-contains':'$eq','array-contains-any':'$in'};
  const op=operators[condition.op];if(!op)throw fail('invalid-argument');
  if(['in','not-in','array-contains-any'].includes(condition.op)&&(!Array.isArray(value)||value.length<1||value.length>30))throw fail('invalid-argument');
  return {[field]:{[op]:value,...(['!=','not-in'].includes(condition.op)?{$exists:true}:{})}};
}
export function mongoQuery(spec){
  if(!spec||typeof spec!=='object')throw fail('invalid-argument');
  if(spec.group){if(!/^[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(spec.group))throw fail('invalid-argument');}
  else pathOf(spec.path,false);
  if(!Array.isArray(spec.filters||[])||(spec.filters||[]).length>16||!Array.isArray(spec.orders||[])||(spec.orders||[]).length>4)throw fail('invalid-argument');
  const clauses=[{deleted:false},spec.group?{collectionGroup:spec.group}:{parent:spec.path},...(spec.filters||[]).map(c=>predicate(c,spec.path))];
  const orders=(spec.orders?.length?spec.orders:[{field:'__name__',direction:'asc'}]).map(order=>{
    if(!validField(order.field)||!['asc','desc'].includes(order.direction))throw fail('invalid-argument');
    return {field:order.field==='__name__'?'_id':`data.${order.field}`,direction:order.direction==='desc'?-1:1};
  });
  if(!orders.some(o=>o.field==='_id'))orders.push({field:'_id',direction:orders.at(-1).direction});
  // Firestore orderBy excludes documents without the ordered field.
  clauses.push(...orders.filter(o=>o.field!=='_id').map(o=>({[o.field]:{$exists:true}})));
  if(spec.after!==undefined){
    const after=Array.isArray(spec.after)?spec.after:[spec.after];
    if(!after.length||after.length>orders.length)throw fail('invalid-argument');
    const values=after.map((v,i)=>orders[i].field==='_id'&&typeof v==='string'&&!v.includes('/')?`${spec.path}/${v}`:pack(v));
    clauses.push({$or:values.map((v,index)=>({$and:[...values.slice(0,index).map((p,i)=>({[orders[i].field]:{$eq:p}})),
      {[orders[index].field]:{[orders[index].direction===1?'$gt':'$lt']:v}}]}))});
  }
  if(spec.limit!==undefined&&(!Number.isInteger(spec.limit)||spec.limit<1||spec.limit>1000))throw fail('invalid-argument');
  return {filter:{$and:clauses},sort:Object.fromEntries(orders.map(o=>[o.field,o.direction])),orders};
}
export function createCanonicalStore({getDatabase,transaction,enqueueBackup}){
  const documents=async()=> (await getDatabase()).collection('mongo_documents');
  let adapter;
  const snapshot=row=>{
    const ref=adapter.doc(row._id),data=row.deleted?undefined:revive(row.data);
    return {id:ref.id,ref,exists:!row.deleted,version:row.version,data:()=>data,get:field=>fieldAt(data,field),
      _row:row};
  };
  const missing=path=>snapshot({_id:path,version:null,deleted:true});
  function transactionFence(db,session){
    const locked=new Set();
    return async key=>{
      if(locked.has(key))return;
      // Mongo snapshot isolation alone permits write skew on read-only role or
      // membership documents. A shared fence makes those reads conflict with
      // concurrent canonical writes, matching Firestore transaction semantics.
      await db.collection('mongo_document_fences').updateOne({_id:key},{$inc:{serial:1}},{upsert:true,session});
      locked.add(key);
    };
  }
  async function read(ref,session){
    const row=await (await documents()).findOne({_id:ref.path},{session,maxTimeMS:10000});
    return row?snapshot(row):missing(ref.path);
  }
  async function query(spec,session){
    mongoQuery(spec); // Validate cursor as well as the filter before any I/O.
    const {filter,orders}=mongoQuery({...spec,after:undefined});
    const records=await documents();
    const cursor=spec.after===undefined?null:(Array.isArray(spec.after)?spec.after:[spec.after]).map((v,i)=>orders[i].field==='_id'&&typeof v==='string'&&!v.includes('/')?`${spec.path}/${v}`:pack(v));
    const normalizedOrders=orders.map(o=>({...o,field:o.field==='_id'?'_id':orderField(o.field.slice(5))}));
    const keyValues=cursor?.map((v,i)=>orders[i].field==='_id'?v:scalarOrderKey(v));
    const custom=orders.filter(o=>o.field!=='_id');
    // Old/complex records retain exact comparison through a bounded-memory
    // streaming compatibility path. Normal scalar pages sort/limit in MongoDB.
    const missingKeys=custom.map(o=>({[orderField(o.field.slice(5))]:{$exists:false}}));
    const legacy=missingKeys.length&&await records.findOne({$and:[filter,{$or:missingKeys}]},{session,maxTimeMS:10000});
    if(!legacy&&(!keyValues||keyValues.every(v=>v!==null))){
      const clauses=[filter];
      if(keyValues)clauses.push({$or:keyValues.map((v,index)=>({$and:[...keyValues.slice(0,index).map((p,i)=>({[normalizedOrders[i].field]:{$eq:p}})),
        {[normalizedOrders[index].field]:{[normalizedOrders[index].direction===1?'$gt':'$lt']:v}}]}))});
      const rows=await records.find({$and:clauses},{session,collation:{locale:'simple'}})
        .sort(Object.fromEntries(normalizedOrders.map(o=>[o.field,o.direction])))
        .limit(spec.limit||10001).maxTimeMS(10000).toArray();
      if(!spec.limit&&rows.length>10000)throw fail('resource-exhausted','Add a cursor and limit for large collections.');
      const docs=rows.map(snapshot);
      return {docs,size:docs.length,empty:docs.length===0,forEach:callback=>docs.forEach(callback)};
    }
    const value=(row,order)=>order.field==='_id'?row._id:fieldAt(row,order.field);
    const compare=(a,b)=>{for(const order of orders){const result=compareDocumentValues(value(a,order),value(b,order));if(result)return result*order.direction;}return 0;};
    const selected=[],budget=spec.limit||10000;
    for await(const row of records.find(filter,{session}).maxTimeMS(10000)){
      if(cursor){let after=false;for(let i=0;i<cursor.length;i++){const result=compareDocumentValues(value(row,orders[i]),cursor[i])*orders[i].direction;if(result){after=result>0;break;}}if(!after)continue;}
      let low=0,high=selected.length;
      while(low<high){const mid=(low+high)>>>1;if(compare(selected[mid],row)<0)low=mid+1;else high=mid;}
      if(low<budget)selected.splice(low,0,row);
      if(selected.length>budget){if(!spec.limit)throw fail('resource-exhausted','Add a cursor and limit for large collections.');selected.pop();}
      // A late row after the retained window still counts toward unpaged limits.
      else if(!spec.limit&&low>=budget)throw fail('resource-exhausted','Add a cursor and limit for large collections.');
    }
    const docs=selected.map(snapshot);
    return {docs,size:docs.length,empty:docs.length===0,forEach:callback=>docs.forEach(callback)};
  }
  async function aggregate(spec,fields,session){
    if(spec.limit||spec.after!==undefined){
      const result=await query(spec,session),data={};
      if(!fields||Object.keys(fields).length>20)throw fail('invalid-argument');
      for(const [key,definition]of Object.entries(fields)){
        if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(key))throw fail('invalid-argument');
        if(definition.operation==='count')data[key]=result.size;
        else {if(definition.operation!=='sum'||!validField(definition.field))throw fail('invalid-argument');
          data[key]=result.docs.reduce((sum,doc)=>{const value=doc.get(definition.field);return sum+(typeof value==='number'?value:0);},0);}
      }
      return {data:()=>data};
    }
    const {filter,sort}=mongoQuery(spec),pipeline=[{$match:filter}];
    if(spec.limit)pipeline.push({$sort:sort},{$limit:spec.limit});
    const group={_id:null};
    if(Object.keys(fields).length>20)throw fail('invalid-argument');
    for(const [key,definition]of Object.entries(fields)){
      if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(key))throw fail('invalid-argument');
      if(definition.operation==='count')group[key]={$sum:1};
      else {if(definition.operation!=='sum'||!validField(definition.field))throw fail('invalid-argument');group[key]={$sum:`$data.${definition.field}`};}
    }
    const rows=await (await documents()).aggregate([...pipeline,{$group:group}],{session,maxTimeMS:10000}).toArray();
    const data=Object.fromEntries(Object.keys(fields).map(key=>[key,rows[0]?.[key]||0]));
    return {data:()=>data};
  }
  class Query {
    constructor(spec){this.spec=spec;}
    where(field,op,value){return new Query({...this.spec,filters:[...(this.spec.filters||[]),{kind:'where',field,op,value}]});}
    orderBy(field,direction='asc'){return new Query({...this.spec,orders:[...(this.spec.orders||[]),{field,direction}]});}
    limit(limit){return new Query({...this.spec,limit});}
    startAfter(...values){
      const snap=values[0];
      if(snap?.ref){const {orders}=mongoQuery(this.spec);values=orders.map(o=>o.field==='_id'?snap.ref.path:fieldAt(snap.data(),o.field.slice(5)));}
      return new Query({...this.spec,after:values});
    }
    get(){return query(this.spec);}
    count(){return {get:()=>aggregate(this.spec,{count:AggregateField.count()})};}
    aggregate(fields){return {get:()=>aggregate(this.spec,fields)};}
  }
  class Collection extends Query {
    constructor(path){super({path:pathOf(path,false)});this.path=path;this.id=path.split('/').at(-1);}
    doc(id=newId()){if(typeof id!=='string'||id.includes('/'))throw fail('invalid-argument');return adapter.doc(`${this.path}/${id}`);}
    async add(data){const ref=this.doc();await ref.create(data);return ref;}
    get parent(){const p=this.path.split('/').slice(0,-1).join('/');return p?adapter.doc(p):null;}
  }
  class Document {
    constructor(path){this.path=pathOf(path,true);this.id=path.split('/').at(-1);}
    get parent(){return adapter.collection(this.path.split('/').slice(0,-1).join('/'));}
    collection(name){return adapter.collection(`${this.path}/${name}`);}
    get(){return read(this);}
    set(data,options={}){return adapter.commit([{path:this.path,kind:'set',data,merge:options.merge===true}]);}
    create(data){return adapter.commit([{path:this.path,kind:'create',data}]);}
    update(data){return adapter.commit([{path:this.path,kind:'update',data}]);}
    delete(){return adapter.commit([{path:this.path,kind:'delete'}]);}
    isEqual(other){return other?.path===this.path;}
  }
  async function persist(db,session,writes,{reads=[],authorize,authorizeRead,now=new Date(),fence=transactionFence(db,session)}={}){
    if(!Array.isArray(writes)||writes.length>500||!Array.isArray(reads)||reads.length>500)throw fail('invalid-argument');
    const collection=db.collection('mongo_documents'),previous=new Map(),pending=new Map();
    for(const expected of reads){
      pathOf(expected.path,true);
      await fence(`document:${expected.path}`);
      const row=await collection.findOne({_id:expected.path},{session});
      previous.set(expected.path,row);
    }
    const lookup=async path=>{
      if(!previous.has(path)){await fence(`document:${path}`);previous.set(path,await collection.findOne({_id:path},{session}));}
      const row=previous.get(path);return row&&!row.deleted?revive(row.data):null;
    };
    if(authorizeRead)for(const expected of reads)if(!await authorizeRead({path:expected.path,data:await lookup(expected.path),lookup}))throw fail('permission-denied');
    for(const expected of reads)if((previous.get(expected.path)?.version??null)!==expected.version)throw fail('aborted','Document changed. Retry the transaction.');
    for(const write of writes){
      pathOf(write.path,true);if(!['set','create','update','delete'].includes(write.kind))throw fail('invalid-argument');
      const before=pending.has(write.path)?pending.get(write.path):await lookup(write.path);
      const after=applyDocumentWrite(before,write,now);
      if(after!==null&&Buffer.byteLength(JSON.stringify(pack(after)))>1024*1024)throw fail('resource-exhausted','Document exceeds the storage limit.');
      if(authorize&&!await authorize({path:write.path,before,after,lookup,now}))throw fail('permission-denied');
      pending.set(write.path,after);
    }
    for(const [path,data]of pending){
      const old=previous.get(path);
      if((old&&!old.deleted&&data!==null&&equal(revive(old.data),data))||(!old&&data===null))continue;
      await fence(`collection:${path.split('/').slice(0,-1).join('/')}`);
      const parts=path.split('/'),row={_id:path,parent:parts.slice(0,-1).join('/'),collectionGroup:parts.at(-2),id:parts.at(-1),
        data:data===null?(old?.data||{}):pack(data),deleted:data===null,version:(old?.version||0)+1,updatedAt:now};
      row.sortKeys=documentOrderKeys(row.data);
      if(old){const result=await collection.replaceOne({_id:path,version:old.version},row,{session});if(result.matchedCount!==1)throw fail('aborted');}
      else await collection.insertOne(row,{session});
      await db.collection('mongo_trigger_jobs').insertOne({_id:`${path}:${row.version}`,path,version:row.version,
        before:old&&!old.deleted?old.data:null,after:data===null?null:row.data,state:'pending',createdAt:now,attempts:0,nextAttemptAt:now},{session});
      if(enqueueBackup)await enqueueBackup(db,row,session);
    }
    return {written:pending.size};
  }
  adapter={doc:path=>new Document(path),collection:path=>new Collection(path),collectionGroup:group=>new Query({group}),
    _read:read,_query:query,_aggregate:aggregate,_snapshot:snapshot,_missing:missing,
    async commit(writes,options={}){
      const db=await getDatabase();return transaction(session=>persist(db,session,writes,options));
    },
    async runTransaction(work){
      const db=await getDatabase();
      return transaction(async session=>{
        let operations=Promise.resolve();
        const serial=work=>{const result=operations.then(work);operations=result.catch(()=>{});return result;};
        const writes=[],fence=transactionFence(db,session),tx={
          get(ref){return serial(async()=>{
            if(ref instanceof Query){if(ref.spec.group)throw fail('failed-precondition','Collection-group reads are not supported inside a mutation transaction.');await fence(`collection:${ref.spec.path}`);return query(ref.spec,session);}
            await fence(`document:${ref.path}`);return read(ref,session);
          });},
          getAll:(...refs)=>Promise.all(refs.map(ref=>tx.get(ref))),
          set(ref,data,options={}){writes.push({path:ref.path,kind:'set',data,merge:options.merge===true});return tx;},
          create(ref,data){writes.push({path:ref.path,kind:'create',data});return tx;},
          update(ref,data){writes.push({path:ref.path,kind:'update',data});return tx;},
          delete(ref){writes.push({path:ref.path,kind:'delete'});return tx;},
        };
        const value=await work(tx);await operations;await persist(db,session,writes,{fence});return value;
      });
    },
    getAll:(...refs)=>Promise.all(refs.map(ref=>read(ref))),
    batch(){const writes=[],batch={set(ref,data,options={}){writes.push({path:ref.path,kind:'set',data,merge:options.merge===true});return batch;},
      create(ref,data){writes.push({path:ref.path,kind:'create',data});return batch;},update(ref,data){writes.push({path:ref.path,kind:'update',data});return batch;},
      delete(ref){writes.push({path:ref.path,kind:'delete'});return batch;},commit:()=>adapter.commit(writes)};return batch;},
  };
  return adapter;
}
