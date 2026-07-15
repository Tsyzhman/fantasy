import { BetaTestStart } from "@/components/beta/BetaTestStart";

type PageProps = { searchParams: Promise<{ synthetic?: string }> };

export default async function BetaTestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <BetaTestStart synthetic={params.synthetic === "1"} />
    </main>
  );
}
