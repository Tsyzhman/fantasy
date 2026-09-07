"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KhlEntry, KhlSquad } from "@/khl/contracts";
import type { optimizeKhl } from "@/khl/optimizer";

export function useKhlOptimizer() {
  const worker = useRef<Worker | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const cancel = useCallback(() => { abort.current?.abort(); abort.current = null; worker.current?.terminate(); worker.current = null; setRunning(false); }, []);
  useEffect(() => () => { abort.current?.abort(); worker.current?.terminate(); }, []);
  async function run(contestId: string, weekId: string, squad: KhlSquad | null, apply: (entries: KhlEntry[], bank: number) => void, message: (value: string) => void, horizonWeeks = 1) {
    cancel();
    if (!squad) { message("Сначала сохраните план."); return; }
    const controller = new AbortController(); abort.current = controller; setRunning(true);
    const body = { contestId, weekId, squadId: squad.id, expectedVersion: squad.revision, horizonWeeks };
    async function request(payload: object) {
      const r = await fetch("/api/machete/khl/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(payload) });
      const json = await r.json(); if (!r.ok) throw new Error(json.error?.message ?? "Ошибка подбора"); return json.data;
    }
    try {
      const prepared = await request(body);
      if (controller.signal.aborted) return;
      const instance = new Worker(new URL("../../khl/optimizer.worker.ts", import.meta.url)); worker.current = instance;
      const result = await new Promise<ReturnType<typeof optimizeKhl>>((resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
        instance.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
        instance.onerror = () => reject(new Error("Ошибка рабочего процесса подбора"));
        instance.postMessage(prepared.input);
      });
      instance.terminate(); if (worker.current === instance) worker.current = null;
      if (!result.players) throw new Error(`Подбор: ${result.status}`);
      const checked = await request({ ...body, dataRevision: prepared.dataRevision, weekRevision: prepared.weekRevision, proposal: result.players.map(p => p.id) });
      if (controller.signal.aborted) return;
      apply(checked.entries, checked.bankUnits);
      message(`Локальный подбор: ${result.status}; оптимальность ${result.optimality === "proven" ? "доказана" : "не доказана"}. EP ${result.score?.toFixed(2)}. ${checked.eligibility === "CONDITIONAL_DRAFT" ? "Внешний баланс не подтверждён, это условный черновик." : "План проверен на текущем снимке."}`);
    } catch (e) { if (!controller.signal.aborted) message(e instanceof Error ? e.message : "Ошибка подбора"); }
    finally { if (abort.current === controller) cancel(); }
  }
  return { run, cancel, running };
}
