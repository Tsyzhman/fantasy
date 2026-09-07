import type { ReactNode } from "react";
import { headers } from "next/headers";

import { MacheteSyncStatusBanner } from "@/components/machete/MacheteSyncStatusBanner";

export default async function MacheteLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  return (
    <>
      {!pathname.startsWith("/machete/khl/") && <MacheteSyncStatusBanner />}
      {children}
    </>
  );
}
