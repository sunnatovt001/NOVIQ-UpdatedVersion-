// Values shared by the browser transport and server adapter. Timestamp precision
// remains nanoseconds; ordinary dates/strings are not silently reinterpreted.
export class Timestamp {
  get __noviqTimestamp(){return true;}
  constructor(seconds, nanoseconds) {
    if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanoseconds) || nanoseconds<0 || nanoseconds>=1e9) throw new Error('Invalid timestamp.');
    this.seconds=seconds; this.nanoseconds=nanoseconds;
  }
  static now(){return Timestamp.fromMillis(Date.now());}
  static fromMillis(ms){const seconds=Math.floor(ms/1000);return new Timestamp(seconds,Math.round((ms-seconds*1000)*1e6));}
  static fromDate(date){return Timestamp.fromMillis(date.getTime());}
  toMillis(){return this.seconds*1000+this.nanoseconds/1e6;}
  toDate(){return new Date(this.toMillis());}
  isEqual(other){return other?.seconds===this.seconds&&other?.nanoseconds===this.nanoseconds;}
  valueOf(){return this.toMillis();}
  toJSON(){return {__noviqTimestamp:true,seconds:this.seconds,nanoseconds:this.nanoseconds};}
}
export class Transform {
  constructor(operation,values=[]){this.operation=operation;this.values=values;}
  get __noviqTransform(){return this.operation;}
}
export const FieldValue={serverTimestamp:()=>new Transform('time'),increment:n=>new Transform('increment',[n]),
  delete:()=>new Transform('delete'),arrayUnion:(...v)=>new Transform('union',v),arrayRemove:(...v)=>new Transform('remove',v)};
