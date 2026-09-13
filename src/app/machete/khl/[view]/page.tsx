/** @spec spec://modules/khl/FEAT-001-khl-module-and-rules#navigation */
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { KhlSquadPlanner, type KhlViewPreferences } from "@/components/khl/KhlSquadPlanner";
import { khlEnabled } from "@/server/khl/access";
import { hydratePlayers } from "@/server/khl/read-model";
export const dynamic = "force-dynamic";
export default async function KhlPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<{ contestId?: string; squadId?: string; new?: string }> }) {
  if (!khlEnabled()) notFound();
  const user = await requireCurrentUser();
  const { view } = await params;
  if (view !== "squad" && view !== "players" && view !== "calendar") notFound();
  const query = await searchParams;
  const contests = await prisma.khlContest.findMany({ include: { season: true }, take: 100, orderBy: { id: "asc" } });
  const contest = query.contestId ? contests.find(c => c.id === query.contestId) : contests[0];
  if (query.contestId && !contest) notFound();
  if (!contest) return <MacheteShell compact><section className="py-6"><h1 className="text-2xl font-bold">Fantasy КХЛ</h1><p className="mt-3">Турнир ещё не импортирован. Каталог и календарь появятся после проверки сезона и загрузки источников.</p></section></MacheteShell>;
  const [players, weeks, preferences, squad, protocolSource] = await Promise.all([
    prisma.khlFantasyPlayer.findMany({ where: { contestId: contest.id }, orderBy: { id: "asc" }, take: 1000 }),
    prisma.khlFantasyWeek.findMany({ where: { contestId: contest.id }, orderBy: { providerWeekId: "asc" }, take: 100 }),
    prisma.khlUserViewPreference.findUnique({ where: { userId_contestId_viewKey: { userId: user.id, contestId: contest.id, viewKey: "planner" } } }),
    query.squadId ? prisma.khlUserSquad.findFirst({ where: { id: query.squadId, userId: user.id, contestId: contest.id }, include: { baseline: true, entries: { orderBy: { slotIndex: "asc" } } } }) : query.new === "1" ? null : prisma.khlUserSquad.findFirst({ where: { userId: user.id, contestId: contest.id }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { baseline: true, entries: { orderBy: { slotIndex: "asc" } } } }),
    prisma.khlSourceContract.findUnique({ where: { provider: "KHL_PROTOCOL" } })
  ]);
  if (query.squadId && !squad) notFound();
  const protocolError = (protocolSource?.coverage as { accessError?: string } | null)?.accessError;
  const protocolNotice = protocolError ? `Автообновление протоколов приостановлено${protocolError.includes("HTTP_403") ? ": КХЛ блокирует запросы сервера" : ": источник недоступен"}. Показаны сохранённые данные.` : undefined;
  const hydrated = await hydratePlayers(prisma, players);
  const baselineIds = Array.isArray(squad?.baseline?.entries) ? squad.baseline.entries as string[] : [];
  const holdings = hydrated.filter(p => baselineIds.includes(p.id));
  const capitalUnits = squad?.baseline && holdings.length === 17 && holdings.every(p => p.price.value !== null) ? squad.baseline.bankUnits + holdings.reduce((n, p) => n + p.price.value!, 0) : 20000;
  return <MacheteShell compact><KhlSquadPlanner key={`${user.id}:${contest.id}:${squad?.id ?? "new"}`} contestId={contest.id} season={contest.season.label} protocolNotice={protocolNotice} initialPreferences={preferences?.schemaVersion === 1 ? preferences.preferences as KhlViewPreferences : {}} players={hydrated} weeks={weeks.map(w => ({ ...w, startsAt: w.startsAt?.toISOString() ?? null, endsAt: w.endsAt?.toISOString() ?? null }))} initialSquad={squad ? { id: squad.id, contestId: squad.contestId, name: squad.name, revision: squad.revision, bankUnits: squad.bankUnits, capitalUnits, entries: squad.entries.map(e => ({ id: e.fantasyPlayerId, keepForOptimizer: e.keepForOptimizer })) } : null} tab={view}/></MacheteShell>;
}
