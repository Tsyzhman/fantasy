# Data Model

Use PostgreSQL + Prisma.

## Core entities

```text
User
League
Team
Season
SourceFile
TeamImport
Player
PlayerSnapshot
FantasyModel
FantasyModelRule
FantasyScore
SavedFilter
Shortlist
```

## Prisma model sketch

```prisma
enum UserRole {
  ADMIN
  USER
}

enum ImportStatus {
  EMPTY
  UPLOADING
  PARSING
  VALIDATED
  READY
  PUBLISHED
  ERROR
  OUTDATED
  ARCHIVED
}

enum DataSourceType {
  WYSCOUT_EXCEL
  API_FOOTBALL
  WYSCOUT_API
  MANUAL
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      UserRole @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model League {
  id        String   @id @default(cuid())
  name      String
  country   String?
  code      String?
  logoUrl   String?
  seasons   Season[]
  teams     Team[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Season {
  id        String   @id @default(cuid())
  leagueId  String
  name      String   // e.g. "2025/26"
  startDate DateTime?
  endDate   DateTime?
  league    League   @relation(fields: [leagueId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([leagueId, name])
}

model Team {
  id        String   @id @default(cuid())
  leagueId  String
  name      String
  slug      String
  logoUrl   String?
  aliases   String[] @default([])
  league    League   @relation(fields: [leagueId], references: [id])
  imports   TeamImport[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([leagueId, slug])
}

model SourceFile {
  id               String         @id @default(cuid())
  sourceType       DataSourceType @default(WYSCOUT_EXCEL)
  originalFilename String
  storagePath      String
  mimeType         String?
  sizeBytes        Int?
  checksum         String?
  uploadedById     String?
  createdAt        DateTime       @default(now())
}

model TeamImport {
  id                 String       @id @default(cuid())
  leagueId           String
  seasonId           String
  teamId             String
  sourceFileId        String
  status             ImportStatus @default(PARSING)
  periodFrom          DateTime?
  periodTo            DateTime?
  detectedTeamName    String?
  rowsCount           Int         @default(0)
  columnsCount        Int         @default(0)
  errorsJson          Json?
  warningsJson        Json?
  isCurrentPublished  Boolean     @default(false)
  publishedAt         DateTime?
  createdById         String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  team        Team       @relation(fields: [teamId], references: [id])
  sourceFile  SourceFile @relation(fields: [sourceFileId], references: [id])
  snapshots   PlayerSnapshot[]

  @@index([leagueId, seasonId, teamId, status])
  @@index([teamId, isCurrentPublished])
}

model Player {
  id              String   @id @default(cuid())
  canonicalName   String
  normalizedName  String
  birthCountry    String?
  passportCountry String?
  foot            String?
  heightCm        Int?
  weightKg        Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  snapshots PlayerSnapshot[]

  @@index([normalizedName])
}

model PlayerSnapshot {
  id              String   @id @default(cuid())
  teamImportId    String
  leagueId         String
  seasonId         String
  teamId           String
  playerId         String?

  playerName       String
  normalizedName   String
  teamName         String
  positionRaw      String?
  positionGroup    String?  // GK, DEF, MID, FWD, UNKNOWN
  age              Int?
  marketValue      Int?
  contractExpires  DateTime?
  matchesPlayed    Int?
  minutesPlayed    Int?
  goals            Float?
  xg               Float?
  assists          Float?
  xa               Float?
  birthCountry     String?
  passportCountry  String?
  foot             String?
  heightCm         Int?
  weightKg         Int?
  onLoan           Boolean?

  fantasyScore     Float?
  valueScore       Float?
  rawMetrics       Json

  createdAt        DateTime @default(now())

  teamImport TeamImport @relation(fields: [teamImportId], references: [id])
  player     Player?    @relation(fields: [playerId], references: [id])

  @@index([leagueId, seasonId, teamId])
  @@index([positionGroup])
  @@index([fantasyScore])
  @@index([valueScore])
}

model FantasyModel {
  id          String   @id @default(cuid())
  name        String
  description String?
  version     Int      @default(1)
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)
  rules       FantasyModelRule[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model FantasyModelRule {
  id             String  @id @default(cuid())
  modelId        String
  positionGroup  String  // DEFAULT, GK, DEF, MID, FWD
  metricKey      String
  weight         Float
  transform      String  @default("linear")
  enabled        Boolean @default(true)

  model FantasyModel @relation(fields: [modelId], references: [id])

  @@index([modelId, positionGroup])
}
```

## Why `rawMetrics` JSON is important

The Wyscout file has many columns. Do not create a database column for every metric at the start.

Use explicit columns only for:

- common filters;
- sorting;
- score calculation;
- normalized identity fields.

Store all original normalized metrics in `rawMetrics` JSON for future formulas and debugging.
