-- Degen mode (skip every confirmation) is replaced by auto-approve limits held by the server.
ALTER TABLE "users" DROP COLUMN "degenMode",
ADD COLUMN     "autoApproveTxUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "autoApproveDayUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "agent_moves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "to" TEXT NOT NULL,
    "valueUsd" DOUBLE PRECISION,
    "confirmed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_moves_userId_createdAt_idx" ON "agent_moves"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_moves" ADD CONSTRAINT "agent_moves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
