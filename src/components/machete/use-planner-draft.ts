"use client";
/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { FantasySquadRoundPlan } from "@/machete/squad_logic";
import { localizedText } from "@/components/localized-option";
import { parsePlannerDraft, writePlannerDraft } from "./planner-draft";
import { fantasyRoundPlansFingerprint } from "./planner-squad-commands";
export function usePlannerDraft({ draftKey, roundIds, previousRoundIds, publicationId, language, savedRoundPlans, roundPlans, horizon, activeRoundOffset, transferBaselinePlayerIds, openingFreeTransfers,
  setRoundPlans, setHorizon, setActiveRoundOffset, setTransferBaselinePlayerIds, setOpeningFreeTransfers, setMessage }: {
  draftKey: string; roundIds: string[]; previousRoundIds?: string[]; publicationId: string | null; language: "en" | "ru"; savedRoundPlans: FantasySquadRoundPlan[]; roundPlans: FantasySquadRoundPlan[];
  horizon: number; activeRoundOffset: number; transferBaselinePlayerIds: string[]; openingFreeTransfers: number | null;
  setRoundPlans: Dispatch<SetStateAction<FantasySquadRoundPlan[]>>; setHorizon: Dispatch<SetStateAction<number>>;
  setActiveRoundOffset: Dispatch<SetStateAction<number>>; setTransferBaselinePlayerIds: Dispatch<SetStateAction<string[]>>;
  setOpeningFreeTransfers: Dispatch<SetStateAction<number | null>>; setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const draftRestored = useRef<string | null>(null);
  const [draftReady, setDraftReady] = useState<string | null>(null);
  useEffect(() => {
    if (draftRestored.current === draftKey) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      draftRestored.current = draftKey;
      try {
        const draft = parsePlannerDraft(sessionStorage.getItem(draftKey), fantasyRoundPlansFingerprint(savedRoundPlans), Date.now(),
          publicationId ? { id: publicationId, roundIds, previousRoundIds, saved: savedRoundPlans } : undefined);
        if (draft) {
          setRoundPlans(draft.roundPlans); setHorizon(draft.horizon); setActiveRoundOffset(draft.activeRoundOffset);
          if (!publicationId) {
            setTransferBaselinePlayerIds(draft.transferBaselinePlayerIds); setOpeningFreeTransfers(draft.openingFreeTransfers);
          }
          setMessage(localizedText(language, "Unsaved squad draft restored.", "Восстановлен несохранённый черновик состава."));
        }
      } catch { /* Restricted storage keeps the in-memory editor usable. */ }
      setDraftReady(draftKey);
    });
    return () => { cancelled = true; };
  }, [draftKey, roundIds, previousRoundIds, publicationId, language, savedRoundPlans, setRoundPlans, setHorizon, setActiveRoundOffset, setTransferBaselinePlayerIds, setOpeningFreeTransfers, setMessage]);
  useEffect(() => {
    if (draftReady !== draftKey) return;
    const persist = () => {
      try {
        const baseline = fantasyRoundPlansFingerprint(savedRoundPlans);
        writePlannerDraft(sessionStorage, draftKey, fantasyRoundPlansFingerprint(roundPlans) === baseline ? null : {
          version: 1, roundIds, publicationId, updatedAt: Date.now(), baseline, roundPlans, horizon, activeRoundOffset, transferBaselinePlayerIds, openingFreeTransfers,
        });
      } catch { /* Quota errors must not interrupt editing. */ }
    };
    persist(); window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [draftReady, draftKey, roundIds, publicationId, savedRoundPlans, roundPlans, horizon, activeRoundOffset, transferBaselinePlayerIds, openingFreeTransfers]);
}
