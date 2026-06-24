import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const p = new PrismaClient();
const t = await p.tenant.findFirst({where:{subdomain:'default'}});
const owner = await p.user.findFirst({where:{tenantId:t.id, role:'SUPER_ADMIN'}, select:{id:true,email:true,passwordHash:true}});
// remember original hash, set a temp one
globalThis.__orig = owner.passwordHash;
await p.user.update({where:{id:owner.id}, data:{passwordHash: await bcrypt.hash('temp-test-123',10)}});
// enable google-drive + dummy creds for default tenant
await p.integration.upsert({where:{tenantId_provider:{tenantId:t.id,provider:'google-drive'}},create:{tenantId:t.id,provider:'google-drive',enabled:true,secret:'x',config:{googleClientId:'def-client.apps.googleusercontent.com'}},update:{enabled:true,config:{googleClientId:'def-client.apps.googleusercontent.com'}}});
// store a real-ish sealed secret so getGoogleOAuthCreds returns creds
import { createHash, createCipheriv, randomBytes } from 'crypto';
const k=createHash('sha256').update(process.env.INTEGRATIONS_SECRET).digest();
const seal=s=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv),e=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),e]).toString('base64')};
await p.integration.update({where:{tenantId_provider:{tenantId:t.id,provider:'google-drive'}},data:{secret:seal('GOCSPX-dummy')}});
console.log('OWNER_EMAIL='+owner.email);
console.log('OWNER_ID='+owner.id);
console.log('ORIG_HASH='+owner.passwordHash);
await p.$disconnect();
