import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'node:path'

const dataDir = resolveDataDir()
const storePath = path.join(dataDir, 'store.json')

export const adminUser = {
  id: 'codexy-admin',
  name: 'Administrador Codexy',
  role: 'Administrador',
  username: 'codexy@admin',
  password: 'codexy@2025',
  status: 'active',
  evolutionInstanceName: 'codexy_prospect_codexy_admin',
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
}

export async function readStore() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    const raw = await fs.readFile(storePath, 'utf8')
    return normalizeStore(JSON.parse(raw.replace(/\0/g, '')))
  } catch (err) {
    console.error('[store] readStore failed, NOT overwriting file:', err.message)
    return structuredClone(initialStore)
  }
}

export async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true })
  const nextStore = normalizeStore(store)
  await fs.writeFile(storePath, JSON.stringify(nextStore, null, 2))
}

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
  return store.assignments.find((assignment) => assignment.leadId === leadId && assignment.status === 'active')
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
  store.activityLog.push({
    id: createId('act'),
    at: new Date().toISOString(),
    ...event,
  })
}

export function addNotification(store, event) {
  store.notifications.push({
    id: createId('ntf'),
    at: new Date().toISOString(),
    read: false,
    ...event,
  })
}

export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  }
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
    Encontrado: 'Aprovado',
    Qualificado: 'Aprovado',
    'Abordagem pronta': 'Abordagem pronta',
    'Mensagem enviada': 'Mensagem enviada',
    'Follow-up': 'Mensagem enviada',
    'Reunião marcada': 'Reunião marcada',
    Fechado: 'Fechado',
    Perdido: 'Perdido',
  }
  return map[stage] || stage
}

function normalizeUsers(users = []) {
  const source = Array.isArray(users) ? users : []
  const admin = normalizeAdminUser(source)
  const normalized = source
    .filter((user) => user?.id !== adminUser.id && user?.username !== adminUser.username)
    .filter((user) => user?.id && user?.username)
    .map((user) => ({
      ...user,
      role: user.role || 'Comercial',
      status: user.status || 'active',
      evolutionInstanceName: user.evolutionInstanceName || buildInstanceName(user.username),
    }))

  return [admin, ...normalized]
}

function normalizeAdminUser(users = []) {
  const existing = Array.isArray(users)
    ? users.find((user) => user.id === adminUser.id || user.username === adminUser.username)
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

function resolveDataDir() {
  const configured = process.env.DATA_DIR
  if (!configured) return path.resolve(process.cwd(), 'server', 'data')
  if (process.platform === 'win32' && configured.startsWith('/opt/')) {
    return path.resolve(process.cwd(), 'server', 'data')
  }
  return configured
}
