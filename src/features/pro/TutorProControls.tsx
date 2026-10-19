import React, { useState, useEffect } from 'react';
import { useProCopy } from './proCopy';
type Mode = 'standard' | 'coach' | 'practice' | 'mistake';
type Depth = 'simple' | 'standard' | 'advanced';
export function useTutorModes(uid?: string) { const [proTutorMode, setProTutorMode] = useState<Mode>('standard'), [explanationDepth, setExplanationDepth] = useState<Depth>('standard'), [shareProContext, setShareProContext] = useState(false); useEffect(() => { setProTutorMode('standard'); setShareProContext(false); }, [uid]); return { proTutorMode, setProTutorMode, explanationDepth, setExplanationDepth, shareProContext, setShareProContext }; }
export function TutorProControls({ isTyping, ...state }: ReturnType<typeof useTutorModes> & {
    isTyping: boolean;
}) {
    const proCopy = useProCopy();
    const { proTutorMode, setProTutorMode, explanationDepth, setExplanationDepth, shareProContext, setShareProContext } = state;
    return (<div className="pro-tutor-controls"><label>{proCopy.tutor}<select aria-label={proCopy.tutor} disabled={isTyping} value={proTutorMode} onChange={e => setProTutorMode(e.target.value as typeof proTutorMode)}>{[['standard', proCopy.standardTutor], ['coach', proCopy.coach], ['practice', proCopy.practiceTool], ['mistake', proCopy.explain]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{proTutorMode !== 'standard' && <><label>{proCopy.depth}<select value={explanationDepth} disabled={isTyping} onChange={e => setExplanationDepth(e.target.value as typeof explanationDepth)}>{(['simple', 'standard', 'advanced'] as const).map(value => <option value={value} key={value}>{value === 'standard' ? proCopy.standardDepth : proCopy[value]}</option>)}</select></label><label className="pro-tutor-consent"><input type="checkbox" checked={shareProContext} onChange={e => setShareProContext(e.target.checked)}/>{proCopy.consent}</label></>}</div>);
}
