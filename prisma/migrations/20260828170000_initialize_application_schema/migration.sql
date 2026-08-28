-- The original production migration only created the durable session table.
-- Initialize the application schema without disturbing databases previously
-- provisioned with `prisma db push`.

DO $$ BEGIN
    CREATE TYPE "Subject" AS ENUM ('mathematics', 'literature', 'writing', 'science', 'history_geography', 'french', 'computer_science', 'pe', 'art_design');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "LessonStatus" AS ENUM ('scheduled', 'started', 'in_progress', 'completed', 'not_assessed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MasteryStatus" AS ENUM ('not_assessed', 'developing', 'proficient', 'mastered', 'needs_reteach');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "RecordType" AS ENUM ('AI_OBSERVATION', 'OFFICIAL_GRADE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "IngestionStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'partial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Student" (
    "id" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL DEFAULT 'Atticus',
    "gradeLevel" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SchoolYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Course" (
    "id" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "schoolYearId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Unit" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Lesson" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "subject" "Subject" NOT NULL,
    "course" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitTitle" TEXT NOT NULL,
    "lessonNumber" INTEGER NOT NULL,
    "lessonTitle" TEXT NOT NULL,
    "standards" JSONB NOT NULL DEFAULT '[]',
    "previousLearning" TEXT NOT NULL,
    "courseContext" TEXT NOT NULL,
    "learningObjectives" JSONB NOT NULL DEFAULT '[]',
    "whyItMatters" TEXT NOT NULL,
    "vocabulary" JSONB NOT NULL DEFAULT '[]',
    "writtenInstruction" TEXT NOT NULL,
    "workedExamples" JSONB NOT NULL DEFAULT '[]',
    "guidedPractice" JSONB NOT NULL DEFAULT '[]',
    "independentPractice" JSONB NOT NULL DEFAULT '[]',
    "exitTicket" JSONB NOT NULL DEFAULT '[]',
    "masteryThreshold" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "materials" JSONB NOT NULL DEFAULT '[]',
    "estimatedMinutes" INTEGER NOT NULL,
    "voicePrompt" TEXT NOT NULL,
    "teacherNotes" TEXT NOT NULL DEFAULT '',
    "answerKey" JSONB NOT NULL DEFAULT '{}',
    "sourceReferences" JSONB NOT NULL DEFAULT '[]',
    "status" "LessonStatus" NOT NULL DEFAULT 'scheduled',
    "dayNumber" INTEGER,
    "todaysGoal" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Assignment" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueDate" DATE,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "score" DOUBLE PRECISION,
    "recordType" "RecordType" NOT NULL DEFAULT 'AI_OBSERVATION',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Assessment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "recordType" "RecordType" NOT NULL DEFAULT 'AI_OBSERVATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssessmentItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "studentAnswer" TEXT,
    "correctAnswer" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "recordType" "RecordType" NOT NULL DEFAULT 'AI_OBSERVATION',
    "attemptRecorded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MasteryRecord" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "studentId" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "standard" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "status" "MasteryStatus" NOT NULL DEFAULT 'not_assessed',
    "recordType" "RecordType" NOT NULL DEFAULT 'AI_OBSERVATION',
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MasteryRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TeacherFeedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "subject" "Subject",
    "content" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TutorSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "summary" TEXT,
    "transcript" JSONB,
    "retainTranscript" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TutorSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TutorSessionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Misconception" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Misconception_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PortfolioArtifact" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "filePath" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SourceDocument" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "openaiFileId" TEXT,
    "vectorStoreFileId" TEXT,
    "indexingStatus" "IngestionStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ingestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IngestionJob" (
    "id" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ParentSetting" (
    "id" TEXT NOT NULL,
    "retainTranscripts" BOOLEAN NOT NULL DEFAULT true,
    "masteryThresholdHigh" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "masteryThresholdLow" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "currentLessonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GradeAudit" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL DEFAULT 'parent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GradeAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyReview" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Student_internalId_key" ON "Student"("internalId");
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolYear_label_key" ON "SchoolYear"("label");
CREATE UNIQUE INDEX IF NOT EXISTS "Course_schoolYearId_subject_key" ON "Course"("schoolYearId", "subject");
CREATE UNIQUE INDEX IF NOT EXISTS "Unit_courseId_externalId_key" ON "Unit"("courseId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Lesson_externalId_key" ON "Lesson"("externalId");
CREATE INDEX IF NOT EXISTS "Lesson_date_idx" ON "Lesson"("date");
CREATE INDEX IF NOT EXISTS "Lesson_subject_idx" ON "Lesson"("subject");
CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_externalId_key" ON "Assignment"("externalId");
CREATE INDEX IF NOT EXISTS "MasteryRecord_studentId_subject_idx" ON "MasteryRecord"("studentId", "subject");
CREATE INDEX IF NOT EXISTS "MasteryRecord_standard_idx" ON "MasteryRecord"("standard");
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "SourceDocument_sourcePath_key" ON "SourceDocument"("sourcePath");
CREATE UNIQUE INDEX IF NOT EXISTS "SourceDocument_checksum_key" ON "SourceDocument"("checksum");
CREATE INDEX IF NOT EXISTS "IngestionJob_checksum_idx" ON "IngestionJob"("checksum");
CREATE INDEX IF NOT EXISTS "IngestionJob_sourcePath_idx" ON "IngestionJob"("sourcePath");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyReview_date_key" ON "DailyReview"("date");

DO $$ BEGIN
    ALTER TABLE "SchoolYear" ADD CONSTRAINT "SchoolYear_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Unit" ADD CONSTRAINT "Unit_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "MasteryRecord" ADD CONSTRAINT "MasteryRecord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "MasteryRecord" ADD CONSTRAINT "MasteryRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "TeacherFeedback" ADD CONSTRAINT "TeacherFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "TeacherFeedback" ADD CONSTRAINT "TeacherFeedback_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "TutorSessionEvent" ADD CONSTRAINT "TutorSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Misconception" ADD CONSTRAINT "Misconception_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "Misconception" ADD CONSTRAINT "Misconception_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "PortfolioArtifact" ADD CONSTRAINT "PortfolioArtifact_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
