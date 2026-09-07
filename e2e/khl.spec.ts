import { test, expect } from "@playwright/test";
test("KHL 17 active slots and bounded mobile layout", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true", "Requires explicitly seeded local KHL test contest");
  await page.goto(`/machete/khl/squad?contestId=${process.env.KHL_E2E_CONTEST_ID}&new=1`);
  await expect(page.getByRole("heading", { name: /Fantasy КХЛ/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Позиция", exact: true }).selectOption("ALL");
  await expect(page.getByLabel("Хоккейный состав, все 17 активны")).toBeVisible();
  await expect(page.getByText(/свободное место/)).toHaveCount(17);
  await expect(page.getByRole("button", { name: "Сохранить план" })).toBeEnabled();
  await page.getByRole("textbox", { name: "Название варианта" }).fill(`${testInfo.project.name}-${Date.now()}`);
  await expect(page.getByRole("button", { name: /captain|bench/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  await expect(page.getByText("Сохранить в подборе", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Сохранить план" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Локальный вариант сохранён" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Сохранить в подборе", { exact: true })).toHaveCount(1);
  for (const [position, remaining] of [["G", 1], ["D", 6], ["F", 9]] as const) {
    await page.getByRole("combobox", { name: "Позиция", exact: true }).selectOption(position);
    for (let i = 0; i < remaining; i++) await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  }
  await expect(page.getByText("Сохранить в подборе", { exact: true })).toHaveCount(17);
  await expect(page.getByText(/свободное место/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `output/playwright-khl/${testInfo.project.name}.png`, fullPage: true });
});

test("50 KHL and FPL transitions retain bounded browser memory", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true" || testInfo.project.name !== "khl-1440", "One navigation resource run");
  test.setTimeout(180000);
  await page.goto("/machete/khl/squad?contestId=khl-e2e&new=1");
  async function transition() {
    await page.getByRole("link", { name: "FPL", exact: true }).first().click();
    await expect(page.locator("[data-fantasy-squad-planner]")).toHaveCount(1);
    await page.getByRole("link", { name: /^(КХЛ|KHL)$/ }).first().click();
    await expect(page.getByRole("heading", { name: /Fantasy КХЛ/ })).toBeVisible();
  }
  // Heap snapshots show ~900 KiB of V8 code/bytecode compilation during the
  // first 55 cycles. Measure a separate 50-cycle window after that warm-up;
  // DOM and listener counts also catch retained mounted trees/subscriptions.
  for (let i = 0; i < 55; i++) await transition();
  const cdp = await page.context().newCDPSession(page);
  async function retainedDataBytes() {
    const chunks: string[] = [];
    const receive = ({ chunk }: { chunk: string }) => chunks.push(chunk);
    cdp.on("HeapProfiler.addHeapSnapshotChunk", receive);
    try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
    finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", receive); }
    const snapshot = JSON.parse(chunks.join(""));
    const fields: string[] = snapshot.snapshot.meta.node_fields;
    const types: string[] = snapshot.snapshot.meta.node_types[fields.indexOf("type")];
    let bytes = 0;
    for (let offset = 0; offset < snapshot.nodes.length; offset += fields.length) {
      const type = types[snapshot.nodes[offset + fields.indexOf("type")]];
      // V8 progressively compiles the large football planner during navigation.
      // Count retained JS data/closures/arrays, separately from JIT code and
      // browser-native storage. DOM/listener assertions cover mounted UI leaks.
      if (type !== "code" && type !== "native") bytes += snapshot.nodes[offset + fields.indexOf("self_size")];
    }
    return bytes;
  }
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("HeapProfiler.collectGarbage"); const before = await cdp.send("Runtime.getHeapUsage");
  const domBefore = await cdp.send("Memory.getDOMCounters");
  const dataBefore = await retainedDataBytes();
  for (let i = 0; i < 50; i++) await transition();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("HeapProfiler.collectGarbage"); const after = await cdp.send("Runtime.getHeapUsage");
  const domAfter = await cdp.send("Memory.getDOMCounters");
  const dataAfter = await retainedDataBytes();
  console.log(JSON.stringify({ navigationHeapBefore: before.usedSize, navigationHeapAfter: after.usedSize, retainedDataBefore: dataBefore, retainedDataAfter: dataAfter, domBefore, domAfter }));
  expect(dataAfter / dataBefore).toBeLessThanOrEqual(1.1);
  expect(domAfter.documents).toBe(domBefore.documents);
  expect(domAfter.nodes).toBeLessThanOrEqual(domBefore.nodes);
  expect(domAfter.jsEventListeners).toBeLessThanOrEqual(domBefore.jsEventListeners);
  await cdp.detach();
});
test("KHL filters retain selected players after 50 interactions", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true" || testInfo.project.name !== "khl-1440", "One desktop resource run");
  await page.goto(`/machete/khl/squad?contestId=${process.env.KHL_E2E_CONTEST_ID}&new=1`);
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  const search = page.getByRole("textbox", { name: "Поиск игрока" });
  for (let i = 0; i < 10; i++) { await search.fill("нет совпадений"); await search.fill(""); }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Runtime.getHeapUsage");
  for (let i = 0; i < 50; i++) { await search.fill("нет совпадений"); await search.fill(""); }
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Runtime.getHeapUsage");
  await expect(page.getByText("Сохранить в подборе", { exact: true })).toHaveCount(1);
  expect(after.usedSize / before.usedSize).toBeLessThanOrEqual(1.1);
  console.log(JSON.stringify({ khlFilterHeapBefore: before.usedSize, khlFilterHeapAfter: after.usedSize }));
  await cdp.detach();
});

test("KHL details, calendar, preferences and worker lifecycle", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true" || testInfo.project.name !== "khl-1440", "One desktop integration run");
  test.setTimeout(180000);
  await page.goto("/machete/khl/squad?contestId=khl-e2e&new=1");
  await page.getByRole("textbox", { name: "Название варианта" }).fill(`worker-${Date.now()}`);
  for (const [position, count] of [["G", 2], ["D", 6], ["F", 9]] as const) {
    await page.getByRole("combobox", { name: "Позиция", exact: true }).selectOption(position);
    for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  }
  await page.getByRole("spinbutton", { name: "Банк локального варианта" }).fill("11500");
  await page.getByRole("button", { name: "Сохранить план" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Локальный вариант сохранён" })).toBeVisible();
  const workers = new Set(); let maximum = 0;
  page.on("worker", worker => { workers.add(worker); maximum = Math.max(maximum, workers.size); worker.on("close", () => workers.delete(worker)); });
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Подобрать состав", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Локальный подбор:" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Подобрать состав", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Сохранить план" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Локальный вариант сохранён" })).toBeVisible();
  }
  await cdp.send("HeapProfiler.collectGarbage"); const before = await cdp.send("Runtime.getHeapUsage");
  for (let i = 0; i < 50; i++) {
    const request = page.waitForResponse(r => r.url().endsWith("/optimize") && r.request().postData()?.includes('"proposal"') === true);
    await page.getByRole("button", { name: "Подобрать состав", exact: true }).click();
    expect((await request).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Подобрать состав", exact: true })).toBeEnabled();
  }
  await expect.poll(() => workers.size).toBe(0); expect(maximum).toBeLessThanOrEqual(1);
  await cdp.send("HeapProfiler.collectGarbage"); const after = await cdp.send("Runtime.getHeapUsage");
  expect(after.usedSize / before.usedSize).toBeLessThanOrEqual(1.1);
  console.log(JSON.stringify({ workerHeapBefore: before.usedSize, workerHeapAfter: after.usedSize, maximumWorkers: maximum }));
  await cdp.detach();
  await page.getByRole("combobox", { name: "Открыть карточку игрока" }).selectOption("khl-e2e-8");
  await page.getByRole("button", { name: "История матчей", exact: true }).click();
  await expect(page.getByText(/FP 18 · TEST_FIXTURE/)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await page.getByRole("button", { name: "Сохранить настройки вида" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Фильтры и сравнение сохранены" })).toBeVisible();
  await page.getByRole("link", { name: "Календарь", exact: true }).click();
  await expect(page.getByRole("region", { name: "Матчи недели" }).locator("article")).toHaveCount(7);
});

test("cancel terminates an active KHL worker without applying its proposal", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true" || testInfo.project.name !== "khl-1440", "One worker cancellation run");
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) { setTimeout(() => super.postMessage(message), 1000); }
    };
  });
  await page.goto("/machete/khl/squad?contestId=khl-e2e&new=1");
  const squad = await page.evaluate(async () => {
    const r = await fetch("/api/machete/khl/squads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contestId: "khl-e2e", name: `cancel-${Date.now()}`, mode: "DRAFT", bankUnits: 11500, entries: Array.from({ length: 17 }, (_, i) => ({ id: `khl-e2e-${i}`, keepForOptimizer: false })) }) });
    if (!r.ok) throw new Error(await r.text()); return (await r.json()).data;
  });
  await page.goto(`/machete/khl/squad?contestId=khl-e2e&squadId=${squad.id}`);
  const created = page.waitForEvent("worker");
  await page.getByRole("button", { name: "Подобрать состав", exact: true }).click();
  const worker = await created;
  const closed = new Promise<void>(resolve => worker.once("close", () => resolve()));
  await page.getByRole("button", { name: "Отменить подбор", exact: true }).click();
  await closed;
  await expect(page.getByRole("button", { name: "Подобрать состав", exact: true })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Локальный подбор:" })).toHaveCount(0);
  await expect(page.getByText("Сохранить в подборе", { exact: true })).toHaveCount(17);
});
