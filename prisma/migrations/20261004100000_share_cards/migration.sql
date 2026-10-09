-- Share cards: what each card said when it was made and the transactions behind it, public by code.
CREATE TABLE "share_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" JSONB NOT NULL,
    "proof" JSONB NOT NULL,
    "look" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_cards_userId_createdAt_idx" ON "share_cards"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "share_cards" ADD CONSTRAINT "share_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
