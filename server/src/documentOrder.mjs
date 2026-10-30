// Stable, order-preserving scalar keys. Every key is a hex string, so Mongo's
// binary string collation reproduces Firestore's cross-type ordering.
export const orderField=field=>`sortKeys.${Buffer.from(field).toString('hex')}`;
const stringBytes=value=>[...Buffer.from(value)].map(byte=>byte===0?'0001':byte.toString(16).padStart(2,'0')).join('')+'0000';
function numberBytes(value){
  const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value===0?0:value);
  if(bytes[0]&128)for(let i=0;i<8;i++)bytes[i]^=255;else bytes[0]^=128;
  return bytes.toString('hex');
}
export function scalarOrderKey(value){
  if(value===null)return '00';
  if(typeof value==='boolean')return value?'0101':'0100';
  if(typeof value==='number'&&Number.isFinite(value))return '02'+numberBytes(value);
  if(value?.__noviqTimestamp===true)return '03'+numberBytes(value.seconds)+numberBytes(value.nanoseconds);
  if(typeof value==='string')return '04'+stringBytes(value);
  return null;
}
export function documentOrderKeys(data){
  const keys={};
  const walk=(value,path)=>{
    const key=scalarOrderKey(value);
    if(key!==null){keys[Buffer.from(path).toString('hex')]=key;return;}
    if(value&&typeof value==='object'&&!Array.isArray(value))for(const [field,child]of Object.entries(value))walk(child,path?`${path}.${field}`:field);
  };
  for(const [field,value]of Object.entries(data))walk(value,field);
  return keys;
}
