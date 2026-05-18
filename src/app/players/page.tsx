import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function PlayersRedirect({ searchParams }: PageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") params.set(key, value);
  }

  redirect(`/baltika/players${params.size ? `?${params.toString()}` : ""}`);
}
