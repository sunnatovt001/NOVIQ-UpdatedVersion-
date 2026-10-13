import { useEffect, useRef } from "react";

export const useNotebookAiScope = (owner: string | undefined, reset: () => void) => {
  const aiRequestRef = useRef(false);
  const aiGenerationRef = useRef(0);
  const aiOwnerRef = useRef(owner);
  const resetRef = useRef(reset);
  aiOwnerRef.current = owner;
  resetRef.current = reset;
  useEffect(() => {
    aiGenerationRef.current += 1;
    aiRequestRef.current = false;
    resetRef.current();
    return () => { aiGenerationRef.current += 1; };
  }, [owner]);
  return { aiRequestRef, aiGenerationRef, aiOwnerRef };
};
