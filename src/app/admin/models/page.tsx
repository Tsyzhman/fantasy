export default function AdminModelsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</p>
      <h1 className="mt-2 text-3xl font-bold text-ink">Fantasy model</h1>
      <div className="mt-6 rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-soft">
        The MVP seed model is configured in the database during seed. Editing rules will come after the Excel import loop is
        stable.
      </div>
    </main>
  );
}
