export function hasDatabaseUrl(value: string | null | undefined = process.env.DATABASE_URL) {
  return Boolean(value?.trim());
}

export function isDatabaseConfigured() {
  return hasDatabaseUrl();
}
