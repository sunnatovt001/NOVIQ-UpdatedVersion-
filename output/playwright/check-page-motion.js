async (page) => {
 await page.evaluate(()=>{
   window.__sidebar = document.querySelector('.app-sidebar');
   window.__transitions = [];
   const original = document.startViewTransition.bind(document);
   document.startViewTransition = update => {
     const transition=original(update); window.__lastTransition=transition;
     const report={ready:false,finished:false,error:null};window.__transitions.push(report);
     transition.ready.then(()=>{report.ready=true;report.animation=getComputedStyle(document.documentElement,'::view-transition-new(noviq-page)').animationName;}).catch(e=>report.error=e.message);
     transition.finished.then(()=>report.finished=true).catch(e=>report.error=e.message);
     return transition;
   };
 });
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 for(const name of ['Planner','Tutor','Library','Focus','Flashcards','Profile','Dashboard']){
   await nav.getByRole('button',{name,exact:true}).click();
   await page.waitForFunction(name=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')===name,name);
   await page.evaluate(async()=>{await window.__lastTransition.finished});
 }
 const result=await page.evaluate(()=>({mode:document.documentElement.dataset.routeMotion,transitions:window.__transitions,sidebarPreserved:window.__sidebar===document.querySelector('.app-sidebar'),sidebars:document.querySelectorAll('.app-sidebar').length,pending:!!document.documentElement.dataset.routePending}));
 if(result.transitions.some(t=>!t.ready||t.error||t.animation!=='noviq-page-enter'))throw new Error(JSON.stringify(result));
 if(!result.sidebarPreserved||result.sidebars!==1||result.pending)throw new Error('Shell changed or navigation stuck');
 await page.emulateMedia({reducedMotion:'reduce'});
 await nav.getByRole('button',{name:'Planner',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Planner');
 result.reducedMotion=await page.evaluate(()=>({mode:document.documentElement.dataset.routeMotion,animation:getComputedStyle(document.querySelector('[data-route-content]')).animationName}));
 return result;
}
