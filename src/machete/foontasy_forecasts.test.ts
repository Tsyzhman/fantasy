import assert from "node:assert/strict";
import test from "node:test";

import { parseFoontasyRound, responseCookieHeader } from "@/machete/foontasy_forecasts";

test("Foontasy round parser recognizes the Russian tour heading without source-encoding ambiguity", () => {
  assert.equal(parseFoontasyRound("<h3>3 тур</h3>"), 3);
});

test("new Foontasy session cookies replace pre-login values", () => {
  const signin = new Response(null, { headers: { "set-cookie": "session=old; Path=/" } });
  const login = new Response(null, { headers: { "set-cookie": "session=new; Path=/" } });
  assert.equal(responseCookieHeader(signin, login), "session=new");
});
