-- The rug watch keeps what it saw on each run, per user and wallet, to report only what changed.
CREATE TABLE "holding_watches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holding_watches_userId_wallet_key" ON "holding_watches"("userId", "wallet");

-- AddForeignKey
ALTER TABLE "holding_watches" ADD CONSTRAINT "holding_watches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
