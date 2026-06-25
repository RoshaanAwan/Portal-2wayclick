-- AlterTable: track which OAuth scopes the connected Google account granted, so
-- the UI can prompt a reconnect when new scopes (e.g. Gmail) are added.
ALTER TABLE "GoogleDriveConnection" ADD COLUMN "googleScopes" TEXT;
