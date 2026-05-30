import fs from 'fs';
let content = fs.readFileSync('prisma/schema.prisma', 'utf8');

content = content.replace('provider = "postgresql"', 'provider = "sqlite"\n  url      = env("DATABASE_URL")');
content = content.replace(/enum \w+ \{[\s\S]*?\}/g, '');
content = content.replace(/MembershipStatus/g, 'String');
content = content.replace(/ModuleCategory/g, 'String');
content = content.replace(/AuditAction/g, 'String');
content = content.replace(/BillingInterval/g, 'String');
content = content.replace(/SubscriptionStatus/g, 'String');
content = content.replace(/@default\(ACTIVE\)/g, '@default("ACTIVE")');
content = content.replace(/@default\(MONTHLY\)/g, '@default("MONTHLY")');
content = content.replace(/@default\(TRIALING\)/g, '@default("TRIALING")');

fs.writeFileSync('prisma/schema.prisma', content);
