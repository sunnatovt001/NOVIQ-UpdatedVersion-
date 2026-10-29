import {pack,revive,validPath} from '../../shared/mongoValues.mjs';
import {createDocumentPolicy} from './documentPolicy.mjs';
import {jsonBody} from './studyHttp.mjs';
import {verifyFirebaseIdentity} from './firebaseIdentity.mjs';
const statuses={'unauthenticated':401,'permission-denied':403,'not-found':404,'aborted':409,'already-exists':409,
  'invalid-argument':400,'resource-exhausted':429,5:404,6:409};
const reject=code=>Object.assign(new Error('Request rejected.'),{code});
export function createMongoDataApi({store,origins,verify=token=>verifyFirebaseIdentity(token,{includeClaims:true}),now=()=>new Date()}){
  return async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,body)=>{response.statusCode=status;response.end(JSON.stringify(body));};
    try{
      if(request.method!=='POST')return send(405,{error:{code:'invalid-argument',message:'Method not allowed.'}});
      if(!origins.includes(request.headers.origin))throw reject('permission-denied');
      const authorization=request.headers.authorization||'';
      if(!authorization.startsWith('Bearer '))throw reject('unauthenticated');
      const identity=await verify(authorization.slice(7));if(!identity)throw reject('unauthenticated');
      let body;
      if(request.body!==undefined){
        if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw reject('invalid-argument');
        body=typeof request.body==='string'||Buffer.isBuffer(request.body)?JSON.parse(String(request.body)):request.body;
        if(Buffer.byteLength(JSON.stringify(body))>2*1024*1024)throw reject('resource-exhausted');
      }else body=await jsonBody(request,2*1024*1024);
      if(!body||typeof body!=='object'||Array.isArray(body))throw reject('invalid-argument');
      const lookup=async path=>{const snapshot=await store.doc(path).get();return snapshot.exists?snapshot.data():null;};
      const policy=createDocumentPolicy({uid:identity.uid,claims:identity.claims||{},lookup});
      const exportDoc=snapshot=>({path:snapshot.ref.path,version:snapshot.version,exists:snapshot.exists,...(snapshot.exists?{data:pack(snapshot.data())}:{})});
      if(body.operation==='get'){
        if(!validPath(body.path)||body.path.split('/').length%2!==0)throw reject('invalid-argument');
        const snapshot=await store.doc(body.path).get();
        if(!await policy.canRead(body.path,snapshot.data()))throw reject('permission-denied');
        return send(200,{document:exportDoc(snapshot)});
      }
      if(body.operation==='query'||body.operation==='aggregate'){
        const spec=body.query;
        if(!spec||!await policy.canQuery(spec))throw reject('permission-denied');
        if(body.operation==='aggregate')return send(200,{data:(await store._aggregate(revive(spec),body.fields)).data()});
        const result=await store._query(revive(spec));
        // Check the query scope before execution and each result afterwards.
        for(const doc of result.docs)if(!await policy.canRead(doc.ref.path,doc.data()))throw reject('permission-denied');
        const output={documents:result.docs.map(exportDoc)};
        if(Buffer.byteLength(JSON.stringify(output))>4*1024*1024)throw reject('resource-exhausted');
        return send(200,output);
      }
      if(body.operation==='commit'){
        if(!Array.isArray(body.writes)||body.writes.length>100||!Array.isArray(body.reads||[])||(body.reads||[]).length>100)throw reject('invalid-argument');
        // All permissions are evaluated within the same MongoDB transaction as
        // the records they protect, including member/admin/previous-plan reads.
        return send(200,await store.commit(body.writes.map(revive),{reads:body.reads||[],now:now(),authorizeRead:async input=>
          createDocumentPolicy({uid:identity.uid,claims:identity.claims||{},lookup:input.lookup}).canRead(input.path,input.data),authorize:async input=>{
          const txPolicy=createDocumentPolicy({uid:identity.uid,claims:identity.claims||{},lookup:input.lookup});
          return txPolicy.canWrite(input);
        }}));
      }
      throw reject('invalid-argument');
    }catch(error){
      const status=statuses[error.code]||(error instanceof SyntaxError?400:[400,413,415].includes(error.status)?error.status:503);
      send(status,{error:{code:status===503?'unavailable':error.code||'invalid-argument',message:status===409?'Document changed. Retry the operation.':status===503?'Data service unavailable.':'Request rejected.'}});
    }
  };
}
