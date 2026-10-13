import { initializeApp } from "firebase/app";
import firebaseConfig from "@/firebase-applet-config.json";

export const app = initializeApp(firebaseConfig);
export { firebaseConfig };
