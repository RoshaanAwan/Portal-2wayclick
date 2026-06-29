-- AlterTable: profile cover image (LinkedIn-style banner, ~4:1). Stored in the
-- tenant's Google Drive and served via /api/user/banner/proxy, same trust model
-- as avatarUrl. Null = use the default gradient banner.
ALTER TABLE "User" ADD COLUMN "bannerUrl" TEXT;
