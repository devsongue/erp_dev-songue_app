CREATE TABLE "DocumentSequence" (
  "companyId" TEXT NOT NULL, "key" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("companyId", "key")
);
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
