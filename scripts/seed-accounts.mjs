// Creates (or resets) the single Atlasyn admin and one demo employee in Supabase.
// Usage: node --env-file=.env.development.local scripts/seed-accounts.mjs
// Passwords are generated here and printed once; they are never written to disk.
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const password = (prefix) => prefix + Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('') + '7'

const accounts = [
  { email: 'montassar@atlasyn.com', name: 'Montassar Bali', title: 'Chief Executive Officer', role: 'admin', mustChange: true, password: password('Atlas-') },
  { email: 'sara.demo@atlasyn.com', name: 'Sara Mansour', title: 'Data Analyst (demo)', role: 'employee', mustChange: false, password: password('Demo-') },
]

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit || data.users.length < 200) return hit ?? null
  }
  return null
}

for (const account of accounts) {
  let user = await findUser(account.email)
  if (user) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password: account.password, ban_duration: 'none' })
    if (error) throw error
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { name: account.name } })
    if (error) throw error
    user = data.user
  }
  const { error } = await db.from('profiles').upsert({
    id: user.id, email: account.email, name: account.name, title: account.title,
    role: account.role, must_change_password: account.mustChange, active: true,
  })
  if (error) throw error
}

// Exactly one admin: anyone else holding the role is demoted.
const { error: demoteError } = await db.from('profiles').update({ role: 'employee' }).eq('role', 'admin').neq('email', accounts[0].email)
if (demoteError) throw demoteError

for (const a of accounts) console.log(`${a.role.padEnd(8)} ${a.email.padEnd(24)} ${a.password}${a.mustChange ? '   (must be changed at first sign-in)' : ''}`)
