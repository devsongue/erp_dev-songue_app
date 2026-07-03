import 'dotenv/config'
import { prisma } from './src/server/db'
import { hashPassword } from './src/server/password'

async function main() {
  const email = 'foundanen.tuo@devsongue.com'
  const password = 'Devsongue61996@'

  // Delete existing users if any, or just check.
  let user = await prisma.user.findUnique({ where: { email } })
  if (user) {
    console.log('Account exists, updating password...')
    await prisma.user.update({
      where: { email },
      data: { passwordHash: hashPassword(password) }
    })
    console.log('Password updated successfully!')
    return
  }

  user = await prisma.user.create({
    data: {
      name: 'Foundanen Tuo',
      email: email,
      passwordHash: hashPassword(password),
      isOwner: true,
    }
  })

  // Create workspace and company (if not exists)
  let workspace = await prisma.workspace.findFirst()
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { 
        name: 'Espace Devsongue',
        slug: 'espace-devsongue',
        ownerId: user.id
      },
    })
  }

  let company = await prisma.company.findFirst()
  if (!company) {
    company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Devsongue',
        slug: 'devsongue',
      },
    })
  }

  const role = await prisma.role.findFirst({ where: { name: 'Owner' } })

  await prisma.companyMembership.create({
    data: {
      userId: user.id,
      companyId: company.id,
      status: 'ACTIVE',
      roles: role ? {
        create: { roleId: role.id }
      } : undefined
    }
  })

  console.log('Account created successfully:', user.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
