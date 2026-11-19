// @spec spec://modules/agents/FEAT-016-personal-agent-api#acceptance
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// The workflow logs in with the dedicated QA account before this script starts.
const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL);
const userAgent = process.env.PLAYWRIGHT_USER_AGENT || "fantasy-production-browser-smoke/agent-api";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: baseURL.origin, userAgent, storageState: "output/playwright-auth/qa-user.json" });
  const page = await context.newPage();
  await page.goto("/profile");
  const section = page.locator('section[aria-labelledby="agent-key-heading"]');
  const urlField = section.getByText(new URL("/api/mcp", baseURL).href, { exact: true });
  await urlField.waitFor();
  const mcpURL = new URL(await urlField.innerText());
  await section.getByRole("button", { name: /^(New key|Новый ключ)$/ }).click();
  const readPermission = section.getByRole("checkbox", { name: /^(Read squads|Читать составы)$/ });
  if (!await readPermission.isChecked()) throw new Error("The profile did not select squad reading by default.");

  // Issue the key through the same profile endpoint, keeping the secret out of the DOM and browser evidence.
  const profileKeys = "/api/profile/agent-keys";
  const profileHeaders = { Origin: baseURL.origin };
  const issued = await context.request.post(profileKeys, {
    headers: profileHeaders,
    data: { name: "Agent connection check " + randomUUID(), scopes: ["squads:read"], expiresAt: new Date(Date.now() + 300_000).toISOString() },
    maxRedirects: 0
  });
  if (issued.status() !== 201) throw new Error("Profile key issuance returned HTTP " + issued.status());
  const { key, secret } = await issued.json();
  const headers = { Authorization: "Bearer " + secret, "User-Agent": userAgent };
  const catalogURL = new URL("/api/v1/agent/tools", mcpURL);
  const client = new Client({ name: "fantasy-production-smoke", version: "1.0.0" });
  try {
    const catalog = await fetch(catalogURL, { headers, redirect: "error" });
    if (catalog.status !== 200) throw new Error("HTTP tool discovery returned " + catalog.status);
    const httpNames = (await catalog.json()).tools.map(tool => tool.name).sort();
    await client.connect(new StreamableHTTPClientTransport(mcpURL, { requestInit: { headers, redirect: "error" } }));
    const mcpNames = (await client.listTools()).tools.map(tool => tool.name).sort();
    if (!mcpNames.includes("squads_list") || mcpNames.includes("squads_save") || JSON.stringify(mcpNames) !== JSON.stringify(httpNames)) {
      throw new Error("MCP and HTTP must expose the same read-only squad tools.");
    }
    const read = await client.callTool({ name: "squads_list", arguments: { limit: 1 } });
    if (read.isError || !Array.isArray(read.structuredContent?.result?.items)) throw new Error("The MCP squad read failed.");
    console.log("Verified the profile URL, read-only HTTP and MCP catalogs, and a real MCP squad read.");
  } finally {
    try {
      await client.close();
    } finally {
      const revoked = await context.request.delete(profileKeys + "/" + encodeURIComponent(key.id), { headers: profileHeaders, maxRedirects: 0 });
      if (revoked.status() !== 204) throw new Error("QA key revocation returned HTTP " + revoked.status());
    }
  }
  const revokedAccess = await fetch(catalogURL, { headers, redirect: "error" });
  if (revokedAccess.status !== 401) throw new Error("The revoked QA key was still accepted.");
  console.log("Verified that revoking the temporary QA key returns HTTP 401 on the next request.");
} finally {
  await browser.close();
}
