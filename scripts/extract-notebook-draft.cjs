const fs=require('node:fs');
const file='src/pages/Notes.tsx';let code=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const start=code.indexOf('  useEffect(() => {\n    if (!activeNote || !user)');
const end=code.indexOf('  const handleCreateNote',start);
if(start<0||end<0)throw new Error('Draft boundaries missing');
let body=code.slice(start,end).replaceAll('activeNote','note').replaceAll('user?.uid','uid').replaceAll('user.uid','uid').replaceAll('!user','!uid');
body=body.replace('[note,user?.uid]','[note,uid]');
const state=`  const [draftTitle,setDraftTitle]=useState(''),[draftContent,setDraftContent]=useState('');
  const draftRef=useRef<NotebookDraft|null>(null);
  const [draftConflict,setDraftConflict]=useState(false),[draftStorageError,setDraftStorageError]=useState(false);
`;
fs.writeFileSync('src/features/pro/useNotebookDraft.ts',`import {useEffect,useRef,useState} from 'react';
import {loadLocalDataStrict,saveLocalData} from '@/src/lib/localStore';
import {recordDate} from '@/src/lib/recordDate';
import {notebookDraftKey,validNotebookDraft,type NotebookDraft} from './notebookDraft';
export function useNotebookDraft(uid:string|undefined,note:{id:string;title:string;content:string;updatedAt?:unknown}|null,isSavingNote:boolean){
${state}${body}
return {draftTitle,setDraftTitle,draftContent,setDraftContent,draftRef,draftConflict,setDraftConflict,draftStorageError,setDraftStorageError,changeDraft};
}
`);
code=code.slice(0,start)+code.slice(end);
code=code.replace('  const [draftTitle, setDraftTitle] = useState("");\n','').replace('  const [draftContent, setDraftContent] = useState("");\n','').replace('  const draftRef=useRef<NotebookDraft|null>(null);\n','').replace('  const [draftConflict,setDraftConflict]=useState(false);\n','').replace('  const [draftStorageError,setDraftStorageError]=useState(false);\n','');
const marker='  const showAiSourcePreviews';
code=code.replace(marker,`  const {draftTitle,setDraftTitle,draftContent,setDraftContent,draftRef,draftConflict,setDraftConflict,draftStorageError,setDraftStorageError,changeDraft}=useNotebookDraft(user?.uid,activeNote,isSavingNote);\n`+marker);
code=code.replace("import {notebookDraftKey,validNotebookDraft,type NotebookDraft}","import {useNotebookDraft} from '@/src/features/pro/useNotebookDraft';\nimport {notebookDraftKey,validNotebookDraft,type NotebookDraft}");
fs.writeFileSync(file,code);
