import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DatabaseSetupNotice } from "./database-setup-notice";

test("DatabaseSetupNotice renders local database setup commands", () => {
  const html = renderToStaticMarkup(React.createElement(DatabaseSetupNotice));

  assert.match(html, /Database is not configured/);
  assert.match(html, /DATABASE_URL/);
  assert.match(html, /docker compose up -d postgres/);
  assert.match(html, /npm run dev/);
});
