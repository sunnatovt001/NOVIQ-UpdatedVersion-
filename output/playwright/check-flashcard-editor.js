async (page) => {
 if(await page.getByRole('textbox',{name:'Term or question',exact:true}).count()){
 await page.getByRole('textbox',{name:'Term or question',exact:true}).fill('Photosynthesis');
 await page.getByRole('textbox',{name:'Answer or definition',exact:true}).fill('Plants use light energy to turn water and carbon dioxide into sugars.');
 await page.getByRole('button',{name:'Save cards',exact:true}).click();
 }
 if(await page.getByRole('button',{name:'Close editor',exact:true}).count())await page.getByRole('button',{name:'Close editor',exact:true}).click();
 await page.locator('.pro-preview-face').waitFor();
 const description=await page.locator('.pro-preview-face').evaluate(el=>document.getElementById(el.getAttribute('aria-describedby'))?.textContent);
 if(description!=='Photosynthesis')throw new Error('Question is not described');
 await page.getByRole('button',{name:'Flip preview card',exact:true}).click();
 const answer=await page.locator('.pro-preview-face').evaluate(el=>document.getElementById(el.getAttribute('aria-describedby'))?.textContent);
 if(!answer.includes('Plants use light'))throw new Error('Answer is not described');
 const library=page.getByRole('navigation',{name:'Deck library',exact:true});
 await library.getByRole('button',{name:/^SAT Vocabulary/}).click();
 await page.locator('[data-page-scroll]').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'output/playwright/flashcards-ready-desktop.png'});
 await page.setViewportSize({width:768,height:1024});
 const tablet=await page.locator('.fc-mode').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 if(tablet.some(h=>h>65))throw new Error('Oversized tablet modes');
 await page.locator('[data-page-scroll]').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'output/playwright/flashcards-ready-tablet.png'});
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-page-scroll]').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'output/playwright/flashcards-ready-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 const reduced=await page.locator('.pro-preview-flipper').evaluate(el=>getComputedStyle(el).transitionDuration);
 return {deckCreated:true,cardsSaved:true,questionDescription:description,answerDescription:answer,tabletModeHeights:tablet,reducedTransition:reduced};
}
