import catalogue from '../../functions/xp-catalog.json';

export const LEVELS = catalogue.levels;
export const ACHIEVEMENTS = catalogue.achievements;
const legendSuffix = (value: number) => {
  if (value > 3999) return String(value);
  let result = '';
  for (const [amount, text] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']] as const) {
    while (value >= amount) { result += text; value -= amount; }
  }
  return result;
};
export const levelThreshold = (level: number) => {
  if (level <= 10) return LEVELS[Math.max(0, level - 1)].minXp;
  const n = level - 10;
  return 5000 + 1200 * n + 50 * n * (n - 1);
};
export const calculateLevelInfo = (value: number) => {
  const xp = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (xp < 5000) return LEVELS.reduce((a, b) => xp >= b.minXp ? b : a, LEVELS[0]);
  const n = Math.max(0, Math.floor((-1150 + Math.sqrt(1150 ** 2 + 200 * (xp - 5000))) / 100));
  return { level: 10 + n, minXp: levelThreshold(10 + n), name: n ? `Academic Legend ${legendSuffix(n + 1)}` : 'Academic Legend' };
};
export const calculateLevel = (xp: number) => calculateLevelInfo(xp).level;
export const calculateLevelName = (xp: number) => calculateLevelInfo(xp).name;
export const levelProgress = (value: number) => {
  const xp = Number.isFinite(value) ? Math.max(0, value) : 0;
  const current = calculateLevelInfo(xp), nextXp = levelThreshold(current.level + 1);
  const earned = xp - current.minXp, required = nextXp - current.minXp;
  return { ...current, xp, nextXp, earned, required, remaining: nextXp - xp, percent: Math.min(100, earned / required * 100) };
};
