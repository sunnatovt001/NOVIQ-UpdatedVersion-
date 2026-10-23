async (page) => {
 if(await page.getByRole('button',{name:'Good 3',exact:true}).count()) await page.getByRole('button',{name:'Good 3',exact:true}).click();
 if(await page.getByRole('button',{name:'Save & exit',exact:true}).count()) await page.getByRole('button',{name:'Save & exit',exact:true}).click();
 await page.getByRole('dialog',{name:'Flashcards',exact:true}).waitFor({state:'hidden'});
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('textbox',{name:'Search cards',exact:true}).fill('Pragmatic');
 if(await page.locator('.fc-card-row').count()!==1)throw new Error('Card search failed');
 await page.getByRole('textbox',{name:'Search cards',exact:true}).fill('');
 await page.screenshot({path:'output/playwright/flashcards-final-desktop.png'});
 await page.setViewportSize({width:768,height:1024});
 await page.screenshot({path:'output/playwright/flashcards-final-tablet.png'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/playwright/flashcards-final-mobile.png'});
 const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,libraryOpen:document.querySelector('.pro-deck-library').open,sidebar:document.querySelector('.app-sidebar').getBoundingClientRect().width}));
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>localStorage.setItem('noviq-pro-theme','dark'));await page.reload();
 await page.locator('.pro-preview-face').waitFor();
 await page.screenshot({path:'output/playwright/flashcards-final-dark.png'});
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('dialog',{name:'Flashcards',exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/flashcards-final-study-dark.png'});
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();
 await page.evaluate(()=>localStorage.setItem('noviq-pro-theme','light'));await page.reload();
 return {studyRating:true,studyExit:true,cardSearch:true,mobile};
}
