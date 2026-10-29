import { getFirestore } from '@/src/lib/dataStore';
import { getFunctions } from "firebase/functions";
import { getStorage } from '@/src/lib/storageStore';
import { app, firebaseConfig } from "./firebaseApp";

export * from "./firebaseAuth";
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || "us-central1");
export const storage = getStorage(app);
