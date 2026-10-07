-- Module Caisse distinct des Ventes, avec ses propres permissions : un caissier
-- n'a plus besoin de `finance.manage` (acces complet a la tresorerie) pour vendre.
INSERT INTO "ModuleDefinition" ("id", "key", "name", "category")
VALUES (gen_random_uuid()::text, 'pos', 'Caisse', 'Sales')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission" ("id", "key", "moduleKey")
VALUES
  (gen_random_uuid()::text, 'pos.read', 'pos'),
  (gen_random_uuid()::text, 'pos.sell', 'pos'),
  (gen_random_uuid()::text, 'pos.manage', 'pos')
ON CONFLICT ("key") DO NOTHING;

-- La caisse etait rattachee au module Ventes : on l'active la ou Ventes l'est.
INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled")
SELECT cm."companyId", 'pos', cm."enabled"
FROM "CompanyModule" cm
WHERE cm."moduleId" = 'sales'
ON CONFLICT ("companyId", "moduleId") DO NOTHING;

-- Conserver les acces existants : vendre et corriger exigeaient finance.manage,
-- consulter exigeait finance.read.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p."id"
FROM "RolePermission" rp
JOIN "Permission" old ON old."id" = rp."permissionId" AND old."key" = 'finance.manage'
JOIN "Permission" p ON p."key" IN ('pos.read', 'pos.sell', 'pos.manage')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p."id"
FROM "RolePermission" rp
JOIN "Permission" old ON old."id" = rp."permissionId" AND old."key" = 'finance.read'
JOIN "Permission" p ON p."key" = 'pos.read'
ON CONFLICT DO NOTHING;

-- Role systeme Caissier pour les entreprises existantes.
INSERT INTO "Role" ("id", "companyId", "name", "description", "systemKey", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'Caissier', 'Ventes en caisse et consultation des tickets.', 'cashier', CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('pos.read', 'pos.sell')
WHERE r."systemKey" = 'cashier'
ON CONFLICT DO NOTHING;
