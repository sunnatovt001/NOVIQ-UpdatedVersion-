const fs = require('node:fs');
(async()=>{
  const {config,Client,db} = await require('./cloud-client.cjs')(process.argv[2]);
  const billing = new Client({urlPrefix:'https://cloudbilling.googleapis.com',auth:true});
  const info = (await billing.get(`/v1/projects/${config.projectId}/billingInfo`)).body;
  const users = (await db.collection('users').count().get()).data().count;
  const env = fs.readFileSync('functions/.env','utf8');
  const value = key => env.match(new RegExp(`^${key}\\s*=\\s*(.*)$`,'m'))?.[1]?.trim().replace(/^['"]|['"]$/g,'') || '';
  const present = key => !!value(key) && !/replace|placeholder|your_|example/i.test(value(key));
  console.log(JSON.stringify({billingEnabled:info.billingEnabled,userCount:users,serverKeyConfigured:present('GEMINI_API_KEY'),telegramKeyConfigured:present('TELEGRAM_BOT_TOKEN'),telegramWebhookConfigured:present('TELEGRAM_WEBHOOK_SECRET'),region:value('FUNCTIONS_REGION')||'us-central1'}));
  await db.terminate();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
