-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('resolved', 'needs_human');

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('already_credited', 'not_started', 'postback_rejected', 'not_tracked_yet', 'likely_fraud', 'needs_human');

-- CreateEnum
CREATE TYPE "ClaimSource" AS ENUM ('rules', 'llm', 'fallback');

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "source" "ClaimSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reply" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_userId_offerId_key" ON "Claim"("userId", "offerId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

