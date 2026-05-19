import type { ReactNode } from "react";

import { MacheteSyncStatusBanner } from "@/components/machete/MacheteSyncStatusBanner";

export default function MacheteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MacheteSyncStatusBanner />
      {children}
    </>
  );
}
