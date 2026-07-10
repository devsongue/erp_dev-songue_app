import { createHash, randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { prisma } from './db'
import { getSessionContext, invalidateSessionCache, invalidateSessionToken } from './access'
import { hashPassword, verifyPassword } from './password'
import { isBlocked, recordFailure, recordSuccess, throttle } from './rateLimit'
import type { Permission } from '@prisma/client'

const sessionCookieName = 'erp_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7

const optionalUrlInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
)

const optionalEmailInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().email().optional(),
)

type AuthCompany = {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  roles: string[]
  permissions: string[]
}

export type AuthState = {
  user: {
    id: string
    name: string
    email: string
    isOwner: boolean
  } | null
  companies: AuthCompany[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

function maskDatabaseUrl(value: string) {
  if (!value) return 'Non configure'
  if (value.startsWith('file:')) return value
  try {
    const url = new URL(value)
    if (url.password) url.password = '***'
    if (url.username) url.username = '***'
    return url.toString()
  } catch {
    return value.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@')
  }
}

function setSessionCookie(token: string, expiresAt: Date) {
  setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

function clearSessionCookie() {
  deleteCookie(sessionCookieName, { path: '/' })
}

async function readAuthState(): Promise<AuthState> {
  const token = getCookie(sessionCookieName)
  if (!token) return { user: null, companies: [] }

  const context = await getSessionContext()
  if (!context) {
    clearSessionCookie()
    return { user: null, companies: [] }
  }

  return {
    user: context.user,
    companies: context.companies,
  }
}

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  return readAuthState()
})

// Une fois l'installation faite, elle ne peut pas "se defaire" : on memorise
// le resultat pour ne pas requeter la base a chaque visite de /login ou /
// (cible favorite des scanners automatises).
let installationConfirmed = false

async function isInstalled() {
  if (installationConfirmed) return true
  const usersCount = await prisma.user.count()
  if (usersCount > 0) installationConfirmed = true
  return installationConfirmed
}

// L'inscription publique (self-service) reste desactivee par defaut : sur un ERP
// c'est une decision de securite explicite. On l'active via ALLOW_PUBLIC_REGISTRATION.
function publicRegistrationEnabled() {
  return String(process.env.ALLOW_PUBLIC_REGISTRATION ?? '').trim().toLowerCase() === 'true'
}

export const getInstallationState = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    return { needsSetup: !(await isInstalled()), allowRegistration: publicRegistrationEnabled() }
  } catch (error) {
    console.error('Database connection error in getInstallationState:', error)
    // We assume setup is needed or database is unreachable
    return { needsSetup: true, allowRegistration: false, error: true }
  }
})

export const getCompanyAuthState = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const company = auth.companies.find((item) => item.slug === data.companySlug) ?? null

    return {
      ...auth,
      activeCompany: company,
      canAccessCompany: Boolean(company),
    }
  })

async function recordLoginEvent(input: {
  userId?: string | null
  email: string
  ip: string
  success: boolean
  reason?: string
}) {
  // Le journal de connexion ne doit jamais faire echouer le login lui-meme.
  await prisma.loginEvent.create({
    data: {
      userId: input.userId ?? null,
      email: input.email,
      ip: input.ip,
      success: input.success,
      reason: input.reason ?? null,
    },
  }).catch(() => {})
}

