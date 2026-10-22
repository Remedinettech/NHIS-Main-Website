-- Additive only. Review and back up before applying; no existing rows are changed.
CREATE TABLE "ContentImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RUNNING',
  "rows" JSONB NOT NULL,
  "results" JSONB NOT NULL DEFAULT '[]',
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ContentImport_actorId_createdAt_idx" ON "ContentImport"("actorId", "createdAt");
