-- Renames the seeded demo owners on databases that were already seeded, so the
-- demo accounts match prisma/seed.ts. Every statement is a no-op on a fresh
-- database (the seed runs after migrations) and when the demo rows are absent.
--
--   fatima@ -> sami@     (keeps Lahore Auto Care and Karachi Motor Works)
--   omar@   -> huraira@  (takes over Islamabad Garage Pro)
--   hassan@ is created   (takes over Peshawar Quick Fix), same password as Sami

UPDATE "User" SET "email" = 'sami@bayflow.test', "name" = 'Muhammad Sami'
WHERE "email" = 'fatima@bayflow.test'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'sami@bayflow.test');

UPDATE "User" SET "email" = 'huraira@bayflow.test', "name" = 'Huraira'
WHERE "email" = 'omar@bayflow.test'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'huraira@bayflow.test');

INSERT INTO "User" ("id", "email", "name", "passwordHash", "type", "createdAt")
SELECT 'demo_owner_hassan', 'hassan@bayflow.test', 'Hassan', "passwordHash", 'OWNER', NOW()
FROM "User"
WHERE "email" = 'sami@bayflow.test'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'hassan@bayflow.test');

UPDATE "Shop" SET "ownerId" = (SELECT "id" FROM "User" WHERE "email" = 'huraira@bayflow.test')
WHERE "name" = 'Islamabad Garage Pro'
  AND EXISTS (SELECT 1 FROM "User" WHERE "email" = 'huraira@bayflow.test');

UPDATE "Shop" SET "ownerId" = (SELECT "id" FROM "User" WHERE "email" = 'hassan@bayflow.test')
WHERE "name" = 'Peshawar Quick Fix'
  AND EXISTS (SELECT 1 FROM "User" WHERE "email" = 'hassan@bayflow.test');
