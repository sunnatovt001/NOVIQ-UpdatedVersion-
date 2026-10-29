import type {Deck,Card,Review,Session} from '@/src/features/flashcards/model';
import {mongoStudyRequest} from './mongoStudyClient';
export type FlashcardData={decks:Deck;cards:Card;reviews:Review;sessions:Session};
export type FlashcardKind=keyof FlashcardData;
export type MongoFlashcardRecord<K extends FlashcardKind>={id:string;data:FlashcardData[K];revision:number};
function route(kind:FlashcardKind,deckId?:string,id?:string) {
  if((kind==='cards'||kind==='reviews')&&!deckId)throw new Error('Deck ID required.');
  const root=kind==='cards'||kind==='reviews'?`decks/${encodeURIComponent(deckId!)}/${kind}`:kind;
  return `/api/flashcards/${root}${id?`/${encodeURIComponent(id)}`:''}`;
}
export const listMongoFlashcards=<K extends FlashcardKind>(kind:K,deckId?:string,after?:string)=>
  mongoStudyRequest<{records:MongoFlashcardRecord<K>[];nextCursor:string|null}>(route(kind,deckId)+(after?`?after=${encodeURIComponent(after)}`:''));
export const loadMongoFlashcard=<K extends FlashcardKind>(kind:K,id:string,deckId?:string)=>
  mongoStudyRequest<{record:MongoFlashcardRecord<K>}>(route(kind,deckId,id));
export const saveMongoFlashcard=<K extends FlashcardKind>(kind:K,id:string,data:FlashcardData[K],baseRevision:number,mutationId:string,deckId?:string)=>
  mongoStudyRequest<{record:MongoFlashcardRecord<K>}>(route(kind,deckId,id),'PUT',{data,baseRevision,mutationId});
export const deleteMongoFlashcard=(kind:FlashcardKind,id:string,baseRevision:number,mutationId:string,deckId?:string)=>
  mongoStudyRequest<{id:string;deleted:true;revision:number}>(route(kind,deckId,id),'DELETE',{baseRevision,mutationId});
