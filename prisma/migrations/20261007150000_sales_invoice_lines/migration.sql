ALTER TABLE "SalesInvoice" ADD COLUMN "discountRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "taxRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "issuedAt" TIMESTAMP(3);
ALTER TABLE "SalesInvoice" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Les factures deja emises avant cette migration gardent leur date d'emission.
UPDATE "SalesInvoice" SET "issuedAt" = "issueDate" WHERE "status" <> 'Draft';

CREATE TABLE "SalesInvoiceLine" (
  "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "itemId" TEXT, "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL, "unitPrice" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesInvoiceLine_invoiceId_idx" ON "SalesInvoiceLine"("invoiceId");
CREATE INDEX "SalesInvoiceLine_itemId_idx" ON "SalesInvoiceLine"("itemId");
CREATE INDEX "SalesInvoice_quoteId_idx" ON "SalesInvoice"("quoteId");

ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
