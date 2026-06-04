import process from 'node:process'
import { query, withTransaction } from './db.js'

// ── admin user constant (same as before) ─────────────────────────────────────

export const adminUser = {
  id: 'codexy-admin',
  name: 'Administrador Codexy',
  role: 'Administrador',
  username: 'codexy@admin',
  password: 'codexy@2025',
  status: 'active',
  evolutionInstanceName: 'codexy_prospect_codexy_admin',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function dt(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ')
}

function j(value) {
  return value == null ? null : JSON.stringify(value)
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z')
}

// ── readStore ─────────────────────────────────────────────────────────────────

export async function readStore() {
  const [
    usersRows,
    leadRows,
    assignmentRows,
    messageRows,
    followUpRows,
    notifRows,
    activityRows,
    projectRows,
    searchRunRows,
    campaignRows,
    trojanRows,
    cacheRows,
    healthRows,
    configRows,
  ] = await Promise.all([
    query('SELECT * FROM users'),
    query('SELECT * FROM lead_pool'),
    query('SELECT * FROM assignments'),
    query('SELECT * FROM messages'),
    query('SELECT * FROM follow_ups'),
    query('SELECT * FROM notifications'),
    query('SELECT * FROM activity_log'),
    query('SELECT * FROM projects'),
    query('SELECT * FROM search_runs'),
    query('SELECT * FROM campaigns'),
    query('SELECT * FROM trojan_campaigns'),
    query('SELECT * FROM search_cache'),
    query('SELECT * FROM site_health_results'),
    query("SELECT * FROM config WHERE key_name = 'wolfCron'"),
  ])

  const wolfCronRow = configRows[0]
  const wolfCron = wolfCronRow
    ? (typeof wolfCronRow.value === 'string' ? JSON.parse(wolfCronRow.value) : wolfCronRow.value)
    : { enabled: false, dailyLimit: 50, lastRunAt: null, lastRunStats: null }

  const searchCache = {}
  for (const row of cacheRows) {
    searchCache[row.cache_key] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
  }

  const siteHealthResults = {}
  for (const row of healthRows) {
    siteHealthResults[row.lead_id] = {
      status: row.status,
      responseMs: row.response_ms,
      error: row.error,
      url: row.url,
      checkedAt: parseDate(row.checked_at),
    }
  }

  const store = {
    users: usersRows.map(rowToUser),
    campaigns: campaignRows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)),
    searchRuns: searchRunRows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)),
    leadPool: leadRows.map(rowToLead),
    assignments: assignmentRows.map(rowToAssignment),
    messages: messageRows.map(rowToMessage),
    trojanCampaigns: trojanRows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)),
    followUps: followUpRows.map(rowToFollowUp),
    notifications: notifRows.map(rowToNotification),
    activityLog: activityRows.map(rowToActivity),
    searchCache,
    projects: projectRows.map(rowToProject),
    siteHealthResults,
    wolfCron,
  }

  return normalizeStore(store)
}

// ── writeStore ────────────────────────────────────────────────────────────────

