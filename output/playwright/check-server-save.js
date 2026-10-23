async (page) => {
 const queue=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('noviq:offlineSyncQueue:v1')||'[]').filter(q=>q.status!=='synced').length);
 const before=await queue();
 await page.getByRole('button',{name:'Choose premium avatar 3',exact:true}).click();
 await page.getByRole('button',{name:'Save avatar',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const server=await (await page.request.post('http://127.0.0.1:4184/__planner_fixture',{data:{scope:'glass-design',uid:'glass-design',action:'read',path:'users/glass-design'}})).json();
 if(server.value.photoURL!=='/avatars/pro-3.png')throw new Error('Server did not store the chosen avatar');
 if(await queue()>before)throw new Error('New local pending entry was created');
 await page.context().setOffline(true);
 await page.getByRole('button',{name:'Choose premium avatar 4',exact:true}).click();
 await page.getByRole('button',{name:'Save avatar',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'No internet connection'}).waitFor();
 const displayed=await page.locator('.pro-sidebar-avatar').getAttribute('src');
 if(displayed!=='/avatars/pro-3.png')throw new Error('Unconfirmed avatar appeared saved');
 if(await queue()>before)throw new Error('Offline save created a local pending entry');
 await page.context().setOffline(false);
 await page.getByRole('button',{name:'Close avatar editor',exact:true}).click();
 if(await page.locator('.sync-recovery-card,[aria-label="Cloud sync recovery"]').count())throw new Error('Internal sync controls still visible');
 return {serverSave:true,offlineSaveRejected:true,unconfirmedChangeNotApplied:true,newLocalPendingEntries:0,internalSyncControls:0};
}
