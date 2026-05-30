# ERP Multi-Entreprises Self-Hosted

ERP multi-entreprises installe sur le VPS du client. Le produit vise les entrepreneurs et PME qui veulent un outil simple a utiliser, mais avec de vraies fonctionnalites metier : ventes, POS, stock, finance, comptabilite, RH, CRM, achats, projets, helpdesk et rapports.

## Core ideas

- One installation belongs to one client and runs on the client's own VPS.
- One client installation can manage many companies.
- Every business record is scoped with `companyId`.
- Users receive roles per company through a company membership.
- Roles contain permissions such as `customer.read` or `invoice.*`.
- Companies activate modules independently with `CompanyModule`.
- Data isolation is enforced by always filtering business records by the active company.

## Stack

- TanStack Start
- React 19
- Tailwind CSS 4
- Prisma 5
- SQLite for local development
- PostgreSQL target for production VPS deployments
- Docker / Dokploy / Cloudflare-ready deployment target

## Local setup

```sh
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

The app runs on `http://localhost:3000`.

## Database model

The Prisma schema defines:

- `Workspace`, `Plan`, `Subscription`
- `User`, `Company`, `CompanyMembership`
- `Role`, `Permission`, `UserRole`, `RolePermission`
- `CompanyInvitation`
- `ModuleDefinition`, `CompanyModule`
- company-scoped example records with `Customer` and `Order`
- company-scoped `AuditLog`

This gives the project a self-hosted ERP core before connecting all business modules to persistent data.

## Routes

Access:

- `/` redirects to `/login`
- `/login` authentication
- `/setup` first administrator setup

Customer application:

- `/:companySlug/dashboard`
- `/:companySlug/crm`, `/:companySlug/crm/leads`, `/:companySlug/crm/deals`, `/:companySlug/crm/pipelines`
- `/:companySlug/sales`, `/:companySlug/sales/quotations`, `/:companySlug/sales/orders`, `/:companySlug/sales/invoices`, `/:companySlug/sales/returns`
- `/:companySlug/pos`, `/:companySlug/pos/register`, `/:companySlug/pos/sales-report`
- `/:companySlug/products-services`
- `/:companySlug/inventory`, `/:companySlug/inventory/warehouses`, `/:companySlug/inventory/transfers`
- `/:companySlug/finance`, `/:companySlug/finance/bank-accounts`, `/:companySlug/finance/customer-payments`, `/:companySlug/finance/vendor-payments`, `/:companySlug/finance/revenues`, `/:companySlug/finance/expenses`
- `/:companySlug/accounting`, `/:companySlug/accounting/chart-of-accounts`, `/:companySlug/accounting/ledger`, `/:companySlug/accounting/trial-balance`, `/:companySlug/accounting/profit-loss`
- `/:companySlug/hr`, `/:companySlug/hr/employees`, `/:companySlug/hr/attendances`, `/:companySlug/hr/leaves`, `/:companySlug/hr/payrolls`, `/:companySlug/hr/shifts`
- `/:companySlug/purchases`, `/:companySlug/projects`, `/:companySlug/helpdesk`, `/:companySlug/reports`, `/:companySlug/settings`

The public site and the ERP application use separate layouts. Public pages explain the product and installation offer; application pages use an ERP sidebar scoped to the active company.