export async function writeStore(store) {
  const s = normalizeStore(store)

  await withTransaction(async (conn) => {
    // Users
    await conn.execute('DELETE FROM users')
    for (const u of s.users) {
      await conn.execute(
        `INSERT INTO users (id, name, username, password, role, status, evolution_instance_name)
         VALUES (?,?,?,?,?,?,?)`,
        [u.id, u.name, u.username, u.password, u.role, u.status, u.evolutionInstanceName || null]
      )
    }

    // Lead pool
    await conn.execute('DELETE FROM lead_pool')
    for (const l of s.leadPool) {
      await conn.execute(
        `INSERT INTO lead_pool
         (id, name, category, city, phone, website, instagram, address, place_id, source,
          product, opportunity, pain, score, classification, agent_advice, status, availability,
          fingerprint, first_seen_at, last_seen_at, last_contact_at, last_owner_id,
          discarded_reason, cnpj, cnpj_razao_social, cnpj_porte, cnpj_capital_social,
          cnpj_data_abertura, cnpj_situacao, cnpj_cnae, email, rating, reviews,
          source_keywords, campaign_ids, found_by_ids, score_reasons, score_warnings,
          cnpj_socios, from_cache)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          l.id, l.name, l.category, l.city, l.phone, l.website, l.instagram, l.address,
          l.placeId || null, l.source,
          l.product, l.opportunity, l.pain, l.score, l.classification, l.agentAdvice,
          l.status, l.availability, l.fingerprint || null,
          dt(l.firstSeenAt), dt(l.lastSeenAt), dt(l.lastContactAt), l.lastOwnerId || null,
          l.discardedReason || null, l.cnpj || null, l.cnpjRazaoSocial || null,
          l.cnpjPorte || null, l.cnpjCapitalSocial != null ? Number(l.cnpjCapitalSocial) : null,
          l.cnpjDataAbertura || null, l.cnpjSituacao || null, l.cnpjCnae || null,
          l.email || null,
          l.rating != null ? Number(l.rating) : null, l.reviews || 0,
          j(l.sourceKeywords), j(l.campaignIds), j(l.foundByIds),
          j(l.scoreReasons), j(l.scoreWarnings), j(l.cnpjSocios),
          l.fromCache ? 1 : 0,
        ]
      )
    }

    // Assignments
    await conn.execute('DELETE FROM assignments')
    for (const a of s.assignments) {
      await conn.execute(
        `INSERT INTO assignments
         (id, lead_id, owner_id, campaign_id, stage, status, temperature, approach,
          next_action, created_at, updated_at, released_at, history)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          a.id, a.leadId, a.ownerId, a.campaignId || null, a.stage, a.status,
          a.temperature, a.approach, a.nextAction,
          dt(a.createdAt), dt(a.updatedAt), dt(a.releasedAt), j(a.history),
        ]
      )
    }

    // Messages
    await conn.execute('DELETE FROM messages')
    for (const m of s.messages) {
      await conn.execute(
        `INSERT INTO messages
         (id, user_id, lead_id, assignment_id, number, text, status, provider_status,
          source, campaign_id, campaign_name, variant_index, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          m.id, m.userId || null, m.leadId || null, m.assignmentId || null,
          m.number || null, m.text, m.status, m.providerStatus || null,
          m.source || null, m.campaignId || null, m.campaignName || null,
          m.variantIndex != null ? Number(m.variantIndex) : null, dt(m.createdAt),
        ]
      )
    }

    // Follow-ups
    await conn.execute('DELETE FROM follow_ups')
    for (const f of s.followUps) {
      await conn.execute(
        `INSERT INTO follow_ups
         (id, lead_id, owner_id, assignment_id, step, text, status, due_at, created_at, completed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          f.id, f.leadId, f.ownerId, f.assignmentId || null, f.step,
          f.text, f.status, dt(f.dueAt), dt(f.createdAt), dt(f.completedAt),
        ]
      )
    }

    // Notifications
    await conn.execute('DELETE FROM notifications')
    for (const n of s.notifications) {
      const { id, userId, type, leadId, leadName, text, at, read, ...extra } = n
      const extraData = Object.keys(extra).length ? extra : null
      await conn.execute(
        `INSERT INTO notifications
         (id, user_id, type, lead_id, lead_name, text, at, is_read, extra_data)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, userId || null, type || null, leadId || null, leadName || null,
         text || null, dt(at), read ? 1 : 0, j(extraData)]
      )
    }

    // Activity log
    await conn.execute('DELETE FROM activity_log')
    for (const a of s.activityLog) {
      await conn.execute(
        `INSERT INTO activity_log (id, at, type, user_id, lead_id, assignment_id, run_id, text)
         VALUES (?,?,?,?,?,?,?,?)`,
        [a.id, dt(a.at), a.type || null, a.userId || null, a.leadId || null,
         a.assignmentId || null, a.runId || null, a.text || null]
      )
    }

    // Projects
    await conn.execute('DELETE FROM projects')
    for (const p of s.projects) {
      await conn.execute(
        `INSERT INTO projects
         (id, name, client, value, tool, assignee, stage, notes, due_date, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id, p.name, p.client || '', p.value != null ? Number(p.value) : null,
          p.tool || '', p.assignee || '', p.stage || '', p.notes || '',
          p.dueDate || null, dt(p.createdAt), dt(p.updatedAt),
        ]
      )
    }

    // Search runs
    await conn.execute('DELETE FROM search_runs')
    for (const r of s.searchRuns) {
      await conn.execute(`INSERT INTO search_runs (id, data) VALUES (?,?)`, [r.id, j(r)])
    }

    // Campaigns
    await conn.execute('DELETE FROM campaigns')
    for (const c of s.campaigns) {
      await conn.execute(`INSERT INTO campaigns (id, data) VALUES (?,?)`, [c.id, j(c)])
    }

    // Trojan campaigns
    await conn.execute('DELETE FROM trojan_campaigns')
    for (const c of s.trojanCampaigns) {
      await conn.execute(`INSERT INTO trojan_campaigns (id, data) VALUES (?,?)`, [c.id, j(c)])
    }

    // Search cache — upsert only, never delete (cache can be large / external)
    for (const [key, value] of Object.entries(s.searchCache)) {
      await conn.execute(
        `REPLACE INTO search_cache (cache_key, data) VALUES (?,?)`,
        [key, j(value)]
      )
    }

    // Site health results — upsert only
    for (const [leadId, h] of Object.entries(s.siteHealthResults)) {
      await conn.execute(
        `REPLACE INTO site_health_results (lead_id, status, response_ms, error, url, checked_at)
         VALUES (?,?,?,?,?,?)`,
        [leadId, h.status != null ? Number(h.status) : null,
         h.responseMs != null ? Number(h.responseMs) : null,
         h.error || null, h.url || null, dt(h.checkedAt)]
      )
    }

    // Wolf cron config
    await conn.execute(
      `REPLACE INTO config (key_name, value) VALUES ('wolfCron', ?)`,
      [j(s.wolfCron)]
    )
  })
}

