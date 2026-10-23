async (page) => {
 const uid='glass-design',now=Date.now();
 const groups=[{id:'design-sat',name:'SAT Study Circle',description:'Reading, writing and a little progress every day.',membersCount:3,isPublic:true,role:'member'},{id:'design-ielts',name:'IELTS Speaking',description:'Practice ideas and speak with confidence.',membersCount:3,isPublic:true,role:'owner'},{id:'design-physics',name:'Physics Workshop',description:'Explore motion, forces and the questions in between.',membersCount:3,isPublic:true}];
 const joined=groups.slice(0,2),authors={[uid]:'Tolibjon','demo-madina':'Madina','demo-aziz':'Aziz'};
 const messages=Object.fromEntries(groups.map(g=>[g.id,[{id:'m1',userId:'demo-madina',displayName:'Madina',content:'Does anyone have a good way to approach transition questions?',createdAt:new Date(now-600000).toISOString()},{id:'m2',userId:uid,displayName:'Tolibjon',content:'I read both sentences first, then decide how the ideas connect.',createdAt:new Date(now-480000).toISOString()},{id:'m3',userId:'demo-aziz',displayName:'Aziz',content:'That helps! I’ll try it in my next practice session.',createdAt:new Date(now-300000).toISOString()}]]));
 const fulfill=(route,value)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 await page.route('**/__planner_fixture',async route=>{
   const b=route.request().postDataJSON();
   if(b.uid!==uid||b.scope!=='glass-design')return route.continue();
   if(b.action==='read'){
     let docs=null,value=null;
     if(b.path==='communities')docs=groups;
     else if(b.path===`users/${uid}/joinedCommunities`)docs=joined;
     else if(b.path===`users/${uid}/friends`)docs=[{id:'demo-madina',displayName:'Madina'},{id:'demo-aziz',displayName:'Aziz'}];
     else if(b.path===`users/${uid}/friendInvites`)docs=[];
     else if(/^communities\/[^/]+\/messages$/.test(b.path))docs=[...(messages[b.path.split('/')[1]]||[])].reverse();
     else if(/^communities\/[^/]+$/.test(b.path))value=groups.find(g=>g.id===b.path.split('/')[1])||null;
     else return route.continue();
     return fulfill(route,{value,revision:null,docs:(docs||[]).map(({id,...value})=>({id,value}))});
   }
   if(b.action==='call'){
     if(b.name==='updateCommunityPresence')return fulfill(route,{});
     if(b.name==='getCommunityMemberCount')return fulfill(route,{count:3,authors});
     if(b.name==='getCommunityMembers')return fulfill(route,{count:3,onlineCount:2,members:Object.entries(authors).map(([id,displayName],i)=>({uid:id,displayName,username:null,role:i?'member':'owner',online:i!==2,lastSeenAt:new Date(now-100000).toISOString()})),nextCursor:null,measuredAt:new Date().toISOString()});
     if(b.name==='sendCommunityMessage'){const g=b.data.communityId;messages[g].push({id:'m'+Date.now(),userId:uid,displayName:'Tolibjon',content:b.data.content,createdAt:new Date().toISOString()});return fulfill(route,{ok:true});}
     if(b.name==='createCommunity'){const id='demo-new-group';groups.push({id,name:b.data.name,description:b.data.description,membersCount:1,isPublic:true,role:'owner'});joined.push(groups.at(-1));messages[id]=[];return fulfill(route,{communityId:id});}
   }
   return route.continue();
 });
 await page.reload();await page.locator('.cg-message').first().waitFor();
 await page.screenshot({path:'output/playwright/community-desktop.png'});
 return {groups:await page.locator('.cg-room').count(),messages:await page.locator('.cg-message').count()};
}
