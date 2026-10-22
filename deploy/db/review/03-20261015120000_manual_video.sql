-- Additive media kind. SiteContent uses a text key, so manual needs no new table/columns.
ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'VIDEO';
