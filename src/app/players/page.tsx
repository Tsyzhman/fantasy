import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** @spec spec://common/PROP-002-editorial-sport-design#workspace-navigation */
export default async function PlayersEntryPage({ searchParams }: PageProps) {
  redirect(`/machete/players${paramsWithoutSource((await searchParams) ?? {})}`);
}

function paramsWithoutSource(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "source") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item !== "") query.append(key, item);
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}
