import { useEffect, useRef, useState } from "react";
import { BookOpen, Layers, Sparkles } from "lucide-react";

type Props = { labels: string[]; tutorLabel:string; alt: string };
export function LandingStudents({labels, tutorLabel, alt}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [allowed,setAllowed] = useState(false);
  const [visible,setVisible] = useState(true);
  const [failed,setFailed] = useState(false);
  const running = allowed && visible;
  useEffect(()=>{
    const motion=matchMedia("(prefers-reduced-motion: reduce)");
    const data=matchMedia("(prefers-reduced-data: reduce)");
    const connection=(navigator as Navigator & {connection?:EventTarget & {saveData?:boolean}}).connection;
    let inView=true;
    const update=()=>{setAllowed(!motion.matches&&!data.matches&&!connection?.saveData);setVisible(inView&&!document.hidden);};
    const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;update();},{threshold:.1});
    if(stage.current)observer.observe(stage.current);
    update();
    motion.addEventListener("change",update);data.addEventListener("change",update);
    connection?.addEventListener("change",update);
    document.addEventListener("visibilitychange",update);
    return()=>{observer.disconnect();motion.removeEventListener("change",update);data.removeEventListener("change",update);connection?.removeEventListener("change",update);document.removeEventListener("visibilitychange",update);};
  },[]);
  return <div ref={stage} className="nl-students-stage" data-running={running}>
    <div className="nl-students-art">
      <img src={failed?"/landing/students-original.png":"/landing/noviq-students.webp"} alt={alt} width="1672" height="941" fetchPriority="high" decoding="async" onError={()=>setFailed(true)}/>
    </div>
    <div className="nl-students-orbit" aria-hidden="true"><span/><span/></div>
    <div className="nl-student-badge nl-student-badge-tutor" aria-hidden="true"><Sparkles size={21}/><span>{tutorLabel}</span><i/></div>
    <div className="nl-student-badge nl-student-badge-books" aria-hidden="true"><BookOpen size={23}/><span>{labels[1]}</span></div>
    <div className="nl-student-badge nl-student-badge-plan" aria-hidden="true"><Layers size={22}/><span>{labels[0]}</span></div>
  </div>;
}
