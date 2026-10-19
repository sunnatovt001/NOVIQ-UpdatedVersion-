import {useEffect,useRef,useState} from 'react';
import {loadLocalDataStrict,saveLocalData} from '@/src/lib/localStore';
import {recordDate} from '@/src/lib/recordDate';
import {notebookDraftKey,validNotebookDraft,type NotebookDraft} from './notebookDraft';
export function useNotebookDraft(uid:string|undefined,note:{id:string;title:string;content:string;updatedAt?:unknown}|null,isSavingNote:boolean){
  const [draftTitle,setDraftTitle]=useState(''),[draftContent,setDraftContent]=useState('');
  const draftRef=useRef<NotebookDraft|null>(null);
  const [draftConflict,setDraftConflict]=useState(false),[draftStorageError,setDraftStorageError]=useState(false);
  useEffect(() => {
    if (!note || !uid) return;
    if(draftRef.current?.uid===uid && draftRef.current.noteId===note.id && draftRef.current.dirty){
      if(!isSavingNote && draftRef.current.baseUpdatedAt!==(recordDate(note.updatedAt)?.toISOString()||''))setDraftConflict(true);
      return;
    }
    try{
      const stored=loadLocalDataStrict<unknown>(notebookDraftKey(uid,note.id),null);
      if(stored!==null && !validNotebookDraft(stored,uid,note.id))throw new Error('Invalid draft');
      const draft=stored && stored.dirty ? stored : {uid:uid,noteId:note.id,title:note.title,content:note.content,baseUpdatedAt:recordDate(note.updatedAt)?.toISOString()||'',dirty:false};
      draftRef.current=draft;setDraftTitle(draft.title);setDraftContent(draft.content);
      setDraftConflict(draft.dirty && draft.baseUpdatedAt!==(recordDate(note.updatedAt)?.toISOString()||''));setDraftStorageError(false);
    }catch{
      draftRef.current=null;setDraftTitle(note.title);setDraftContent(note.content);setDraftStorageError(true);
    }
  }, [note,uid]);

  const changeDraft=(title:string,content:string)=>{
    if(!uid || !note)return;
    setDraftTitle(title);setDraftContent(content);
    const draft:NotebookDraft={uid:uid,noteId:note.id,title,content,baseUpdatedAt:draftRef.current?.noteId===note.id?draftRef.current.baseUpdatedAt:recordDate(note.updatedAt)?.toISOString()||'',dirty:true};
    draftRef.current=draft;
    try{
      const existing=loadLocalDataStrict<unknown>(notebookDraftKey(uid,note.id),null);
      if(existing!==null && !validNotebookDraft(existing,uid,note.id))throw new Error('Invalid draft');
      saveLocalData(notebookDraftKey(uid,note.id),draft);setDraftStorageError(false);
    }catch{setDraftStorageError(true);}
  };


return {draftTitle,setDraftTitle,draftContent,setDraftContent,draftRef,draftConflict,setDraftConflict,draftStorageError,setDraftStorageError,changeDraft};
}
