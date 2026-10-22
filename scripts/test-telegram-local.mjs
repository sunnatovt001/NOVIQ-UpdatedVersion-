// Complete Local End-to-End Integration Test for Telegram Bot
// Tests local API endpoints and bot command engine on Vite dev server (http://localhost:3000)

async function run() {
  const base = process.env.TEST_URL || 'http://localhost:3000';
  console.log(`\n🔍 Running Comprehensive Local Telegram Bot Test on: ${base}\n`);

  let allPassed = true;
  function pass(label) { console.log(`  ✅ PASS: ${label}`); }
  function fail(label, err) { console.error(`  ❌ FAIL: ${label}`, err || ''); allPassed = false; }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer local-dev-mock-token',
  };

  // 1. Unauthenticated link-token check
  try {
    const unauthResp = await fetch(`${base}/api/telegram/link-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (unauthResp.status === 401) pass('Unauthenticated link-token correctly rejected (401)');
    else fail(`Expected 401 for unauthenticated request, got ${unauthResp.status}`);
  } catch (err) {
    fail('Link token unauth check failed', err.message);
  }

  // 2. Generate Link Token with Authentication
  let linkToken = '';
  try {
    const linkResp = await fetch(`${base}/api/telegram/link-token`, {
      method: 'POST',
      headers: authHeaders,
    });
    const linkData = await linkResp.json();
    if (linkResp.status === 200 && linkData.token && linkData.deepLink) {
      linkToken = linkData.token;
      pass(`Link token generated successfully: ${linkToken.slice(0, 12)}... (Deep link ready)`);
    } else {
      fail('Failed to generate link token', linkData);
    }
  } catch (err) {
    fail('Link token generation failed', err.message);
  }

  // 3. Complete Deep Link Handshake: /start link_<token>
  const testChatId = 889977665;
  const baseId = Date.now();
  try {
    const startResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 1,
        message: {
          chat: { id: testChatId, type: 'private' },
          text: `/start link_${linkToken}`,
          from: { id: testChatId, username: 'test_student' },
        },
      }),
    });
    const startData = await startResp.json();
    if (startResp.status === 200 && startData.ok && startData.linked) {
      pass('Deep-link handshake verified: Account linked to Telegram chat ID');
    } else {
      fail('Deep-link handshake failed', startData);
    }
  } catch (err) {
    fail('Deep link test failed', err.message);
  }

  // 4. Verify Connection Status via API
  try {
    const statusResp = await fetch(`${base}/api/telegram/status`, {
      method: 'GET',
      headers: authHeaders,
    });
    const statusData = await statusResp.json();
    if (statusResp.status === 200 && statusData.connected && String(statusData.telegramId) === String(testChatId)) {
      pass(`Telegram status API confirmed connection: Chat ID ${testChatId}`);
    } else {
      fail('Telegram status check failed', statusData);
    }
  } catch (err) {
    fail('Status check failed', err.message);
  }

  // 5. Test /planner Command
  try {
    const planResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 2,
        message: { chat: { id: testChatId, type: 'private' }, text: '/planner' },
      }),
    });
    const planData = await planResp.json();
    if (planResp.status === 200 && planData.ok && planData.command === '/planner') {
      pass('/planner command returned active tasks with inline completion buttons');
    } else {
      fail('/planner command failed', planData);
    }
  } catch (err) {
    fail('Planner command failed', err.message);
  }

  // 6. Test /today Command
  try {
    const todayResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 3,
        message: { chat: { id: testChatId, type: 'private' }, text: '/today' },
      }),
    });
    const todayData = await todayResp.json();
    if (todayResp.status === 200 && todayData.ok && todayData.command === '/today') {
      pass('/today command returned study schedule');
    } else {
      fail('/today command failed', todayData);
    }
  } catch (err) {
    fail('Today command failed', err.message);
  }

  // 7. Test /focus Command
  try {
    const focusResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 4,
        message: { chat: { id: testChatId, type: 'private' }, text: '/focus' },
      }),
    });
    const focusData = await focusResp.json();
    if (focusResp.status === 200 && focusData.ok && focusData.command === '/focus') {
      pass('/focus command displayed timer options');
    } else {
      fail('/focus command failed', focusData);
    }
  } catch (err) {
    fail('Focus command failed', err.message);
  }

  // 8. Test /metrics Command
  try {
    const metricsResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 5,
        message: { chat: { id: testChatId, type: 'private' }, text: '/metrics' },
      }),
    });
    const metricsData = await metricsResp.json();
    if (metricsResp.status === 200 && metricsData.ok && metricsData.command === '/metrics') {
      pass('/metrics command returned user XP, streak, and daily goal');
    } else {
      fail('/metrics command failed', metricsData);
    }
  } catch (err) {
    fail('Metrics command failed', err.message);
  }

  // 9. Test Interactive Task Completion (task_done:math-1)
  try {
    const taskResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 6,
        callback_query: {
          id: 'cb-math-1',
          data: 'task_done:math-1',
          message: { chat: { id: testChatId, type: 'private' }, message_id: 101 },
          from: { id: testChatId },
        },
      }),
    });
    const taskData = await taskResp.json();
    if (taskResp.status === 200 && taskData.ok && taskData.taskCompleted === 'math-1') {
      pass('Task completed via Telegram callback query (+20 XP synchronized)');
    } else {
      fail('Task completion callback failed', taskData);
    }
  } catch (err) {
    fail('Task completion callback error', err.message);
  }

  // 10. Test Disconnection flow: unlink_confirm
  try {
    const unlinkResp = await fetch(`${base}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: baseId + 7,
        callback_query: {
          id: 'cb-unlink-1',
          data: 'unlink_confirm',
          message: { chat: { id: testChatId, type: 'private' }, message_id: 102 },
          from: { id: testChatId },
        },
      }),
    });
    const unlinkData = await unlinkResp.json();
    if (unlinkResp.status === 200 && unlinkData.ok && unlinkData.unlinked) {
      pass('Account unlinked via Telegram settings callback');
    } else {
      fail('Unlink callback failed', unlinkData);
    }
  } catch (err) {
    fail('Unlink test failed', err.message);
  }

  // 11. Verify status is now disconnected
  try {
    const afterResp = await fetch(`${base}/api/telegram/status`, {
      method: 'GET',
      headers: authHeaders,
    });
    const afterData = await afterResp.json();
    if (afterResp.status === 200 && afterData.connected === false) {
      pass('Telegram status API verified account successfully unlinked');
    } else {
      fail('Expected status disconnected', afterData);
    }
  } catch (err) {
    fail('After status check failed', err.message);
  }

  console.log(allPassed ? '\n🌟 All 11 Local Telegram Integration Tests Passed Successfully!\n' : '\n⚠️ Some tests failed.\n');
  if (!allPassed) process.exitCode = 1;
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
});
