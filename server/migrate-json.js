/**
 * One-time migration: store.json → MySQL
 * Usage: node server/migrate-json.js
 *
 * Set DB_* env vars before running (or they default to localhost root).
 * Safe to re-run — uses REPLACE INTO / INSERT IGNORE so duplicates are skipped.
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── helpers ──────────────────────────────────────────────────────────────────

function dt(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ')
}

function j(value) {
  return value == null ? null : JSON.stringify(value)
}

function num(value) {
  const n = Number(value)
  return isFinite(n) ? n : null
}

// ── connection ────────────────────────────────────────────────────────────────

async function connect() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'codexy_prospect',
    multipleStatements: false,
    timezone: 'Z',
  })
  return conn
}

// ── load store.json ───────────────────────────────────────────────────────────

async function loadStore() {
  const candidates = [
    path.join(__dirname, 'data', 'store.json'),
    path.join(__dirname, 'data', 'good-store.json'),
  ]
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      console.log(`Loaded store from ${p}`)
      return JSON.parse(raw.replace(/\0/g, ''))
    } catch {}
  }
  throw new Error('Could not find store.json or good-store.json in server/data/')
}

// ── table inserters ───────────────────────────────────────────────────────────

async function insertUsers(conn, users = []) {
  let count = 0
  for (const u of users) {
    if (!u?.id) continue
    await conn.execute(
      `REPLACE INTO users (id, name, username, password, role, status, evolution_instance_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.name || '', u.username || '', u.password || '', u.role || 'Comercial', u.status || 'active', u.evolutionInstanceName || null]
    )
    count++
  }
  return count
}

async function insertLeads(conn, leads = []) {
  let count = 0
  for (const l of leads) {
    if (!l?.id) continue
    await conn.execute(
      `REPLACE INTO lead_pool
       (id, name, category, city, phone, website, instagram, address, place_id, source,
        product, opportunity, pain, score, classification, agent_advice, status, availability,
        fingerprint, first_seen_at, last_seen_at, last_contact_at, last_owner_id,
        discarded_reason, cnpj, cnpj_razao_social, cnpj_porte, cnpj_capital_social,
        cnpj_data_abertura, cnpj_situacao, cnpj_cnae, email, rating, reviews,
        source_keywords, campaign_ids, found_by_ids, score_reasons, score_warnings,
        cnpj_socios, from_cache)
       VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?)`,
      [
        l.id, l.name || '', l.category || '', l.city || '', l.phone || '',
        l.website || '', l.instagram || '', l.address || '', l.placeId || l.place_id || null, l.source || 'manual',
        l.product || '', l.opportunity || '', l.pain || '', num(l.score) ?? 50, l.classification || 'medium',
        l.agentAdvice || '', l.status || 'available', l.availability || 'available',
        l.fingerprint || null, dt(l.firstSeenAt), dt(l.lastSeenAt), dt(l.lastContactAt), l.lastOwnerId || null,
        l.discardedReason || null, l.cnpj || null, l.cnpjRazaoSocial || null, l.cnpjPorte || null,
        num(l.cnpjCapitalSocial), l.cnpjDataAbertura || null, l.cnpjSituacao || null,
        l.cnpjCnae || null, l.email || null,
        num(l.rating), num(l.reviews) ?? 0,
        j(l.sourceKeywords || []), j(l.campaignIds || []), j(l.foundByIds || []),
        j(l.scoreReasons || []), j(l.scoreWarnings || []),
        j(l.cnpjSocios || []), l.fromCache ? 1 : 0,
      ]
    )
    count++
  }
  return count
}

async function insertAssignments(conn, assignments = []) {
  let count = 0
  for (const a of assignments) {
    if (!a?.id) continue
    await conn.execute(
      `REPLACE INTO assignments
       (id, lead_id, owner_id, campaign_id, stage, status, temperature, approach,
        next_action, created_at, updated_at, released_at, history)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        a.id, a.leadId, a.ownerId, a.campaignId || null, a.stage || 'Aprovado',
        a.status || 'active', a.temperature || 'morno', a.approach || '',
        a.nextAction || '', dt(a.createdAt), dt(a.updatedAt), dt(a.releasedAt),
        j(a.history || []),
      ]
    )
    count++
  }
  return count
}

async function insertMessages(conn, messages = []) {
  let count = 0
  for (const m of messages) {
    if (!m?.id) continue
    await conn.execute(
      `REPLACE INTO messages
       (id, user_id, lead_id, assignment_id, number, text, status, provider_status,
        source, campaign_id, campaign_name, variant_index, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id, m.userId || null, m.leadId || null, m.assignmentId || null,
        m.number || null, m.text || '', m.status || 'sent', m.providerStatus || null,
        m.source || null, m.campaignId || null, m.campaignName || null,
        m.variantIndex != null ? Number(m.variantIndex) : null, dt(m.createdAt),
      ]
    )
    count++
  }
  return count
}

async function insertFollowUps(conn, followUps = []) {
  let count = 0
  for (const f of followUps) {
    if (!f?.id) continue
    await conn.execute(
      `REPLACE INTO follow_ups
       (id, lead_id, owner_id, assignment_id, step, text, status, due_at, created_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        f.id, f.leadId, f.ownerId, f.assignmentId || null, f.step || 1,
        f.text || '', f.status || 'pending', dt(f.dueAt), dt(f.createdAt), dt(f.completedAt),
      ]
    )
    count++
  }
  return count
}

async function insertNotifications(conn, notifications = []) {
  let count = 0
  for (const n of notifications) {
    if (!n?.id) continue
    const { id, userId, type, leadId, leadName, text, at, read, ...extra } = n
    const extraKeys = Object.keys(extra)
    const extraData = extraKeys.length ? extra : null
    await conn.execute(
      `REPLACE INTO notifications
       (id, user_id, type, lead_id, lead_name, text, at, is_read, extra_data)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, userId || null, type || null, leadId || null, leadName || null,
       text || null, dt(at), read ? 1 : 0, j(extraData)]
    )
    count++
  }
  return count
}

async function insertActivityLog(conn, activityLog = []) {
  let count = 0
  for (const a of activityLog) {
    if (!a?.id) continue
    await conn.execute(
      `REPLACE INTO activity_log
       (id, at, type, user_id, lead_id, assignment_id, run_id, text)
       VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, dt(a.at), a.type || null, a.userId || null, a.leadId || null,
       a.assignmentId || null, a.runId || null, a.text || null]
    )
    count++
  }
  return count
}

async function insertProjects(conn, projects = []) {
  let count = 0
  for (const p of projects) {
    if (!p?.id) continue
    await conn.execute(
      `REPLACE INTO projects
       (id, name, client, value, tool, assignee, stage, notes, due_date, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, p.name || '', p.client || '', p.value != null ? Number(p.value) : null,
        p.tool || '', p.assignee || '', p.stage || '', p.notes || '',
        p.dueDate || null, dt(p.createdAt), dt(p.updatedAt),
      ]
    )
    count++
  }
  return count
}

async function insertSearchRuns(conn, searchRuns = []) {
  let count = 0
  for (const r of searchRuns) {
    if (!r?.id) continue
    await conn.execute(`REPLACE INTO search_runs (id, data) VALUES (?, ?)`, [r.id, j(r)])
    count++
  }
  return count
}

async function insertCampaigns(conn, campaigns = []) {
  let count = 0
  for (const c of campaigns) {
    if (!c?.id) continue
    await conn.execute(`REPLACE INTO campaigns (id, data) VALUES (?, ?)`, [c.id, j(c)])
    count++
  }
  return count
}

async function insertTrojanCampaigns(conn, campaigns = []) {
  let count = 0
  for (const c of campaigns) {
    if (!c?.id) continue
    await conn.execute(`REPLACE INTO trojan_campaigns (id, data) VALUES (?, ?)`, [c.id, j(c)])
    count++
  }
  return count
}

async function insertSearchCache(conn, cache = {}) {
  let count = 0
  for (const [key, value] of Object.entries(cache)) {
    if (!key) continue
    await conn.execute(`REPLACE INTO search_cache (cache_key, data) VALUES (?, ?)`, [key, j(value)])
    count++
  }
  return count
}

async function insertSiteHealthResults(conn, results = {}) {
  let count = 0
  for (const [leadId, h] of Object.entries(results)) {
    if (!leadId || !h) continue
    await conn.execute(
      `REPLACE INTO site_health_results (lead_id, status, response_ms, error, url, checked_at)
       VALUES (?,?,?,?,?,?)`,
      [leadId, h.status != null ? Number(h.status) : null,
       h.responseMs != null ? Number(h.responseMs) : null,
       h.error || null, h.url || null, dt(h.checkedAt)]
    )
    count++
  }
  return count
}

async function insertWolfCron(conn, wolfCron = {}) {
  await conn.execute(`REPLACE INTO config (key_name, value) VALUES ('wolfCron', ?)`, [j(wolfCron)])
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const store = await loadStore()
  const conn = await connect()

  console.log('Connected to MySQL. Starting migration...\n')

  const steps = [
    ['users',              () => insertUsers(conn, store.users)],
    ['lead_pool',          () => insertLeads(conn, store.leadPool)],
    ['assignments',        () => insertAssignments(conn, store.assignments)],
    ['messages',           () => insertMessages(conn, store.messages)],
    ['follow_ups',         () => insertFollowUps(conn, store.followUps)],
    ['notifications',      () => insertNotifications(conn, store.notifications)],
    ['activity_log',       () => insertActivityLog(conn, store.activityLog)],
    ['projects',           () => insertProjects(conn, store.projects)],
    ['search_runs',        () => insertSearchRuns(conn, store.searchRuns)],
    ['campaigns',          () => insertCampaigns(conn, store.campaigns)],
    ['trojan_campaigns',   () => insertTrojanCampaigns(conn, store.trojanCampaigns)],
    ['search_cache',       () => insertSearchCache(conn, store.searchCache || {})],
    ['site_health_results',() => insertSiteHealthResults(conn, store.siteHealthResults || {})],
    ['config (wolfCron)',  () => insertWolfCron(conn, store.wolfCron || {})],
  ]

  for (const [name, fn] of steps) {
    try {
      const count = await fn()
      console.log(`  ✓ ${name}: ${count ?? '—'} row(s)`)
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`)
      await conn.end()
      process.exit(1)
    }
  }

  await conn.end()
  console.log('\nMigration complete.')
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