export const login = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
      totpCode: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const usersCount = await prisma.user.count()
    if (usersCount === 0) {
      return { ok: false, message: 'Premiere installation requise.', needsSetup: true, needsTotp: false }
    }

    const email = data.email.toLowerCase().trim()
    const clientIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const rateLimitKeys = [`login:email:${email}`, `login:ip:${clientIp}`]

    for (const key of rateLimitKeys) {
      const { blocked, retryAfterSeconds } = isBlocked(key)
      if (blocked) {
        const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
        return { ok: false, message: `Trop de tentatives. Reessaie dans ${minutes} min.`, needsSetup: false, needsTotp: false }
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      rateLimitKeys.forEach(recordFailure)
      await recordLoginEvent({
        userId: user?.id,
        email,
        ip: clientIp,
        success: false,
        reason: user ? 'password' : 'unknown_user',
      })
      return { ok: false, message: 'Email ou mot de passe incorrect.', needsSetup: false, needsTotp: false }
    }

    // Double authentification : exigee si l'utilisateur l'a activee.
    if (user.totpSecret && user.totpEnabledAt) {
      const { verifyTotp } = await import('./totp')
      if (!data.totpCode) {
        return { ok: false, message: 'Saisis le code de ton application d authentification.', needsSetup: false, needsTotp: true }
      }
      if (!verifyTotp(user.totpSecret, data.totpCode)) {
        rateLimitKeys.forEach(recordFailure)
        await recordLoginEvent({ userId: user.id, email, ip: clientIp, success: false, reason: 'totp' })
        return { ok: false, message: 'Code de verification invalide.', needsSetup: false, needsTotp: true }
      }
    }

    rateLimitKeys.forEach(recordSuccess)

    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + sessionDurationMs)

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        ip: clientIp,
        userAgent: getRequestHeader('user-agent') ?? null,
      },
    })

    setSessionCookie(token, expiresAt)

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
    await recordLoginEvent({ userId: user.id, email, ip: clientIp, success: true })

    const membership = await prisma.companyMembership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    })

    return {
      ok: true,
      needsSetup: false,
      needsTotp: false,
      redirectTo: membership ? `/${membership.company.slug}/dashboard` : '/',
    }
  })

export const setupOwnerAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      ownerName: z.string().min(2),
      ownerEmail: z.string().email(),
      password: z.string().min(10),
      workspaceName: z.string().min(2),
      companyName: z.string().min(2),
      companySlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    }),
  )
  .handler(async ({ data }) => {
    const setupIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const setupThrottle = throttle(`setup:ip:${setupIp}`, 5, 60 * 60 * 1000)
    if (!setupThrottle.allowed) {
      return { ok: false, message: 'Trop de tentatives. Reessaie plus tard.' }
    }

    if (await isInstalled()) {
      return { ok: false, message: 'Cette installation est deja configuree.' }
    }

    const company = await provisionOwnerWorkspace(data)
    installationConfirmed = true

    return { ok: true, redirectTo: `/${company.slug}/dashboard` }
  })

// Inscription publique en self-service : chaque nouveau compte cree son propre
// espace (workspace + entreprise) et en devient proprietaire. Contrairement a
// l'installation initiale, les emails et slugs peuvent deja exister, donc on
// verifie l'unicite et on desambigue les slugs.
export const registerAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      ownerName: z.string().min(2),
      ownerEmail: z.string().email(),
      password: z.string().min(10),
      workspaceName: z.string().min(2),
      companyName: z.string().min(2),
      companySlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    }),
  )
  .handler(async ({ data }) => {
    if (!publicRegistrationEnabled()) {
      return { ok: false, message: 'Les inscriptions sont desactivees.' }
    }

    const registerIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const registerThrottle = throttle(`register:ip:${registerIp}`, 5, 60 * 60 * 1000)
    if (!registerThrottle.allowed) {
      return { ok: false, message: 'Trop de tentatives. Reessaie plus tard.' }
    }

    // Un compte proprietaire initial doit exister avant d'ouvrir les inscriptions.
    if (!(await isInstalled())) {
      return { ok: false, message: 'Configuration initiale requise.', needsSetup: true }
    }

    const email = data.ownerEmail.toLowerCase().trim()
    if (await prisma.user.findUnique({ where: { email } })) {
      return { ok: false, message: 'Un compte existe deja avec cet email.' }
    }

    try {
      const company = await provisionOwnerWorkspace(data)
      return { ok: true, redirectTo: `/${company.slug}/dashboard` }
    } catch (error: any) {
      // Course entre la verification et la creation (email/slug pris entre-temps).
      if (error?.code === 'P2002') {
        return { ok: false, message: 'Un compte existe deja avec cet email.' }
      }
      console.error('registerAccount error:', error)
      return { ok: false, message: 'Impossible de creer le compte pour le moment.' }
    }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = getCookie(sessionCookieName)
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
    invalidateSessionToken(token)
  }
  clearSessionCookie()
  return { ok: true }
})