// ── row mappers ───────────────────────────────────────────────────────────────

function rowToUser(r) {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    password: r.password,
    role: r.role,
    status: r.status,
    evolutionInstanceName: r.evolution_instance_name,
  }
}

function rowToLead(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    city: r.city,
    phone: r.phone,
    website: r.website,
    instagram: r.instagram,
    address: r.address,
    placeId: r.place_id,
    source: r.source,
    product: r.product,
    opportunity: r.opportunity,
    pain: r.pain,
    score: r.score,
    classification: r.classification,
    agentAdvice: r.agent_advice,
    status: r.status,
    availability: r.availability,
    fingerprint: r.fingerprint,
    firstSeenAt: parseDate(r.first_seen_at),
    lastSeenAt: parseDate(r.last_seen_at),
    lastContactAt: parseDate(r.last_contact_at),
    lastOwnerId: r.last_owner_id,
    discardedReason: r.discarded_reason,
    cnpj: r.cnpj,
    cnpjRazaoSocial: r.cnpj_razao_social,
    cnpjPorte: r.cnpj_porte,
    cnpjCapitalSocial: r.cnpj_capital_social,
    cnpjDataAbertura: r.cnpj_data_abertura,
    cnpjSituacao: r.cnpj_situacao,
    cnpjCnae: r.cnpj_cnae,
    email: r.email,
    rating: r.rating,
    reviews: r.reviews,
    sourceKeywords: parseJson(r.source_keywords, []),
    campaignIds: parseJson(r.campaign_ids, []),
    foundByIds: parseJson(r.found_by_ids, []),
    scoreReasons: parseJson(r.score_reasons, []),
    scoreWarnings: parseJson(r.score_warnings, []),
    cnpjSocios: parseJson(r.cnpj_socios, []),
    fromCache: Boolean(r.from_cache),
  }
}

function rowToAssignment(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    ownerId: r.owner_id,
    campaignId: r.campaign_id,
    stage: r.stage,
    status: r.status,
    temperature: r.temperature,
    approach: r.approach,
    nextAction: r.next_action,
    createdAt: parseDate(r.created_at),
    updatedAt: parseDate(r.updated_at),
    releasedAt: parseDate(r.released_at),
    history: parseJson(r.history, []),
  }
}

function rowToMessage(r) {
  return {
    id: r.id,
    userId: r.user_id,
    leadId: r.lead_id,
    assignmentId: r.assignment_id,
    number: r.number,
    text: r.text,
    status: r.status,
    providerStatus: r.provider_status,
    source: r.source,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    variantIndex: r.variant_index,
    createdAt: parseDate(r.created_at),
  }
}

