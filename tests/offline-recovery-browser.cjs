const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const events = [];
  page.on("close", () => events.push("page:close"));
  page.on("crash", () => events.push("page:crash"));
  page.on("pageerror", (error) => events.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") events.push(`console:${message.text()}`);
  });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:4180/?testUser=1#/profile", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("No pending cloud changes", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Import pending changes", exact: true }).count(),
      1,
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "noviq:offlineSyncQueue:v1",
        JSON.stringify([
          {
            id: "set:users/isolated-browser-user/notes/offline",
            userId: "isolated-browser-user",
            path: ["users", "isolated-browser-user", "notes", "offline"],
            kind: "set",
            data: { title: "Retained offline note" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attempts: 0,
            status: "pending",
          },
        ]),
      );
    });

    await page.goto("http://127.0.0.1:4180/?testUser=1#/planner", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("1 changes saved on this device", { exact: false }).waitFor();
    await page.locator('[aria-label="Cloud sync recovery"] summary').click();

    const exportButton = page.getByRole("button", {
      name: "Export pending changes",
      exact: true,
    });
    assert.equal(await exportButton.count(), 1);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      exportButton.click(),
    ]);
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const backup = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.equal(backup.operations.length, 1);
    assert.equal(backup.operations[0].data.title, "Retained offline note");
    assert.deepEqual(events, []);
    console.log("PASS offline recovery exports the pending operation");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
