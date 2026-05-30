# Architecture produit

## Positionnement

Ce projet est un ERP self-hosted multi-entreprises. Il n'est pas pense comme une plateforme SaaS mutualisee vendue par abonnement a plusieurs clients sur la meme instance.

Le modele cible est :

- un client achete ou commande l'installation ;
- l'application est deployee sur son propre VPS ;
- l'instance peut contenir plusieurs entreprises du client ;
- chaque entreprise a ses utilisateurs, roles, modules, workflows et donnees ;
- les donnees metier sont separees par `companyId`.

## Public vise

Le public cible est compose d'entrepreneurs, petites entreprises et groupes multi-entites. L'interface doit rester simple :

- vocabulaire metier clair ;
- sidebar organisee par grands domaines ;
- actions visibles : nouveau devis, facture, vente POS, mouvement de stock, paiement, employe ;
- pas de jargon technique dans l'application client.

## Domaines fonctionnels

L'ERP doit etre organise autour de modules activables par entreprise :

- CRM : leads, clients, opportunites, pipelines.
- Ventes : devis, commandes, factures, retours.
- POS : caisse, tickets, sessions, rapports.
- Catalogue : produits, services, categories, codes-barres.
- Stock : entrepots, mouvements, transferts, alertes, inventaires.
- Achats : fournisseurs, factures d'achat, retours.
- Finance : banques, tresorerie, paiements clients/fournisseurs, revenus, depenses.
- Comptabilite : plan comptable, ecritures, grand livre, balance, profit/loss.
- RH : employes, presences, conges, salaires, paie, shifts.
- Projets, helpdesk, documents, rapports et parametres.

## Isolation des donnees

Toutes les tables metier doivent porter `companyId`, sauf les tables globales de l'installation comme `Workspace`, `Plan` ou `ModuleDefinition`.

Regle obligatoire dans les services :

```ts
where: {
  companyId: session.companyId
}
```

Un utilisateur peut avoir des roles differents selon l'entreprise :

```txt
Utilisateur
├── Nova CI -> Admin
├── Nova Senegal -> Comptable
└── Nova Mali -> Lecture seule
```

## Authentification et acces

L'authentification repose sur des sessions serveur stockees en base de donnees.

- Au premier demarrage sur le VPS, si aucun `User` n'existe, `/login` redirige vers `/setup`.
- `/setup` cree le premier compte proprietaire (`User.isOwner = true`), le workspace, la premiere entreprise, les modules, les roles systeme et la session.
- `User.passwordHash` stocke le mot de passe hache avec `scrypt`.
- `Session.tokenHash` stocke uniquement le hash du token de session.
- Le token brut reste dans un cookie `httpOnly`, `sameSite=lax`, `secure` en production.
- Les routes ERP `/:companySlug/...` verifient la session avant affichage.
- L'acces a une entreprise est autorise seulement si l'utilisateur possede une `CompanyMembership` active pour ce `companySlug`.
- Les roles et permissions sont resolus par entreprise via `CompanyMembership -> UserRole -> Role -> RolePermission`.
- Le proprietaire peut creer d'autres entreprises, creer des roles et ajouter des gestionnaires par entreprise.

Compte local de demonstration :

```txt
email: amadou@groupenova.com
password: admin1234
```

## Base de donnees cible

La base doit etre organisee en couches :

- Core : users, companies, memberships, roles, permissions.
- Modules : module definitions, company modules.
- CRM : contacts, leads, deals, pipelines.
- Sales : quotes, orders, invoices, returns, payments.
- POS : registers, sessions, tickets, ticket lines.
- Inventory : products, services, categories, warehouses, movements, transfers.
- Finance : bank accounts, transactions, revenues, expenses.
- Accounting : chart of accounts, journals, journal entries, tax rates.
- HR : employees, attendances, leaves, payrolls, shifts.
- Audit : immutable audit logs by company.

## Deploiement

Production cible :

- VPS du client ;
- PostgreSQL ;
- Docker / Dokploy ;
- domaine client via Cloudflare ;
- stockage fichiers possible via disque local ou R2 selon besoin.