function rowToFollowUp(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    ownerId: r.owner_id,
    assignmentId: r.assignment_id,
    step: r.step,
    text: r.text,
    status: r.status,
    dueAt: parseDate(r.due_at),
    createdAt: parseDate(r.created_at),
    completedAt: parseDate(r.completed_at),
  }
}

function rowToNotification(r) {
  const extra = parseJson(r.extra_data, {})
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    leadId: r.lead_id,
    leadName: r.lead_name,
    text: r.text,
    at: parseDate(r.at),
    read: Boolean(r.is_read),
    ...extra,
  }
}

function rowToActivity(r) {
  return {
    id: r.id,
    at: parseDate(r.at),
    type: r.type,
    userId: r.user_id,
    leadId: r.lead_id,
    assignmentId: r.assignment_id,
    runId: r.run_id,
    text: r.text,
  }
}

function rowToProject(r) {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    value: r.value,
    tool: r.tool,
    assignee: r.assignee,
    stage: r.stage,
    notes: r.notes,
    dueDate: r.due_date,
    createdAt: parseDate(r.created_at),
    updatedAt: parseDate(r.updated_at),
  }
}

function parseJson(value, fallback) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return fallback }
}

// ── utility exports (unchanged API) ──────────────────────────────────────────

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function isAdmin(user) {
  return user?.role === 'Administrador'
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isAdmin: isAdmin(user),
  }
}

export function activeAssignmentForLead(store, leadId) {
  return store.assignments.find((a) => a.leadId === leadId && a.status === 'active')
}

export function canAccessAssignment(user, assignment) {
  return Boolean(isAdmin(user) || assignment?.ownerId === user?.id)
}

export function canClaimLead(store, leadId) {
  const lead = store.leadPool.find((item) => item.id === leadId)
  if (!lead) return false
  if (activeAssignmentForLead(store, leadId)) return false
  return ['pending_approval', 'available', 'inactive', 'lost', 'reactivable', 'discarded'].includes(lead.availability)
}

export function addActivity(store, event) {
  store.activityLog.push({ id: createId('act'), at: new Date().toISOString(), ...event })
}

export function addNotification(store, event) {
  store.notifications.push({ id: createId('ntf'), at: new Date().toISOString(), read: false, ...event })
}

export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function leadFingerprint(lead) {
  if (lead.placeId) return `place:${lead.placeId}`
  const phone = String(lead.phone || '').replace(/\D/g, '')
  if (phone) return `phone:${phone}`
  return `name:${normalizeKey(lead.name)}|city:${normalizeKey(lead.city)}|address:${normalizeKey(lead.address)}`
}

// ── normalizeStore (unchanged logic) ─────────────────────────────────────────

function normalizeStore(store = {}) {
  const migrated = migrateLegacyStore(store)
  return {
    users: normalizeUsers(migrated.users),
    campaigns: Array.isArray(migrated.campaigns) ? migrated.campaigns : [],
    searchRuns: Array.isArray(migrated.searchRuns) ? migrated.searchRuns : [],
    leadPool: Array.isArray(migrated.leadPool) ? migrated.leadPool.map(normalizeLead) : [],
    assignments: Array.isArray(migrated.assignments) ? migrated.assignments.map(normalizeAssignment) : [],
    messages: Array.isArray(migrated.messages) ? migrated.messages : [],
    trojanCampaigns: Array.isArray(migrated.trojanCampaigns) ? migrated.trojanCampaigns : [],
    followUps: Array.isArray(migrated.followUps) ? migrated.followUps.map(normalizeFollowUp) : [],
    notifications: Array.isArray(migrated.notifications) ? migrated.notifications : [],
    activityLog: Array.isArray(migrated.activityLog) ? migrated.activityLog : [],
    searchCache: migrated.searchCache && typeof migrated.searchCache === 'object' ? migrated.searchCache : {},
    projects: Array.isArray(migrated.projects) ? migrated.projects : [],
    siteHealthResults: migrated.siteHealthResults && typeof migrated.siteHealthResults === 'object' ? migrated.siteHealthResults : {},
    wolfCron: migrated.wolfCron && typeof migrated.wolfCron === 'object'
      ? migrated.wolfCron
      : { enabled: false, dailyLimit: 50, lastRunAt: null, lastRunStats: null },
  }
}