export const createCompany = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      legalName: z.string().optional(),
      logoUrl: optionalUrlInput,
      address: z.string().optional(),
      phone: z.string().optional(),
      email: optionalEmailInput,
      taxId: z.string().optional(),
      website: optionalUrlInput,
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    if (!auth.user?.isOwner) return { ok: false, message: 'Action reservee au proprietaire.' }

    const workspace = await prisma.workspace.findFirst({ where: { ownerId: auth.user.id } })
    if (!workspace) return { ok: false, message: 'Workspace introuvable.' }

    const exists = await prisma.company.findUnique({ where: { slug: data.slug } })
    if (exists) return { ok: false, message: 'Ce slug est deja utilise.' }

    await ensureCoreDefinitions()
    const company = await createCompanyForOwner({
      workspaceId: workspace.id,
      ownerId: auth.user.id,
      name: data.name.trim(),
      slug: data.slug,
      legalName: data.legalName?.trim(),
      logoUrl: data.logoUrl?.trim(),
      address: data.address?.trim(),
      phone: data.phone?.trim(),
      email: data.email?.trim(),
      taxId: data.taxId?.trim(),
      website: data.website?.trim(),
    })

    invalidateSessionCache()
    return { ok: true, companySlug: company.slug }
  })

export const getCompanyAdministration = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const companyAccess = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user || !companyAccess) {
      return { ok: false, message: 'Acces refuse.', users: [], roles: [], permissions: [] }
    }

    const company = await prisma.company.findUnique({
      where: { slug: data.companySlug },
      include: {
        memberships: {
          include: {
            user: true,
            roles: { include: { role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        roles: {
          include: { permissions: { include: { permission: true } }, users: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    const [permissions, invitations] = await Promise.all([
      prisma.permission.findMany({ orderBy: { key: 'asc' } }),
      company
        ? prisma.companyInvitation.findMany({
            where: { companyId: company.id, acceptedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ])

    return {
      ok: true,
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        roleName: invitation.roleName,
        expiresAt: invitation.expiresAt.toISOString(),
      })),
      company: company
        ? {
            id: company.id,
            name: company.name,
            slug: company.slug,
            legalName: company.legalName ?? '',
            logoUrl: company.logoUrl ?? '',
            address: company.address ?? '',
            phone: company.phone ?? '',
            email: company.email ?? '',
            taxId: company.taxId ?? '',
            website: company.website ?? '',
          }
        : null,
      users:
        company?.memberships.map((membership) => ({
          id: membership.id,
          name: membership.user.name,
          email: membership.user.email,
          status: membership.status,
          roles: membership.roles.map((role) => role.role.name),
          lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
        })) ?? [],
      roles:
        company?.roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description ?? '',
          systemKey: role.systemKey,
          users: role.users.length,
          permissions: role.permissions.map((permission) => permission.permission.key),
        })) ?? [],
      permissions: permissions.map((permission) => ({ id: permission.id, key: permission.key, moduleKey: permission.moduleKey })),
    }
  })

export const getInstallationSettings = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const { readFile } = await import('node:fs/promises')
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      name?: string
      type?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const envExample = await readFile('.env.example', 'utf8').catch(() => '')
    const databaseUrl = process.env.DATABASE_URL || envExample.match(/DATABASE_URL="?([^"\r\n]+)"?/)?.[1] || ''

    return {
      ok: true,
      app: {
        name: packageJson.name ?? 'erp-platform',
        type: packageJson.type ?? 'module',
      },
      scripts: packageJson.scripts ?? {},
      runtime: {
        react: packageJson.dependencies?.react ?? '',
        vite: packageJson.devDependencies?.vite ?? '',
        prisma: packageJson.devDependencies?.prisma ?? packageJson.dependencies?.['@prisma/client'] ?? '',
        tanstackStart: packageJson.dependencies?.['@tanstack/react-start'] ?? '',
      },
      database: {
        provider: 'sqlite',
        url: maskDatabaseUrl(databaseUrl),
        envKey: 'DATABASE_URL',
        schema: 'prisma/schema.prisma',
        config: 'prisma.config.ts',
      },
      files: [
        { label: 'Variables environnement', path: '.env / .env.example' },
        { label: 'Schema base de donnees', path: 'prisma/schema.prisma' },
        { label: 'Base locale par defaut', path: 'prisma/dev.db' },
        { label: 'Configuration Prisma', path: 'prisma.config.ts' },
        { label: 'Build serveur', path: '.output/server/index.mjs' },
        { label: 'Manifest PWA', path: 'public/site.webmanifest' },
      ],
    }
  })

export const updateCompanyProfile = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1),
      name: z.string().min(2),
      legalName: z.string().optional(),
      logoUrl: optionalUrlInput,
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      taxId: z.string().optional(),
      website: optionalUrlInput,
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) return { ok: false, message: 'Entreprise introuvable.' }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id: company.id },
        data: {
          name: data.name.trim(),
          legalName: data.legalName?.trim() || null,
          logoUrl: data.logoUrl?.trim() || null,
          address: data.address?.trim() || null,
          phone: data.phone?.trim() || null,
          email: data.email?.trim() || null,
          taxId: data.taxId?.trim() || null,
          website: data.website?.trim() || null,
        },
      })

      await tx.quoteSettings.upsert({
        where: { companyId: updatedCompany.id },
        update: {
          logoUrl: updatedCompany.logoUrl,
          legalName: updatedCompany.legalName || updatedCompany.name,
          address: updatedCompany.address,
          phone: updatedCompany.phone,
          email: updatedCompany.email,
          taxId: updatedCompany.taxId,
        },
        create: {
          companyId: updatedCompany.id,
          logoUrl: updatedCompany.logoUrl,
          legalName: updatedCompany.legalName || updatedCompany.name,
          address: updatedCompany.address,
          phone: updatedCompany.phone,
          email: updatedCompany.email,
          taxId: updatedCompany.taxId,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: updatedCompany.id,
          actorId: auth.user?.id,
          action: 'company.profile_updated',
          entity: 'Company',
          entityId: updatedCompany.id,
          metadata: JSON.stringify({ name: updatedCompany.name, legalName: updatedCompany.legalName }),
        },
      })

      return updatedCompany
    })

    invalidateSessionCache()
    return {
      ok: true,
      company: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        legalName: updated.legalName ?? '',
        logoUrl: updated.logoUrl ?? '',
        address: updated.address ?? '',
        phone: updated.phone ?? '',
        email: updated.email ?? '',
        taxId: updated.taxId ?? '',
        website: updated.website ?? '',
      },
    }
  })

