-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobFamily" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "managerId" TEXT,
    "employmentType" TEXT NOT NULL,
    "hireDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "gender" TEXT,
    "currentSalaryAmountMinor" BIGINT NOT NULL,
    "currentSalaryCurrency" TEXT NOT NULL,
    "currentSalaryBaseMinor" BIGINT NOT NULL,
    "currentPayFrequency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "payFrequency" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "changeReason" TEXT NOT NULL,
    "note" TEXT,
    "fxRateToBase" REAL NOT NULL,
    "amountBaseMinor" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompensationBand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobFamily" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "minMinor" BIGINT NOT NULL,
    "midMinor" BIGINT NOT NULL,
    "maxMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currencyCode" TEXT NOT NULL,
    "rateToBase" REAL NOT NULL,
    "asOf" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workEmail_key" ON "Employee"("workEmail");

-- CreateIndex
CREATE INDEX "Employee_countryCode_department_level_idx" ON "Employee"("countryCode", "department", "level");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_lastName_idx" ON "Employee"("lastName");

-- CreateIndex
CREATE INDEX "SalaryRecord_employeeId_effectiveFrom_idx" ON "SalaryRecord"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryRecord_employeeId_effectiveTo_idx" ON "SalaryRecord"("employeeId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationBand_jobFamily_level_countryCode_key" ON "CompensationBand"("jobFamily", "level", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_currencyCode_key" ON "FxRate"("currencyCode");

-- NOTE: Do NOT set PRAGMA journal_mode=WAL here.
-- Prisma wraps each migration in a transaction; SQLite ignores journal_mode changes
-- inside a transaction. WAL is enabled at connection time in src/db/client.ts.
