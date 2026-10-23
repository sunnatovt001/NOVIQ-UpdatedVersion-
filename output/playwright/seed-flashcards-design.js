async (page) => {
 const uid='glass-design',scope='glass-design',records={},stamp=new Date().toISOString();
 const decks=[['sat-design','SAT Vocabulary','SAT','Words worth remembering.',[['Resilient','Able to recover after difficulty.'],['Pragmatic','Dealing with things in a practical way.'],['Ambiguous','Having more than one possible meaning.'],['Concise','Expressing much in a few words.']]],['physics-design','Motion & forces','Physics','Build an intuition for movement.',[['Velocity','The rate of change of displacement.'],['Acceleration','The rate of change of velocity.'],['Force','Mass multiplied by acceleration.']]],['ielts-design','Everyday expressions','IELTS','Make room for better conversations.',[['In the long run','Over a long period of time.'],['On the same page','Sharing the same understanding.']]]];
 for(const [id,title,subject,description,items]of decks){records[`users/${uid}/decks/${id}`]={title,subject,description,tags:[subject],favorite:id==='sat-design',archived:false,updatedAt:stamp};items.forEach(([front,back],i)=>records[`users/${uid}/decks/${id}/cards/c${i}`]={front,back,order:i,revision:1,deleted:false,updatedAt:stamp});}
 await page.request.post('http://127.0.0.1:4184/__planner_fixture',{data:{action:'seed',uid,scope,records}});
 await page.reload();await page.locator('.pro-preview-face').waitFor();
 await page.screenshot({path:'output/playwright/flashcards-desktop.png'});
 return {decks:await page.locator('.fc-deck-tile').count(),preview:await page.locator('.pro-preview-face').innerText()};
}
