const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const origin = 'http://127.0.0.1:4184', uid = 'visual-reference-user', scope = 'visual-'+Date.now();
const model={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/smartPlannerModel.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:model,require:()=>({}),Date,Intl,crypto:require('node:crypto').webcrypto});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},timezoneId:'Asia/Tashkent'}),page=await context.newPage();
  const errors=[],production=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net|generativelanguage.googleapis.com/.test(r.url()))production.push(r.url());});
  await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com|soundhelix.com/,r=>r.abort());
  const api=async(action,data={})=>(await context.request.post(origin+'/__planner_fixture',{data:{scope,uid,action,...data}})).json();
  const now=Date.now(),start=model.localInstant(model.dateKey(now,'Asia/Tashkent'),'10:00','Asia/Tashkent'),plan={...model.initialSmartPlan(uid),ready:true,completedOnboardingAt:now,revision:'visual-preserve',sequence:1,persistenceVersion:3,previousRevision:null,timezone:'Asia/Tashkent',subjects:[{...model.newSubject('Biology'),id:'biology',target:'Understand cell structure',deadline:'2026-12-01'}],tasks:[{id:'cells',subjectId:'biology',title:'Review cell structure',minutes:30,priority:2,description:'Review saved study notes',type:'Reading',resource:'',flexibility:'flexible',repeat:'none',repeatUntil:'',createdAt:now,completed:false}],sessions:[{id:'cell-session',taskId:'cells',start,end:start+1800000}]};
  const profile={uid,displayName:'Reference review',onboarded:true,onboardingAnswers:{mainGoal:'Biology',userType:'student',struggle:'focus'},goals:['Understand biology'],xp:0,settings:{},subscription:{plan:'pro',status:'active',currentPeriodEnd:new Date(now+86400000*30).toISOString()}};
  await api('seed',{records:{[`users/${uid}`]:profile,[`users/${uid}/planner/smart-v2`]:plan,[`users/${uid}/proExperience/onboarding`]:{completed:true},[`users/${uid}/notebookNotes/cells`]:{id:'cells',title:'Cell structure',content:'The cell is the basic unit of life.\n\nThe nucleus stores genetic information. Mitochondria release energy through cellular respiration.\n\nReview question: How does the membrane regulate transport?',tags:['Biology'],userId:uid,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()},[`users/${uid}/decks/cells`]:{title:'Cell structure',subject:'Biology',updatedAt:new Date(now).toISOString(),tags:[]},...Object.fromEntries([['Nucleus','Stores genetic information'],['Mitochondria','Release energy through cellular respiration'],['Cell membrane','Regulates transport into and out of the cell']].map(([front,back],i)=>[`users/${uid}/decks/cells/cards/card-${i}`,{id:'card-'+i,deckId:'cells',front,back,order:i,updatedAt:new Date(now).toISOString()}])),...Object.fromEntries(Array.from({length:7},(_,i)=>[`users/${uid}/studySessions/focus-${i}`,{duration:(i+1)*300,subject:'Biology',category:'focus',timestamp:new Date(now-i*86400000).toISOString(),verified:true}]))}});
  const base=origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}`;
  fs.mkdirSync('artifacts/real-account/pro',{recursive:true});
  await page.goto(base+'#/dashboard');await page.locator('.pro-reference-overview').waitFor();
  await page.evaluate(({uid})=>{localStorage.setItem(`noviq:${uid}:flashcardShuffle`,'false');},{uid});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);
   for(const [route,selector] of [['dashboard','.pro-reference-overview'],['planner','.sp-calendar-workspace'],['flashcards','.fc-layout'],['focus','.pro-focus-workspace'],['notes','.pro-notebook-workspace'],['tutor','.tutor-workspace'],['analytics','.pro-analytics-workspace'],['pricing','.pro-plan-cards']]){
    await page.setViewportSize({width:1600,height:1100});await page.goto(base+'#/'+route);await page.reload();await page.locator(selector).waitFor();await page.waitForTimeout(450);
    if(route==='notes')await page.locator('.pro-notebook-workspace').getByRole('button',{name:'Cell structure',exact:false}).first().click();
    if(route==='flashcards')await page.locator('.pro-card-preview').waitFor();
    assert.equal(await page.locator('.noviq-app.dark').count(),theme==='dark'?1:0,route+' theme');
    for(const width of [1600,820,390,320]){
      await page.setViewportSize({width,height:width===1600?1100:900});await page.waitForTimeout(120);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(overflow,false,route+' overflow '+width+' '+theme);
      if(route==='analytics'){
        const clipped=await page.locator('.pro-analytics-workspace').evaluate(root=>[root,...root.querySelectorAll(':scope>header,.pro-analytics-metrics,.pro-activity-rail,.pro-engagement-heatmap')].filter(el=>el.getBoundingClientRect().width>innerWidth).map(el=>el.className));
        assert.deepEqual(clipped,[],route+' clipped panels '+width+' '+theme);
      }
      await page.screenshot({path:`artifacts/real-account/pro/${route}-${theme}-${width}.png`});
    }
    if(route==='flashcards'){
      await page.setViewportSize({width:1600,height:1100});
      const preview=page.locator('.pro-card-preview');
      await preview.getByRole('button',{name:'Flip preview card',exact:true}).click();
      assert.ok((await preview.innerText()).includes('Stores genetic information'));
      await preview.getByRole('button',{name:'Next preview card',exact:true}).click();
      assert.ok((await preview.innerText()).includes('Mitochondria'));
      await preview.getByRole('button',{name:'Previous preview card',exact:true}).click();
      assert.ok((await preview.innerText()).includes('Nucleus'));
      await preview.focus(); await page.keyboard.press('ArrowRight');
      assert.ok((await preview.innerText()).includes('Mitochondria'));
      await page.keyboard.press('ArrowLeft');
      assert.ok((await preview.innerText()).includes('Nucleus'));
      assert.equal((await api('stats')).records[`users/${uid}/decks/cells/cards/card-0`].back,'Stores genetic information');
    }
    if(route==='analytics'){
      const rail=page.locator('.pro-activity-rail');
      await rail.getByRole('button',{name:'Next week',exact:true}).click();
      await rail.getByRole('button',{name:'Previous week',exact:true}).click();
      assert.ok((await rail.innerText()).includes('Review cell structure'));
    }
    console.log('PASS reference capture '+route+' '+theme+' desktop/tablet/mobile');
   }
  }
  const records=(await api('stats')).records;
  assert.equal(JSON.stringify(records[`users/${uid}/planner/smart-v2`]),JSON.stringify(plan),'visual review must preserve Planner');
  assert.deepEqual(errors,[]);assert.deepEqual(production,[]);
  console.log('PASS both themes, 64 screenshots, no page errors, no production API requests, exact Planner preservation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
