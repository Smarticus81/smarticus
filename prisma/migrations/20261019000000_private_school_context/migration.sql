CREATE TABLE "PrivateSchoolContext" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "content" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "bootstrapId" TEXT,
  "parentEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateSchoolContext_pkey" PRIMARY KEY ("id")
);
