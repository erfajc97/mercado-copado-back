-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYPHONE', 'MERCADOPAGO', 'CRYPTO');

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "addressId" TEXT,
ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'PAYPHONE',
ALTER COLUMN "orderId" DROP NOT NULL;
