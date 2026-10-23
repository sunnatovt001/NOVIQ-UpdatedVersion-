async (page) => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:4184/?testUser=1&testUid=glass-design&fixtureScope=glass-design#/planner');
 await page.locator('.app-sidebar').waitFor();
 await page.evaluate(()=>{window.__sidebar=document.querySelector('.app-sidebar')});
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 await nav.getByRole('button',{name:'Profile',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Profile');
 await page.evaluate(async()=>{await window.__lastTransition?.finished});
 await page.goBack();
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Planner');
 await page.evaluate(async()=>{await window.__lastTransition?.finished});
 await page.evaluate(()=>{
   document.querySelector('.app-sidebar nav button:nth-of-type(2)').click();
   [...document.querySelectorAll('.app-sidebar nav button')].find(b=>b.textContent==='Dashboard').click();
   [...document.querySelectorAll('.app-sidebar nav button')].find(b=>b.textContent==='Profile').click();
 });
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Profile'&&!document.documentElement.dataset.routePending);
 await page.evaluate(async()=>{await window.__lastTransition?.finished});
 const rapid=await page.evaluate(()=>({hash:location.hash,main:document.querySelector('.noviq-app > main').getAttribute('aria-label'),sidebarPreserved:window.__sidebar===document.querySelector('.app-sidebar')}));
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4184/?testUser=1&testUid=glass-design&fixtureScope=glass-design#/dashboard');
 await page.locator('.glass-dashboard').waitFor();
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Plan',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Planner');
 const mobile=await page.evaluate(()=>({mode:document.documentElement.dataset.routeMotion,overflow:document.documentElement.scrollWidth>innerWidth,sidebars:document.querySelectorAll('.app-sidebar').length}));
 await page.evaluate(()=>{document.startViewTransition=undefined;});
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Today',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.noviq-app > main')?.getAttribute('aria-label')==='Dashboard');
 const fallback=await page.evaluate(()=>document.documentElement.dataset.routeMotion);
 return {rapid,mobile,fallback};
}
