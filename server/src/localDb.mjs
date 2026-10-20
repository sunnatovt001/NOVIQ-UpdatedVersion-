import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const localDb = require('./localDb.cjs');

export const getLocalDb = localDb.getLocalDb;
export const STORE_FILE = localDb.STORE_FILE;
export const seedDefaultLocalData = localDb.seedDefaultLocalData;
