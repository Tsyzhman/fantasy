import { UserFranchise, UserRole } from "@prisma/client";

type FranchiseAccessUser = {
  role: UserRole;
  franchise: UserFranchise | null;
};

export function resolveVisibleFranchise(user: FranchiseAccessUser, requestedFranchise: string | undefined) {
  if (user.role !== UserRole.ADMIN) return user.franchise;
  if (requestedFranchise === UserFranchise.BALTIKA) return UserFranchise.BALTIKA;
  if (requestedFranchise === UserFranchise.MACHETE) return UserFranchise.MACHETE;
  return user.franchise ?? UserFranchise.MACHETE;
}

export function canSwitchFranchise(user: FranchiseAccessUser) {
  return user.role === UserRole.ADMIN;
}
