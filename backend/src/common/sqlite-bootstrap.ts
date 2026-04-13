import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("当前仅支持 SQLite file: 协议");
  }

  const rawPath = databaseUrl.replace(/^file:/, "");
  if (isAbsolute(rawPath) || /^[A-Za-z]:/.test(rawPath)) {
    return rawPath;
  }

  return resolve(process.cwd(), "prisma", rawPath);
}

export function bootstrapSqliteDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("缺少 DATABASE_URL");
  }

  const databasePath = resolveDatabasePath(databaseUrl);
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS "Document" (
      "docId" TEXT PRIMARY KEY,
      "title" TEXT NOT NULL,
      "language" TEXT NOT NULL,
      "sourceFileName" TEXT NOT NULL,
      "sourceFileType" TEXT NOT NULL,
      "sourceFilePath" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'uploaded',
      "currentVersion" INTEGER NOT NULL DEFAULT 1,
      "excludeCover" INTEGER NOT NULL DEFAULT 0,
      "excludeCatalog" INTEGER NOT NULL DEFAULT 0,
      "excludeReferences" INTEGER NOT NULL DEFAULT 0,
      "excludeAppendix" INTEGER NOT NULL DEFAULT 0,
      "manualExcludedIds" TEXT,
      "parseError" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "DocumentSection" (
      "sectionId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "level" INTEGER NOT NULL,
      "order" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "DocumentParagraph" (
      "segmentId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "sectionId" TEXT,
      "text" TEXT NOT NULL,
      "currentText" TEXT,
      "order" INTEGER NOT NULL,
      "excluded" INTEGER NOT NULL DEFAULT 0,
      "paragraphType" TEXT NOT NULL DEFAULT 'body',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE,
      FOREIGN KEY ("sectionId") REFERENCES "DocumentSection"("sectionId") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "ModelProvider" (
      "providerId" TEXT PRIMARY KEY,
      "providerType" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "baseUrl" TEXT NOT NULL,
      "apiKey" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "capabilities" TEXT NOT NULL,
      "timeoutMs" INTEGER NOT NULL,
      "concurrency" INTEGER NOT NULL,
      "contextWindow" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'unknown',
      "isDefaultRewrite" INTEGER NOT NULL DEFAULT 0,
      "isDefaultDetect" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "DetectionTask" (
      "taskId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "providerId" TEXT,
      "taskType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "progress" INTEGER NOT NULL DEFAULT 0,
      "summaryScore" INTEGER,
      "plagiarismScore" INTEGER,
      "aigcScore" INTEGER,
      "errorMessage" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE,
      FOREIGN KEY ("providerId") REFERENCES "ModelProvider"("providerId") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "SegmentResult" (
      "resultId" TEXT PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "segmentId" TEXT NOT NULL,
      "originalText" TEXT NOT NULL,
      "riskScore" INTEGER NOT NULL,
      "plagiarismScore" INTEGER,
      "aigcScore" INTEGER,
      "riskType" TEXT NOT NULL,
      "evidence" TEXT NOT NULL,
      "suggestedAction" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "DetectionTask"("taskId") ON DELETE CASCADE,
      FOREIGN KEY ("segmentId") REFERENCES "DocumentParagraph"("segmentId") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "RewriteTask" (
      "taskId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "segmentIds" TEXT NOT NULL,
      "providerId" TEXT,
      "model" TEXT NOT NULL,
      "strategy" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "progress" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "options" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE,
      FOREIGN KEY ("providerId") REFERENCES "ModelProvider"("providerId") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "RewriteCandidate" (
      "candidateId" TEXT PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "segmentId" TEXT NOT NULL,
      "rewrittenText" TEXT NOT NULL,
      "explanation" TEXT NOT NULL,
      "beforeScore" INTEGER NOT NULL,
      "afterScore" INTEGER NOT NULL,
      "accepted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "RewriteTask"("taskId") ON DELETE CASCADE,
      FOREIGN KEY ("segmentId") REFERENCES "DocumentParagraph"("segmentId") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "RecheckTask" (
      "taskId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "segmentIds" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "progress" INTEGER NOT NULL DEFAULT 0,
      "beforeScores" TEXT,
      "afterScores" TEXT,
      "changedSegments" TEXT,
      "errorMessage" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "ExportTask" (
      "exportId" TEXT PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "exportType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "progress" INTEGER NOT NULL DEFAULT 0,
      "downloadUrl" TEXT,
      "filePath" TEXT,
      "errorMessage" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME,
      FOREIGN KEY ("docId") REFERENCES "Document"("docId") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "DocumentSection_docId_idx" ON "DocumentSection" ("docId");
    CREATE INDEX IF NOT EXISTS "DocumentParagraph_docId_idx" ON "DocumentParagraph" ("docId");
    CREATE INDEX IF NOT EXISTS "DetectionTask_docId_idx" ON "DetectionTask" ("docId");
    CREATE INDEX IF NOT EXISTS "RewriteTask_docId_idx" ON "RewriteTask" ("docId");
    CREATE INDEX IF NOT EXISTS "SegmentResult_taskId_idx" ON "SegmentResult" ("taskId");
    CREATE INDEX IF NOT EXISTS "SegmentResult_segmentId_idx" ON "SegmentResult" ("segmentId");
    CREATE INDEX IF NOT EXISTS "RewriteCandidate_taskId_idx" ON "RewriteCandidate" ("taskId");
    CREATE INDEX IF NOT EXISTS "RewriteCandidate_segmentId_idx" ON "RewriteCandidate" ("segmentId");
  `);
  database.close();
}