export const createRole = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1),
      name: z.string().min(2),
      description: z.string().optional(),
      permissionKeys: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) return { ok: false, message: 'Entreprise introuvable.' }

    const existing = await prisma.role.findUnique({ where: { companyId_name: { companyId: company.id, name: data.name.trim() } } })
    if (existing) return { ok: false, message: 'Ce role existe deja.' }

    const permissions = await prisma.permission.findMany({ where: { key: { in: data.permissionKeys } } })
    await prisma.role.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        description: data.description?.trim(),
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    })

    invalidateSessionCache()
    return { ok: true }
  })


// Cree le proprietaire, son workspace et sa premiere entreprise, puis ouvre une
// session. Partage par l'installation initiale et l'inscription publique.
async function provisionOwnerWorkspace(input: {
  ownerName: string
  ownerEmail: string
  password: string
  workspaceName: string
  companyName: string
  companySlug: string
}) {
  await ensureCoreDefinitions()

  const owner = await prisma.user.create({
    data: {
      name: input.ownerName.trim(),
      email: input.ownerEmail.toLowerCase().trim(),
      passwordHash: await hashPassword(input.password),
      isOwner: true,
    },
  })

  const workspace = await prisma.workspace.create({
    data: {
      name: input.workspaceName.trim(),
      slug: await uniqueSlug(slugify(input.workspaceName), 'workspace'),
      ownerId: owner.id,
    },
  })

  const company = await createCompanyForOwner({
    workspaceId: workspace.id,
    ownerId: owner.id,
    name: input.companyName.trim(),
    slug: await uniqueSlug(input.companySlug, 'company'),
  })

  await createSessionForUser(owner.id)
  return company
}

