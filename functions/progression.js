// Pure progression policy. Only the transaction adapter supplies verified evidence.
const catalogue = require('./xp-catalog.json');
const {dayKey} = require('./policy');
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const legendSuffix = value => {
  if(value>3999) return String(value);
  let result='';
  for(const [amount,text] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) while(value>=amount) {result+=text;value-=amount;}
  return result;
};
const threshold = level => {
  if (level <= 10) return catalogue.levels[Math.max(0, level - 1)].minXp;
  const n = level - 10;
  return 5000 + 1200 * n + 50 * n * (n - 1);
};
const levelInfo = value => {
  const xp = number(value);
  if (xp < 5000) return catalogue.levels.reduce((a,b) => xp >= b.minXp ? b : a, catalogue.levels[0]);
  const n = Math.max(0, Math.floor((-1150 + Math.sqrt(1150 ** 2 + 200 * (xp - 5000))) / 100));
  return {level: 10+n, minXp: threshold(10+n), name: n ? `Academic Legend ${legendSuffix(n+1)}` : 'Academic Legend'};
};
const freshDay = (key, target) => ({dayKey:key, targetMinutes:Math.max(20, Math.min(480, number(target) || 30)), focusSeconds:0, focusXp:0, recallCards:0, recallXp:0, ordinaryXp:0, bonusXp:0, goalAwarded:false, loginAwarded:false, qualified:false, balanced:false});
function evaluate(progress, daily, event) {
  const state = {...progress, counters:{...progress.counters}, achievements:{...progress.achievements}};
  const day = {...daily};
  const counters = state.counters, achievements = state.achievements;
  const add = (key, amount) => { counters[key] = number(counters[key]) + amount; };
  let ordinary = 0, sourceXp = 0, loginRequested = 0, goalRequested = 0;
  if (event.source === 'login' && !day.loginAwarded) { ordinary += 5; loginRequested = 5; day.loginAwarded = true; }
  if (event.source === 'focus') {
    day.focusSeconds += event.duration;
    add('focusSeconds',event.duration);
    const eligible = event.sessionEligible ?? event.duration >= 300;
    if (eligible) {
      sourceXp = Math.min(20,event.focusXpRequested ?? Math.floor(event.duration/60),Math.max(0,80-day.focusXp));
      if(event.countSession !== false) add('studyEvents',1);
    }
    if (event.longSession ?? event.duration >= 1500) add('longFocusSessions',1);
    ordinary += sourceXp;
    day.focusXp += sourceXp;
  }
  if (event.source === 'recall') {
    const before = Math.floor(day.recallCards/10);
    day.recallCards += event.newCards;
    add('uniqueRecallCards',event.newLifetimeCards);
    const blocks = Math.floor(day.recallCards/10)-before;
    sourceXp = Math.min(Math.max(0,30-day.recallXp),blocks*15);
    day.recallXp += sourceXp;
    ordinary += sourceXp;
    add('recallBlocks',blocks);
    add('studyEvents',blocks);
  }
  if (!day.goalAwarded && day.focusSeconds >= day.targetMinutes*60) {
    ordinary += 20; goalRequested = 20; day.goalAwarded = true; add('goalDays',1);
  }
  if (!day.qualified && (day.focusSeconds >= 600 || day.recallCards >= 10)) {
    day.qualified = true;
    const last = state.lastQualifiedDay;
    // Delayed events must never move the streak clock backwards.
    if (!last || day.dayKey > last) {
      const gap = last ? (Date.parse(day.dayKey)-Date.parse(last))/86400000 : Infinity;
      state.streak = gap === 1 ? number(state.streak)+1 : 1;
      state.lastQualifiedDay = day.dayKey;
      counters.bestStreak = Math.max(number(counters.bestStreak),state.streak);
    }
  }
  if (!day.balanced && day.focusSeconds >= 600 && day.recallCards >= 10) { day.balanced = true; add('balancedDays',1); }
  const ordinaryApplied = Math.min(ordinary,Math.max(0,180-day.ordinaryXp));
  const loginApplied = Math.min(loginRequested,ordinaryApplied);
  const sourceApplied = Math.min(sourceXp,ordinaryApplied-loginApplied);
  const goalApplied = Math.min(goalRequested,ordinaryApplied-loginApplied-sourceApplied);
  if (event.source === 'focus') day.focusXp -= sourceXp-sourceApplied;
  if (event.source === 'recall') day.recallXp -= sourceXp-sourceApplied;
  day.ordinaryXp += ordinaryApplied;
  let bonus = 0;
  const unlocked = [];
  for (const item of catalogue.achievements) {
    if (achievements[item.id] || number(counters[item.metric]) < item.target) continue;
    // The legacy reward is preserved, but cannot be earned again under a new ID.
    const legacyPaid = item.id === 'A11' ? event.legacyStreak7 : item.id === 'A12' ? event.legacyStreak30 : false;
    achievements[item.id] = {unlockedAt:event.at, awardEventId:event.id, tier:item.tier, xp:legacyPaid ? 0 : item.xp};
    bonus += legacyPaid ? 0 : item.xp;
    unlocked.push(item.id);
  }
  const xpDelta = ordinaryApplied+bonus;
  day.bonusXp = number(day.bonusXp)+bonus;
  state.xp = number(state.xp)+xpDelta;
  const info = levelInfo(state.xp);
  state.level = info.level; state.levelName = info.name; state.version = 2;
  const reasons = [loginApplied ? 'daily_login' : null, sourceApplied ? event.source === 'focus' ? 'verified_focus_minutes' : 'ten_distinct_active_cards' : null, goalApplied ? 'verified_daily_goal' : null, ...unlocked.map(id=>`achievement:${id}`)].filter(Boolean);
  if(!xpDelta) reasons.push(event.source==='focus' && event.duration<300 ? 'focus_minimum_not_met' : 'no_new_reward_or_cap_reached');
  return {state,day,result:{eventId:event.id,source:event.source,dayKey:day.dayKey,xpDelta,ordinaryXp:ordinaryApplied,bonusXp:bonus,goalXp:goalApplied,loginXp:loginApplied,reasons,unlocked,totalXp:state.xp,level:state.level,sourceXp:sourceApplied,capReached:event.source === 'focus' ? day.focusXp >= 80 || day.ordinaryXp >= 180 : event.source === 'recall' ? day.recallXp >= 30 || day.ordinaryXp >= 180 : day.ordinaryXp >= 180,status:'processed'}};
}
module.exports = {catalogue,number,threshold,levelInfo,freshDay,evaluate,dayKey};