const initialStore = {
  users: [adminUser],
  campaigns: [],
  searchRuns: [],
  leadPool: [],
  assignments: [],
  messages: [],
  trojanCampaigns: [],
  followUps: [],
  notifications: [],
  activityLog: [],
  searchCache: {},
  projects: [],
  siteHealthResults: {},
  wolfCron: { enabled: false, dailyLimit: 50, lastRunAt: null, lastRunStats: null },
}

function migrateLegacyStore(store) {
  if (Array.isArray(store.leadPool)) return store

  const leadPool = []
  const assignments = []
  const followUps = []
  const legacyLeads = Array.isArray(store.leads) ? store.leads : []

  for (const legacy of legacyLeads) {
    if (!legacy?.name) continue
    const leadId = legacy.id || createId('lead')
    leadPool.push({
      ...legacy,
      id: leadId,
      availability: legacy.ownerId ? 'active' : 'available',
      status: legacy.ownerId ? 'approved' : 'available',
      fingerprint: leadFingerprint(legacy),
      scoreReasons: legacy.scoreReasons || buildLegacyReasons(legacy),
      agentAdvice: legacy.agentAdvice || legacy.pain || 'Revise os sinais comerciais antes da abordagem.',
      sourceKeywords: legacy.sourceKeywords || [],
      firstSeenAt: legacy.createdAt || new Date().toISOString(),
      lastSeenAt: legacy.createdAt || new Date().toISOString(),
    })

    if (legacy.ownerId) {
      assignments.push({
        id: createId('asn'),
        leadId,
        ownerId: legacy.ownerId,
        stage: normalizeStage(legacy.stage || 'Qualificado'),
        status: 'active',
        approach: legacy.approach || '',
        createdAt: legacy.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: Array.isArray(legacy.history) ? legacy.history : [],
      })
    }

    if (Array.isArray(legacy.followUps) && legacy.ownerId) {
      legacy.followUps.forEach((text, index) => {
        followUps.push({
          id: createId('fu'),
          leadId,
          ownerId: legacy.ownerId,
          step: index + 1,
          text,
          status: 'pending',
          dueAt: new Date(Date.now() + (index + 1) * 86400000).toISOString(),
          createdAt: new Date().toISOString(),
        })
      })
    }
  }

  return {
    ...initialStore,
    ...store,
    leadPool,
    assignments,
    followUps,
    searchRuns: Array.isArray(store.searchRuns) ? store.searchRuns : [],
    activityLog: Array.isArray(store.activityLog) ? store.activityLog : [],
    searchCache: store.searchCache || {},
  }
}

function normalizeLead(lead) {
  return {
    id: lead.id || createId('lead'),
    name: lead.name || 'Lead sem nome',
    category: lead.category || 'Sem categoria',
    city: lead.city || '',
    phone: lead.phone || '',
    rating: lead.rating ?? null,
    reviews: lead.reviews || 0,
    website: lead.website || '',
    instagram: lead.instagram || '',
    address: lead.address || '',
    placeId: lead.placeId || lead.place_id || null,
    source: lead.source || 'manual',
    sourceKeywords: Array.isArray(lead.sourceKeywords) ? lead.sourceKeywords : [],
    campaignIds: Array.isArray(lead.campaignIds) ? lead.campaignIds : [],
    foundByIds: Array.isArray(lead.foundByIds) ? lead.foundByIds : [],
    product: lead.product || 'Landing Pages',
    opportunity: lead.opportunity || 'presenca-digital',
    pain: lead.pain || 'Presença digital pode ser melhor explorada para gerar contatos.',
    score: Number.isFinite(lead.score) ? lead.score : 50,
    scoreReasons: Array.isArray(lead.scoreReasons) ? lead.scoreReasons : buildLegacyReasons(lead),
    scoreWarnings: Array.isArray(lead.scoreWarnings) ? lead.scoreWarnings : [],
    classification: lead.classification || 'medium',
    agentAdvice: lead.agentAdvice || lead.pain || 'Revise o lead antes de abordar.',
    status: lead.status || 'available',
    availability: lead.availability || 'available',
    fingerprint: lead.fingerprint || leadFingerprint(lead),
    firstSeenAt: lead.firstSeenAt || lead.createdAt || new Date().toISOString(),
    lastSeenAt: lead.lastSeenAt || lead.createdAt || new Date().toISOString(),
    lastContactAt: lead.lastContactAt || null,
    lastOwnerId: lead.lastOwnerId || null,
    discardedReason: lead.discardedReason || null,
    cnpj: lead.cnpj || null,
    cnpjRazaoSocial: lead.cnpjRazaoSocial || null,
    cnpjPorte: lead.cnpjPorte || null,
    cnpjCapitalSocial: lead.cnpjCapitalSocial ?? null,
    cnpjDataAbertura: lead.cnpjDataAbertura || null,
    cnpjSituacao: lead.cnpjSituacao || null,
    cnpjCnae: lead.cnpjCnae || null,
    cnpjSocios: Array.isArray(lead.cnpjSocios) ? lead.cnpjSocios : [],
    email: lead.email || null,
    fromCache: Boolean(lead.fromCache),
  }
}

