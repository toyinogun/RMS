-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversedById_key" ON "Payment"("reversedById");