const unsafeKey=key=>['__proto__','prototype','constructor'].includes(key)||key.includes('\0');
export function pack(value,depth=0){
  if(depth>40)throw new Error('Value nesting limit exceeded.');
  if(value instanceof Timestamp)return value.toJSON();
  if(value instanceof Date)return Timestamp.fromDate(value).toJSON();
  if(value instanceof Transform)return {__noviqTransform:value.operation,values:value.values.map(v=>pack(v,depth+1))};
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(v=>pack(v,depth+1));
  if(value&&typeof value==='object'){
    if(value.__noviqTimestamp===true){new Timestamp(value.seconds,value.nanoseconds);return {__noviqTimestamp:true,seconds:value.seconds,nanoseconds:value.nanoseconds};}
    if(value.__noviqTransform){
      if(!['time','increment','delete','union','remove'].includes(value.__noviqTransform)||!Array.isArray(value.values)||value.values.length>100)throw new Error('Invalid value transform.');
      return {__noviqTransform:value.__noviqTransform,values:value.values.map(v=>pack(v,depth+1))};
    }
    if(Object.keys(value).some(unsafeKey))throw new Error('Invalid field name.');
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,depth+1)]));
  }
  throw new Error('Unsupported document value.');
}
export function revive(value){
  if(value?.__noviqTimestamp===true)return new Timestamp(value.seconds,value.nanoseconds);
  if(value?.__noviqTransform)return new Transform(value.__noviqTransform,(value.values||[]).map(revive));
  if(Array.isArray(value))return value.map(revive);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v)]));
  return value;
}
export const equal=(a,b)=>JSON.stringify(pack(a))===JSON.stringify(pack(b));
export const validPath=path=>typeof path==='string'&&path.length<=4000&&path.split('/').length<=32&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.includes('\0'));
export const validField=field=>field==='__name__'||typeof field==='string'&&field.length<=250&&field.split('.').every(p=>/^[A-Za-z_][A-Za-z0-9_-]*$/.test(p)&&!unsafeKey(p));
export const fieldAt=(data,path)=>path.split('.').reduce((value,key)=>value?.[key],data);
function setAt(data,path,value,deleting=false){
  if(!validField(path)||path==='__name__')throw new Error('Invalid field path.');
  const keys=path.split('.');let parent=data;
  for(const key of keys.slice(0,-1)){if(!parent[key]||typeof parent[key]!=='object'||Array.isArray(parent[key]))parent[key]={};parent=parent[key];}
  if(deleting)delete parent[keys.at(-1)];else parent[keys.at(-1)]=value;
}
function transformed(value,before,now){
  if(value instanceof Transform){
    const [argument]=value.values;
    if(value.operation==='time')return Timestamp.fromDate(now);
    if(value.operation==='increment'){if(typeof argument!=='number'||!Number.isFinite(argument))throw new Error('Invalid increment.');return (typeof before==='number'?before:0)+argument;}
    if(value.operation==='union')return [...(Array.isArray(before)?before:[]),...value.values.filter(v=>!(Array.isArray(before)?before:[]).some(p=>equal(p,v)))].filter((v,i,a)=>a.findIndex(p=>equal(p,v))===i);
    if(value.operation==='remove')return (Array.isArray(before)?before:[]).filter(v=>!value.values.some(p=>equal(p,v)));
    if(value.operation==='delete')return undefined;
  }
  if(Array.isArray(value))return value.map(v=>{const next=transformed(v,undefined,now);if(next===undefined)throw new Error('Cannot delete an array element.');return next;});
  if(value&&typeof value==='object'&&!(value instanceof Timestamp))return Object.fromEntries(Object.entries(value).flatMap(([key,v])=>{
    const next=transformed(v,before?.[key],now);return next===undefined?[]:[[key,next]];
  }));
  return value;
}
export function applyDocumentWrite(previous,write,now){
  if(write.kind==='delete')return null;
  const incoming=revive(pack(write.data));
  if(!incoming||Array.isArray(incoming)||typeof incoming!=='object'||incoming instanceof Timestamp)throw new Error('Document must be a map.');
  if(write.kind==='create'&&previous!==null)throw Object.assign(new Error('Document exists.'),{code:6});
  if(write.kind==='update'&&previous===null)throw Object.assign(new Error('Document missing.'),{code:5});
  if(write.kind==='update'){
    const next=revive(pack(previous));
    for(const [path,value]of Object.entries(incoming)){const result=transformed(value,fieldAt(previous,path),now);setAt(next,path,result,result===undefined);}
    return next;
  }
  if(write.merge){
    const merge=(old,patch)=>{
      const next=old&&typeof old==='object'&&!Array.isArray(old)&&!(old instanceof Timestamp)?revive(pack(old)):{};
      for(const [key,value]of Object.entries(patch)){
        if(value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof Transform)&&!(value instanceof Timestamp))next[key]=merge(next[key],value);
        else {const result=transformed(value,next[key],now);if(result===undefined)delete next[key];else next[key]=result;}
      }
      return next;
    };
    return merge(previous,incoming);
  }
  return transformed(incoming,previous,now);
}
export function nativeFields(fields){
  const decode=value=>{
    if('timestampValue'in value){const raw=value.timestampValue;const ms=Date.parse(raw);if(!Number.isFinite(ms))throw new Error('Invalid native timestamp.');const nanos=Number((raw.match(/\.(\d+)Z$/)?.[1]||'').padEnd(9,'0'));return new Timestamp(Math.floor(ms/1000),nanos);}
    if('stringValue'in value)return value.stringValue;
    if('booleanValue'in value)return value.booleanValue;
    if('integerValue'in value){const n=Number(value.integerValue);if(!Number.isSafeInteger(n))throw new Error('Unsafe integer conversion.');return n;}
    if('doubleValue'in value){if(!Number.isFinite(value.doubleValue))throw new Error('Non-finite number.');return value.doubleValue;}
    if('nullValue'in value)return null;
    if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
    if('arrayValue'in value)return (value.arrayValue.values||[]).map(decode);
    throw new Error('Unsupported native application value.');
  };
  return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decode(v)]));
}
