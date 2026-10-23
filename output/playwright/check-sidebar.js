async (page) => {
  const base='http://127.0.0.1:4184/?testUser=1&testUid=glass-design&fixtureScope=glass-design';
  const routes=['planner','dashboard','tutor','notes','focus','flashcards','community','analytics','pricing','profile'];
  const rows=[];
  for(const width of [1440,1100]){
    await page.setViewportSize({width,height:1000});
    for(const route of routes){
      await page.goto(base+'#/'+route);
      await page.locator('.pro-sidebar-profile').waitFor();
      const row=await page.locator('.app-sidebar').evaluate(el=>{
        const rect=el.getBoundingClientRect(),style=getComputedStyle(el),logo=el.querySelector('h1'),nav=el.querySelector('nav'),button=nav.querySelector('button');
        return {width:rect.width,x:rect.x,y:rect.y,height:rect.height,background:style.backgroundColor,radius:style.borderRadius,color:style.color,logo:getComputedStyle(logo).fontSize,navTop:nav.getBoundingClientRect().top,buttonHeight:button.getBoundingClientRect().height,buttonFont:getComputedStyle(button.querySelector('span')).fontSize,profile:!!el.querySelector('.pro-sidebar-profile')};
      });
      rows.push({viewport:width,route,...row});
    }
  }
  console.log(JSON.stringify(rows));
  for(const width of [1440,1100]){const group=rows.filter(r=>r.viewport===width),baseline=JSON.stringify((({route,viewport,...rest})=>rest)(group[0]));for(const row of group){if(JSON.stringify((({route,viewport,...rest})=>rest)(row))!==baseline)throw new Error('Sidebar changed on '+row.route+' at '+width);}}
  await page.goto(base+'#/planner');await page.screenshot({path:'output/playwright/shared-sidebar-planner.png'});
  await page.goto(base+'#/dashboard');await page.screenshot({path:'output/playwright/shared-sidebar-dashboard.png'});
  console.log('PASS: Sidebar geometry, logo, navigation and profile match across all 10 routes at 1440px and 1100px.');
}
