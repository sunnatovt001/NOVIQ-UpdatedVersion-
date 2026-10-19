export type NotebookDraft={uid:string;noteId:string;title:string;content:string;baseUpdatedAt:string;dirty:boolean};
export const notebookDraftKey=(uid:string,noteId:string)=>`noviq:${uid}:notebookDraft:${noteId}`;
export function validNotebookDraft(value:unknown,uid:string,noteId:string):value is NotebookDraft {
  const draft=value as NotebookDraft|null;
  return !!draft && draft.uid===uid && draft.noteId===noteId && typeof draft.title==='string' && typeof draft.content==='string' && typeof draft.baseUpdatedAt==='string' && typeof draft.dirty==='boolean';
}
