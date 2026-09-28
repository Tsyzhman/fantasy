import { expect, test as setup } from "@playwright/test";

const authStatePath = "output/playwright-auth/qa-user.json";

setup("authenticate the dedicated beta QA user", async ({ page }) => {
  const email = requiredEnvironmentValue("BETA_QA_EMAIL");
  const password = requiredEnvironmentValue("BETA_QA_PASSWORD");

  await page.goto("/login?next=/machete/squad");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Squad builder|Конструктор состава/i })).toBeVisible();
  await page.context().storageState({ path: authStatePath });
});

function requiredEnvironmentValue(name: "BETA_QA_EMAIL" | "BETA_QA_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for authenticated browser checks.`);
  return value;
}