// Renvoie un slug libre en suffixant un compteur si la base contient deja le slug.
async function uniqueSlug(base: string, kind: 'workspace' | 'company') {
  const root = base && base.length > 0 ? base : kind === 'company' ? 'entreprise' : 'espace'
  let candidate = root
  for (let n = 2; n < 1000; n += 1) {
    const taken =
      kind === 'workspace'
        ? await prisma.workspace.findUnique({ where: { slug: candidate } })
        : await prisma.company.findUnique({ where: { slug: candidate } })
    if (!taken) return candidate
    const suffix = `-${n}`
    candidate = `${root.slice(0, 60 - suffix.length)}${suffix}`
  }
  return `${root.slice(0, 51)}-${randomBytes(4).toString('hex')}`
}

async function createSessionForUser(userId: string) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + sessionDurationMs)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: getRequestIP({ xForwardedFor: true }) ?? null,
      userAgent: getRequestHeader('user-agent') ?? null,
    },
  })

  setSessionCookie(token, expiresAt)
}

async function createCompanyForOwner(input: {
  workspaceId: string
  ownerId: string
  name: string
  slug: string
  legalName?: string
  logoUrl?: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  website?: string
}) {
  const company = await prisma.company.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      legalName: input.legalName || null,
      logoUrl: input.logoUrl || null,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      taxId: input.taxId || null,
      website: input.website || null,
    },
  })

  await prisma.quoteSettings.create({
    data: {
      companyId: company.id,
      logoUrl: company.logoUrl,
      legalName: company.legalName || company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      taxId: company.taxId,
    },
  })

  const modules = await prisma.moduleDefinition.findMany()
  await prisma.companyModule.createMany({
    data: modules.map((module) => ({
      companyId: company.id,
      moduleId: module.key,
      enabled: true,
    })),
  })

  const permissions = await prisma.permission.findMany()
  const ownerRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Proprietaire',
      description: 'Controle total sur cette entreprise.',
      systemKey: 'owner',
      permissions: { create: permissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  const adminRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Administrateur',
      description: 'Gestion des modules, utilisateurs, roles et operations.',
      systemKey: 'admin',
      permissions: { create: permissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  const accountantPermissions = permissions.filter((permission: Permission) =>
    ['invoice.', 'finance.', 'audit.'].some((prefix) => permission.key.startsWith(prefix)),
  )
  await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Comptable',
      description: 'Gestion finance, factures et rapports comptables.',
      systemKey: 'accountant',
      permissions: { create: accountantPermissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Lecture seule',
      description: 'Consultation sans modification.',
      systemKey: 'readonly',
      permissions: {
        create: permissions
          .filter((permission: Permission) => permission.key.endsWith('.read') || permission.key === 'audit.read')
          .map((permission: Permission) => ({ permissionId: permission.id })),
      },
    },
  })

  const membership = await prisma.companyMembership.create({
    data: {
      userId: input.ownerId,
      companyId: company.id,
      status: 'ACTIVE',
    },
  })

  await prisma.userRole.create({
    data: {
      membershipId: membership.id,
      roleId: ownerRole.id,
    },
  })

  void adminRole
  return company
}

async function ensureCoreDefinitions() {
  const modules = [
    { key: 'crm', name: 'CRM', category: 'Sales', permissions: ['customer.create', 'customer.read', 'customer.update', 'customer.delete'] },
    { key: 'sales', name: 'Ventes', category: 'Sales', permissions: ['invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete'] },
    { key: 'inventory', name: 'Stock', category: 'Operations', permissions: ['inventory.read', 'inventory.update', 'inventory.manage'] },
    { key: 'finance', name: 'Finance', category: 'Finance', permissions: ['finance.read', 'finance.manage', 'audit.read'] },
    { key: 'hr', name: 'RH', category: 'People', permissions: ['employee.create', 'employee.read', 'employee.update', 'employee.delete'] },
    { key: 'settings', name: 'Administration', category: 'Core', permissions: ['company.read', 'company.manage', 'module.enable', 'module.disable'] },
  ]

  for (const module of modules) {
    await prisma.moduleDefinition.upsert({
      where: { key: module.key },
      update: { name: module.name, category: module.category },
      create: { key: module.key, name: module.name, category: module.category },
    })

    for (const permission of module.permissions) {
      await prisma.permission.upsert({
        where: { key: permission },
        update: { moduleKey: module.key },
        create: { key: permission, moduleKey: module.key },
      })
    }
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
