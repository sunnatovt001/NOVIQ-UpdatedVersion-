async (page) => {
 const base='http://127.0.0.1:4184/?testUser=1&testUid=glass-design&fixtureScope=glass-design';
 const routes=['planner','dashboard','tutor','notes','focus','flashcards','community','analytics','pricing','profile'];
 const sample=()=>page.locator('.app-sidebar').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:r.width,x:r.x,y:r.y,height:r.height,background:s.backgroundColor,radius:s.borderRadius,navY:el.querySelector('nav').getBoundingClientRect().top,profile:!!el.querySelector('.pro-sidebar-profile')};});
 const results=[];
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'#/planner');await page.reload();await page.locator('.pro-sidebar-profile').waitFor();
 results.push({coldPlanner:await sample()});
 for(const theme of ['light','dark']){
   await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);await page.reload();await page.locator('.pro-sidebar-profile').waitFor();
   const rows=[];
   for(const route of routes){await page.goto(base+'#/'+route);await page.locator('.pro-sidebar-profile').waitFor();rows.push({route,...await sample()});}
   const shape=({route,...rest})=>JSON.stringify(rest);
   if(rows.some(r=>shape(r)!==shape(rows[0])))throw new Error('Mismatch in '+theme+': '+JSON.stringify(rows));
   results.push({theme,routes:rows.length,sidebar:rows[0]});
 }
 await page.evaluate(()=>localStorage.setItem('noviq-pro-theme','light'));await page.reload();
 await page.setViewportSize({width:390,height:844});
 const mobile=[];
 for(const route of ['dashboard','planner','flashcards','profile']){await page.goto(base+'#/'+route);await page.locator('.pro-sidebar-profile').waitFor();mobile.push({route,...await sample()});}
 if(mobile.some(r=>r.width!==270))throw new Error('Mobile width mismatch');
 results.push({mobile:mobile.map(r=>({route:r.route,width:r.width}))});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'#/planner');await page.screenshot({path:'output/playwright/shared-sidebar-planner.png'});
 await page.goto(base+'#/dashboard');await page.locator('.gd-status').waitFor({state:'hidden'});await page.screenshot({path:'output/playwright/shared-sidebar-dashboard.png'});
 return {passed:true,results};
}
