-- Additive migration: admin-managed site content (header, navigation, homepage, partners, footer, page text).
-- Creates ONE new table. No existing table, column, index or row is changed, and nothing is seeded.
-- Review pack (preflight, verification, rollback): deploy/db/review/ and the separately delivered deployment guide.

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

