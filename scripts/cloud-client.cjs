const path = require('node:path');
const fs = require('node:fs');
module.exports = async (cliPath) => {
  const cli = path.resolve(cliPath);
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8'));
  const auth = require(path.join(cli,'lib/auth.js'));
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('Firebase CLI login required');
  await require(path.join(cli,'lib/requireAuth.js')).requireAuth({project:config.projectId,...account});
  const {Client} = require(path.join(cli,'lib/apiv2.js'));
  const api = require(path.join(cli,'lib/api.js'));
  const {Firestore} = require('../functions/node_modules/@google-cloud/firestore');
  const credentials = {type:'authorized_user',client_id:api.clientId(),client_secret:api.clientSecret(),refresh_token:account.tokens.refresh_token};
  return {config,cli,Client,db:new Firestore({projectId:config.projectId,databaseId:config.firestoreDatabaseId,credentials}),credentials};
};
