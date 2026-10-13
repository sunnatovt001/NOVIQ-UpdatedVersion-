import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Languages } from "lucide-react";
import { useLocale } from "@/src/contexts/LocaleContext";

const options = [
  {value:"en",label:"English"},
  {value:"uz",label:"O‘zbekcha"},
  {value:"ru",label:"Русский"},
] as const;

export function SidebarLanguagePicker() {
  const {locale,setLocale,t}=useLocale();
  return <fieldset className="sidebar-language-picker">
    <legend className="sr-only">{t("shell.language")}</legend>
    <div className="sidebar-language-heading" aria-hidden="true"><Languages size={15}/><span>{t("shell.language")}</span></div>
    <div className="sidebar-language-options">
      {options.map(option=><label key={option.value} className="sidebar-language-option">
        <input type="radio" name="sidebar-language" value={option.value} checked={locale===option.value} onChange={()=>setLocale(option.value)}/>
        <span lang={option.value}>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

export function HeaderLanguagePicker() {
  const {locale,t}=useLocale();
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);};
  },[open]);
  return <div ref={root} className="app-language-control" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" className="app-language-trigger" aria-label={t("shell.language")} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>
      <Languages size={17} aria-hidden="true"/><span>{options.find(option=>option.value===locale)?.label}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {open&&<div id={id} className="app-language-popover"><SidebarLanguagePicker/></div>}
  </div>;
}
