-- AlterTable
ALTER TABLE "ConversationMember" ALTER COLUMN "lastReadAt" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT,
    "tagline" TEXT,
    "legalName" TEXT,
    "website" TEXT,
    "emailDomain" TEXT,
    "logoUrl" TEXT,
    "accentHex" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BrandingSettings_pkey" PRIMARY KEY ("id")
);
