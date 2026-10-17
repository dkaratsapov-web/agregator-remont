-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "details" JSONB NOT NULL DEFAULT '{}';

-- Ответы анкеты: только объект и не больше 16 КБ (API хранит до 8 КБ, остальное запас).
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_details_object" CHECK (jsonb_typeof("details") = 'object');
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_details_size" CHECK (octet_length("details"::text) <= 16384);
