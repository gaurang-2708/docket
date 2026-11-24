import bcrypt from 'bcryptjs';
import { prisma } from './index.ts';

// Demo accounts. The sign-in page's demo buttons use these same credentials.
const users = [
  { email: 'reviewer@docket.demo', name: 'Asha Mehta', role: 'REVIEWER' as const, password: 'review-docs-2025' },
  { email: 'admin@docket.demo', name: 'Kiran Desai', role: 'ADMIN' as const, password: 'admin-docs-2025' },
];

for (const u of users) {
  const passwordHash = await bcrypt.hash(u.password, 10);
  await prisma.user.upsert({ where: { email: u.email }, update: { passwordHash, name: u.name, role: u.role }, create: { email: u.email, name: u.name, role: u.role, passwordHash } });
  console.log(`user ${u.email} (${u.role})`);
}
await prisma.$disconnect();
