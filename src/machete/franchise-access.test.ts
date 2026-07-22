import assert from "node:assert/strict";
import test from "node:test";

import { UserFranchise, UserRole } from "@prisma/client";

import { canSwitchFranchise, resolveVisibleFranchise } from "./franchise-access";

test("ordinary users cannot override their franchise through a query parameter", () => {
  const user = { role: UserRole.USER, franchise: UserFranchise.MACHETE };
  assert.equal(resolveVisibleFranchise(user, UserFranchise.BALTIKA), UserFranchise.MACHETE);
  assert.equal(canSwitchFranchise(user), false);
});

test("admins can switch between both franchises", () => {
  const admin = { role: UserRole.ADMIN, franchise: UserFranchise.MACHETE };
  assert.equal(resolveVisibleFranchise(admin, UserFranchise.BALTIKA), UserFranchise.BALTIKA);
  assert.equal(resolveVisibleFranchise(admin, UserFranchise.MACHETE), UserFranchise.MACHETE);
  assert.equal(canSwitchFranchise(admin), true);
});

test("an unassigned ordinary user gets no franchise data", () => {
  assert.equal(resolveVisibleFranchise({ role: UserRole.USER, franchise: null }, UserFranchise.MACHETE), null);
});
