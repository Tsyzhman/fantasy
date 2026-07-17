import { UserScoringPreferencesPage } from "@/components/user-scoring-preferences-page";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    reset?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function MacheteModelsPage({ searchParams }: PageProps) {
  return UserScoringPreferencesPage({ searchParams: await searchParams });
}
