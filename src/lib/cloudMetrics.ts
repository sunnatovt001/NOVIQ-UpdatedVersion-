import { httpsCallable } from "@/src/lib/callable";
import { functions } from "./firebase";
export const serverMetricsEnabled = import.meta.env.VITE_SERVER_METRICS_ENABLED === "true";
type Summary = {
  focusMinutes: number; tasksDone: number; notesCreated: number; sourcesUploaded: number;
  notebookMessages: number; tutorMessages: number; decksCreated: number; flashcardsCreated: number;
  dueCards: number; reviewedCards: number; xp?: number; asOf: number;
};
export const getCloudMetrics = async (start?: number,end?: number,xpDayKey?: string): Promise<Summary> => {
  const result=await httpsCallable<{start?:number;end?:number;xpDayKey?:string},Summary>(functions,"getActivityMetrics")({...(start!==undefined?{start,end,xpDayKey}:{})});
  const data=result.data;
  for (const key of ["focusMinutes","tasksDone","notesCreated","sourcesUploaded","notebookMessages","tutorMessages","decksCreated","flashcardsCreated","dueCards","reviewedCards","asOf"] as const) {
    if (!Number.isFinite(data?.[key])) throw new Error("Statistics returned an invalid response. Please retry.");
  }
  return data;
};
