import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {Binary} from 'mongodb';
import {allowStorageOperation} from './storagePolicy.mjs';
import {verifyFirebaseIdentity} from './firebaseIdentity.mjs';
import {enqueueMirrorRecord} from './firebaseMirror.mjs';
const CHUNK=512*1024;
const fault=status=>Object.assign(new Error('File request rejected.'),{status});
const bytes=value=>Buffer.isBuffer(value)?value:Buffer.from(value.buffer);
export function createMongoFilesApi({getDatabase,transaction,origins,key,backupKey,
  verify=verifyFirebaseIdentity,now=()=>new Date()}){
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('Server-only file signing key required.');
  const token=id=>createHmac('sha256',key).update(`noviq-file-download:${id}`).digest('hex');
  const link=id=>`/api/files?download=${id}&token=${token(id)}`;
  const queue=async(db,name,row,session)=>{if(backupKey)await enqueueMirrorRecord(db,name,row,{key:backupKey,session});};
  return async(request,response)=>{
    response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,body)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.end(JSON.stringify(body));};
    try{
      const db=await getDatabase(),files=db.collection('mongo_files'),chunks=db.collection('mongo_file_chunks');
      const url=new URL(request.url,'http://localhost'),id=url.searchParams.get('download');
      if(request.method==='GET'&&id){
        const provided=url.searchParams.get('token')||'';
        if(!/^[a-f0-9]{40}$/.test(id)||!/^[a-f0-9]{64}$/.test(provided)||!timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(token(id),'hex')))throw fault(403);
        const file=await files.findOne({_id:id,state:'complete'},{maxTimeMS:5000});if(!file)throw fault(404);
        response.setHeader('Content-Type',file.contentType);response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
        if(!file.contentType.startsWith('image/'))response.setHeader('Content-Disposition','attachment; filename="noviq-source"');
        response.statusCode=200;
        // Streaming avoids Vercel's buffered response-size limit for large PDFs.
        for await(const chunk of chunks.find({fileId:id}).sort({index:1})){
          if(!response.write(bytes(chunk.data)))await new Promise((resolve,reject)=>{response.once('drain',resolve);response.once('error',reject);});
        }
        return response.end();
      }
      if(request.method!=='POST')throw fault(405);
      if(!origins.includes(request.headers.origin))throw fault(403);
      const header=request.headers.authorization||'';
      const user=header.startsWith('Bearer ')?await verify(header.slice(7)):null;if(!user)throw fault(401);
      if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw fault(415);
      let body=request.body;
      if(body===undefined){const buffers=[];let size=0;for await(const data of request){size+=data.length;if(size>1024*1024)throw fault(413);buffers.push(data);}body=JSON.parse(Buffer.concat(buffers).toString('utf8'));}
      else if(typeof body==='string'||Buffer.isBuffer(body))body=JSON.parse(String(body));
      if(!body||typeof body!=='object'||Buffer.byteLength(JSON.stringify(body))>1024*1024)throw fault(400);
      if(body.action==='begin'){
        if(typeof body.contentType!=='string'||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(body.contentType)||
          !allowStorageOperation({uid:user.uid,path:body.path,action:'create',contentType:body.contentType,size:body.size}))throw fault(400);
        if(await files.countDocuments({userId:user.uid,state:'uploading'})>=10)throw fault(429);
        const row={_id:randomBytes(20).toString('hex'),userId:user.uid,path:body.path,contentType:body.contentType,
          size:body.size,chunks:Math.ceil(body.size/CHUNK),state:'uploading',createdAt:now()};
        await transaction(async session=>{await files.insertOne(row,{session});await queue(db,'mongo_files',row,session);});
        return send(200,{id:row._id,chunkSize:CHUNK});
      }
      if(body.action==='resolve'){
        if(!allowStorageOperation({uid:user.uid,path:body.path,action:'read'}))throw fault(403);
        const file=await files.find({userId:user.uid,path:body.path,state:'complete'}).sort({createdAt:-1}).limit(1).toArray();
        if(!file[0])throw fault(404);return send(200,{url:link(file[0]._id)});
      }
      if(typeof body.id!=='string'||!/^[a-f0-9]{40}$/.test(body.id))throw fault(400);
      const file=await files.findOne({_id:body.id,userId:user.uid},{maxTimeMS:5000});if(!file)throw fault(404);
      if(body.action==='chunk'){
        if(file.state!=='uploading'||!Number.isInteger(body.index)||body.index<0||body.index>=file.chunks||
          typeof body.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))throw fault(400);
        const data=Buffer.from(body.base64,'base64'),expected=Math.min(CHUNK,file.size-body.index*CHUNK);
        if(data.length!==expected||data.toString('base64')!==body.base64)throw fault(400);
        const row={_id:`${file._id}:${body.index}`,fileId:file._id,userId:user.uid,index:body.index,data:new Binary(data),hash:createHash('sha256').update(data).digest('hex')};
        await transaction(async session=>{
          const current=await files.findOne({_id:file._id,state:'uploading'},{session});if(!current)throw fault(409);
          const previous=await chunks.findOne({_id:row._id},{session});
          if(previous){if(previous.hash!==row.hash)throw fault(409);return;}
          await chunks.insertOne(row,{session});await queue(db,'mongo_file_chunks',row,session);
        });
        return send(200,{stored:true});
      }
      if(body.action==='complete'){
        if(file.state==='complete')return send(200,{url:link(file._id),size:file.size,contentType:file.contentType});
        if(file.state!=='uploading')throw fault(409);
        await transaction(async session=>{
          const rows=await chunks.find({fileId:file._id},{session}).sort({index:1}).limit(file.chunks+1).toArray();
          if(rows.length!==file.chunks||rows.some((row,index)=>row.index!==index||row.hash!==createHash('sha256').update(bytes(row.data)).digest('hex'))||
            rows.reduce((n,row)=>n+bytes(row.data).length,0)!==file.size)throw fault(409);
          const result=await files.updateOne({_id:file._id,state:'uploading'},{$set:{state:'complete',completedAt:now()}},{session});
          if(result.modifiedCount!==1)throw fault(409);
          await queue(db,'mongo_files',await files.findOne({_id:file._id},{session}),session);
        });
        return send(200,{url:link(file._id),size:file.size,contentType:file.contentType});
      }
      if(body.action==='delete'){
        await transaction(async session=>{
          await files.updateOne({_id:file._id,userId:user.uid},{$set:{state:'deleted',deletedAt:now()}},{session});
          await queue(db,'mongo_files',await files.findOne({_id:file._id},{session}),session);
        });return send(200,{deleted:true});
      }
      throw fault(400);
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      send([400,401,403,404,405,409,413,415,429].includes(error.status)?error.status:503,{error:'File service unavailable or request rejected.'});
    }
  };
}
