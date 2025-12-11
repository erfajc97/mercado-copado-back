-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'paid_pending_review';

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH_DEPOSIT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "depositImageUrl" TEXT;