function normalizeAssignment(assignment) {
  return {
    id: assignment.id || createId('asn'),
    leadId: assignment.leadId,
    ownerId: assignment.ownerId,
    campaignId: assignment.campaignId || null,
    stage: normalizeStage(assignment.stage || 'Aprovado'),
    status: assignment.status || 'active',
    temperature: assignment.temperature || 'morno',
    approach: assignment.approach || '',
    nextAction: assignment.nextAction || 'Preparar abordagem',
    createdAt: assignment.createdAt || new Date().toISOString(),
    updatedAt: assignment.updatedAt || new Date().toISOString(),
    releasedAt: assignment.releasedAt || null,
    history: Array.isArray(assignment.history) ? assignment.history : [],
  }
}

function normalizeFollowUp(followUp) {
  return {
    id: followUp.id || createId('fu'),
    leadId: followUp.leadId,
    ownerId: followUp.ownerId,
    assignmentId: followUp.assignmentId || null,
    step: followUp.step || 1,
    text: followUp.text || '',
    status: followUp.status || 'pending',
    dueAt: followUp.dueAt || new Date().toISOString(),
    createdAt: followUp.createdAt || new Date().toISOString(),
    completedAt: followUp.completedAt || null,
  }
}

function normalizeStage(stage) {
  const map = {
    Encontrado: 'Aprovado', Qualificado: 'Aprovado',
    'Abordagem pronta': 'Abordagem pronta',
    'Mensagem enviada': 'Mensagem enviada',
    'Follow-up': 'Mensagem enviada',
    'Reunião marcada': 'Reunião marcada',
    Fechado: 'Fechado', Perdido: 'Perdido',
  }
  return map[stage] || stage
}

function normalizeUsers(users = []) {
  const source = Array.isArray(users) ? users : []
  const admin = normalizeAdminUser(source)
  const normalized = source
    .filter((u) => u?.id !== adminUser.id && u?.username !== adminUser.username)
    .filter((u) => u?.id && u?.username)
    .map((u) => ({
      ...u,
      role: u.role || 'Comercial',
      status: u.status || 'active',
      evolutionInstanceName: u.evolutionInstanceName || buildInstanceName(u.username),
    }))
  return [admin, ...normalized]
}

function normalizeAdminUser(users = []) {
  const existing = Array.isArray(users)
    ? users.find((u) => u.id === adminUser.id || u.username === adminUser.username)
    : null
  return {
    ...adminUser,
    ...(existing || {}),
    id: adminUser.id,
    name: adminUser.name,
    role: adminUser.role,
    username: adminUser.username,
    password: adminUser.password,
    status: 'active',
    evolutionInstanceName: adminUser.evolutionInstanceName,
  }
}

function buildInstanceName(username) {
  return `codexy_prospect_${String(username).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
}

function buildLegacyReasons(lead) {
  const reasons = []
  if (lead.phone) reasons.push('Tem telefone/WhatsApp para abordagem direta.')
  if (!lead.website) reasons.push('Não possui site identificado.')
  if ((lead.rating || 0) >= 4.5) reasons.push('Boa reputação no Google.')
  if ((lead.reviews || 0) >= 40) reasons.push('Volume relevante de avaliações.')
  return reasons
}

// Keep DATA_DIR resolution for backwards compatibility (prospecting.js may still use it)
export function resolveDataDir() {
  const configured = process.env.DATA_DIR
  if (!configured) return null
  if (process.platform === 'win32' && configured.startsWith('/opt/')) return null
  return configured
}
