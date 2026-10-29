import type {UserProfile} from '@/src/types';
import {mongoStudyRequest} from './mongoStudyClient';
export type MongoProfileResponse={profile:UserProfile|null;revision:number};
export type MongoProfilePatch=Partial<Pick<UserProfile,'displayName'|'photoURL'|'onboarded'|'onboardingAnswers'|'onboardingCompleted'|
  'onboarding'|'onboardingCompletedAt'|'goals'|'currentLevel'|'showActionButtons'|'settings'>>;
export const loadMongoProfile=()=>mongoStudyRequest<MongoProfileResponse>('/api/profile');
// Preserve mutationId and baseRevision when retrying an unknown network outcome.
export const saveMongoProfile=(patch:MongoProfilePatch,baseRevision:number,mutationId:string)=>
  mongoStudyRequest<MongoProfileResponse>('/api/profile','PATCH',{patch,baseRevision,mutationId});
export const recordMongoVisit=(baseRevision:number,mutationId:string)=>
  mongoStudyRequest<MongoProfileResponse>('/api/profile/visit','POST',{baseRevision,mutationId});
