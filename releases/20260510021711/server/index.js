import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessionCookie, createSessionCookie, getSession, requireAuth } from './auth.js'
import { connectInstance, getInstanceStatus, sendWhatsAppText } from './evolution.js'
import { buildProspectingPreview, generateApproach, generateFollowUp, runProspectingSearch } from './prospecting.js'
import {
  activeAssignmentForLead,
  addActivity,
  canAccessAssignment,
  canClaimLead,
  createId,
  isAdmin,
  publicUser,
  readStore,
  writeStore,
} from './store.js'

const app = express()
const port = Number(process.env.PORT || 3004)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

const activeStages = ['Aprovado', 'Abordagem pronta', 'Mensagem enviada', 'Respondeu', 'Reunião marcada', 'Proposta enviada']

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'codexy-prospect',
    evolutionConfigured: Boolean(process.env.EVOLUTION_BASE_URL && process.env.EVOLUTION_API_KEY),
    googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    llmConfigured: Boolean(process.env.OPENAI_API_KEY),
  })
})

app.get('/api/auth/session', (req, res) => {
  const session = getSession(req)
  res.json({ user: session ? { id: session.sub, ...session, isAdmin: session.role === 'Administrador' } : null })
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  const store = await readStore()
  const user = store.users.find((item) => item.username === username && item.password === password)
  if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos.' })

  res.setHeader('Set-Cookie', createSessionCookie(user))
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie())
  res.json({ ok: true })
})

app.use('/api', requireAuth)

app.get('/api/dashboard', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const globalAccess = isAdmin(user) && req.query.scope !== 'mine'
  const assignments = visibleAssignments(store, user, globalAccess)
  const messages = visibleMessages(store, user, globalAccess)
  const followUps = visibleFollowUps(store, user, globalAccess)
  const availablePool = store.leadPool.filter((lead) => isAvailableForPool(lead, store))

  res.json({
    crm: {
      scope: globalAccess ? 'global' : 'mine',
      label: globalAccess ? 'CRM global' : 'Meu CRM',
      isGlobal: globalAccess,
      owners: countOwners(store, assignments),
    },
    totals: {
      opportunities: assignments.length,
      qualified: assignments.filter((assignment) => activeStages.includes(assignment.stage)).length,
      sent: messages.filter((message) => message.status === 'sent').length,
      followUps: followUps.filter((followUp) => followUp.status === 'pending').length,
      available: availablePool.length,
      approval: approvalLeads(store, user).length,
    },
    daily: buildDailyQueue(store, user, globalAccess),
    leads: assignments.slice(-20).reverse().map((assignment) => assignmentView(store, assignment)),
    recentRuns: visibleRuns(store, user, globalAccess).slice(-5).reverse(),
  })
})

app.post('/api/prospect/preview', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const preview = buildProspectingPreview(req.body, store, user)
  res.json({ preview })
})

app.post('/api/prospect/runs', async (req, res, next) => {
  try {
    const store = await readStore()
    const user = await getCurrentUser(req, store)
    const preview = req.body.preview || buildProspectingPreview(req.body, store, user)
    preview.createdBy = user.id
    const { run, leads } = await runProspectingSearch({ preview, store })
    addActivity(store, {
      type: 'search_run',
      userId: user.id,
      runId: run.id,
      text: `Busca executada: ${preview.strategy.audience} em ${preview.strategy.region}`,
    })
    await writeStore(store)
    res.status(201).json({ run, leads: leads.map((lead) => leadListView(store, lead)) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/prospect/runs/:id', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const run = store.searchRuns.find((item) => item.id === req.params.id)
  if (!run) return res.status(404).json({ error: 'Busca não encontrada.' })
  if (!isAdmin(user) && run.createdBy !== user.id) return res.status(403).json({ error: 'Busca pertence a outro usuário.' })
  const leads = run.leads
    .map((leadId) => store.leadPool.find((lead) => lead.id === leadId))
    .filter(Boolean)
    .map((lead) => leadListView(store, lead))
  res.json({ run, leads })
})

app.get('/api/leads/approval', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  res.json({ leads: approvalLeads(store, user).map((lead) => leadListView(store, lead)) })
})

app.get('/api/leads/pool', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const leads = store.leadPool
    .filter((lead) => isAdmin(user) || isAvailableForPool(lead, store))
    .map((lead) => leadListView(store, lead))
  res.json({ leads })
})

app.get('/api/leads/:id', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const lead = store.leadPool.find((item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
  const assignment = activeAssignmentForLead(store, lead.id)
  if (assignment && !canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Lead está ativo com outro vendedor.' })
  if (!assignment && !isAdmin(user) && !isAvailableForPool(lead, store)) return res.status(403).json({ error: 'Lead indisponível.' })
  res.json({ lead: leadDetailView(store, lead, assignment) })
})

app.post('/api/leads/:id/approve', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const result = claimLead(store, user, req.params.id, req.body)
  if (result.error) return res.status(result.status).json({ error: result.error })
  await writeStore(store)
  res.status(201).json({ assignment: assignmentView(store, result.assignment) })
})

app.post('/api/leads/:id/claim', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const result = claimLead(store, user, req.params.id, req.body)
  if (result.error) return res.status(result.status).json({ error: result.error })
  await writeStore(store)
  res.status(201).json({ assignment: assignmentView(store, result.assignment) })
})

app.post('/api/leads/:id/discard', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const lead = store.leadPool.find((item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
  const assignment = activeAssignmentForLead(store, lead.id)
  if (assignment && !canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Lead está ativo com outro vendedor.' })

  lead.status = 'discarded'
  lead.availability = 'discarded'
  lead.discardedReason = req.body.reason || 'Descartado manualmente.'
  addActivity(store, { type: 'lead_discarded', userId: user.id, leadId: lead.id, text: lead.discardedReason })
  await writeStore(store)
  res.json({ lead: leadListView(store, lead) })
})

app.get('/api/crm', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const globalAccess = isAdmin(user) && req.query.scope === 'global'
  res.json({ assignments: visibleAssignments(store, user, globalAccess).map((assignment) => assignmentView(store, assignment)) })
})

app.post('/api/assignments/:id/stage', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const assignment = store.assignments.find((item) => item.id === req.params.id)
  if (!assignment) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (!canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Atendimento pertence a outro vendedor.' })
  assignment.stage = req.body.stage || assignment.stage
  assignment.nextAction = req.body.nextAction || assignment.nextAction
  assignment.updatedAt = new Date().toISOString()
  assignment.history.push({ at: assignment.updatedAt, type: 'stage', text: `Etapa alterada para ${assignment.stage}.` })

  const lead = store.leadPool.find((item) => item.id === assignment.leadId)
  if (lead && ['Perdido', 'Inativo'].includes(assignment.stage)) releaseLead(store, lead, assignment, user, assignment.stage.toLowerCase())

  await writeStore(store)
  res.json({ assignment: assignmentView(store, assignment) })
})

app.post('/api/assignments/:id/release', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const assignment = store.assignments.find((item) => item.id === req.params.id)
  if (!assignment) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (!canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Atendimento pertence a outro vendedor.' })
  const lead = store.leadPool.find((item) => item.id === assignment.leadId)
  releaseLead(store, lead, assignment, user, req.body.reason || 'Liberado para Base Geral.')
  await writeStore(store)
  res.json({ assignment: assignmentView(store, assignment) })
})

app.get('/api/follow-ups', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const globalAccess = isAdmin(user) && req.query.scope === 'global'
  res.json({ followUps: visibleFollowUps(store, user, globalAccess).map((followUp) => followUpView(store, followUp)) })
})

app.post('/api/follow-ups/:id/complete', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const followUp = store.followUps.find((item) => item.id === req.params.id)
  if (!followUp) return res.status(404).json({ error: 'Follow-up não encontrado.' })
  if (!isAdmin(user) && followUp.ownerId !== user.id) return res.status(403).json({ error: 'Follow-up pertence a outro vendedor.' })
  followUp.status = 'done'
  followUp.completedAt = new Date().toISOString()
  addActivity(store, { type: 'follow_up_done', userId: user.id, leadId: followUp.leadId, text: 'Follow-up concluído.' })
  await writeStore(store)
  res.json({ followUp: followUpView(store, followUp) })
})

app.get('/api/users/me/whatsapp', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const status = await getInstanceStatus(user.evolutionInstanceName)
    res.json({ whatsapp: toWhatsappView(status) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/users/me/whatsapp/connect', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const qr = await connectInstance(user.evolutionInstanceName)
    const status = await getInstanceStatus(user.evolutionInstanceName)
    res.json({
      whatsapp: toWhatsappView(status),
      qrcode: {
        base64: qr.base64 || qr.qrcode?.base64 || null,
        code: qr.code || qr.qrcode?.code || null,
        pairingCode: qr.pairingCode || qr.qrcode?.pairingCode || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/messages/generate', async (req, res) => {
  const { leadId, step } = req.body
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const lead = store.leadPool.find((item) => item.id === leadId) || req.body.lead
  if (!lead?.name) return res.status(400).json({ error: 'Oportunidade inválida.' })
  const assignment = lead.id ? activeAssignmentForLead(store, lead.id) : null
  if (assignment && !canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Lead pertence a outro vendedor.' })
  res.json({ approach: generateApproach(lead), followUp: generateFollowUp(lead, step || 1) })
})

app.post('/api/messages/send', async (req, res, next) => {
  try {
    const { number, text, leadId } = req.body
    if (!text) return res.status(400).json({ error: 'Informe a mensagem.' })

    const store = await readStore()
    const user = await getCurrentUser(req, store)
    const lead = leadId ? store.leadPool.find((item) => item.id === leadId) : null
    const assignment = lead ? activeAssignmentForLead(store, lead.id) : null
    if (lead && !assignment) return res.status(409).json({ error: 'Aprove ou assuma o lead antes de enviar mensagem.' })
    if (assignment && !canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Envio disponível apenas para seus leads ativos.' })

    const targetNumber = number || lead?.phone
    if (!targetNumber) return res.status(400).json({ error: 'A oportunidade não possui WhatsApp válido.' })

    const status = await getInstanceStatus(user.evolutionInstanceName)
    if (status.connectionStatus !== 'open') {
      return res.status(409).json({
        error: 'Conecte o WhatsApp comercial antes de enviar abordagens.',
        status: toWhatsappView(status).status,
      })
    }

    const result = await sendWhatsAppText({ number: targetNumber, text, instanceName: user.evolutionInstanceName })
    store.messages.push({
      id: createId('msg'),
      userId: user.id,
      leadId: leadId || null,
      assignmentId: assignment?.id || null,
      number: String(targetNumber).replace(/\D/g, ''),
      text,
      status: result.ok ? 'sent' : 'failed',
      providerStatus: result.status || null,
      createdAt: new Date().toISOString(),
    })

    if (assignment) {
      assignment.stage = result.ok ? 'Mensagem enviada' : assignment.stage
      assignment.updatedAt = new Date().toISOString()
      assignment.history.push({
        at: assignment.updatedAt,
        type: result.ok ? 'sent' : 'send_failed',
        text: result.ok ? 'Mensagem enviada via WhatsApp.' : 'Falha ao enviar mensagem.',
      })
    }

    if (lead) lead.lastContactAt = new Date().toISOString()
    await writeStore(store)
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/prospect/search', async (req, res, next) => {
  try {
    const store = await readStore()
    const user = await getCurrentUser(req, store)
    const preview = buildProspectingPreview({
      prompt: `${req.body.niche || ''} em ${req.body.city || ''}`,
      product: req.body.product,
      preset: req.body.opportunity === 'atendimento-whatsapp' ? 'whatsapp' : 'sem-site',
      region: req.body.city,
    }, store, user)
    const { leads } = await runProspectingSearch({ preview, store })
    await writeStore(store)
    res.json({ leads: leads.map((lead) => leadListView(store, lead)) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/leads', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const incomingLeads = Array.isArray(req.body.leads) ? req.body.leads : [req.body]
  const assignments = []

  for (const incoming of incomingLeads) {
    let lead = store.leadPool.find((item) => item.id === incoming.id)
    if (!lead) {
      lead = { ...incoming, id: incoming.id || createId('lead'), availability: 'available', status: 'available' }
      store.leadPool.push(lead)
    }
    const result = claimLead(store, user, lead.id, { approach: incoming.approach })
    if (result.assignment) assignments.push(result.assignment)
  }

  await writeStore(store)
  res.status(201).json({ leads: assignments.map((assignment) => assignmentView(store, assignment)) })
})

app.use(express.static(distDir))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: error.message || 'Erro interno.' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Codexy Prospect API on http://127.0.0.1:${port}`)
})

async function getCurrentUser(req, store = null) {
  const data = store || await readStore()
  const user = data.users.find((item) => item.id === req.user.sub)
  if (!user) throw new Error('Usuário autenticado não encontrado.')
  return user
}

function claimLead(store, user, leadId, body = {}) {
  const lead = store.leadPool.find((item) => item.id === leadId)
  if (!lead) return { status: 404, error: 'Lead não encontrado.' }
  if (!canClaimLead(store, leadId)) return { status: 409, error: 'Lead já está ativo com outro vendedor ou indisponível.' }

  const now = new Date().toISOString()
  lead.status = 'approved'
  lead.availability = 'active'
  lead.lastOwnerId = user.id
  const assignment = {
    id: createId('asn'),
    leadId,
    ownerId: user.id,
    campaignId: body.campaignId || null,
    stage: body.stage || 'Aprovado',
    status: 'active',
    temperature: lead.score >= 78 ? 'quente' : 'morno',
    approach: body.approach || generateApproach(lead),
    nextAction: 'Enviar primeira abordagem',
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, type: 'claimed', text: 'Lead aprovado e assumido no CRM.' }],
  }
  store.assignments.push(assignment)
  createDefaultFollowUps(store, lead, assignment, user.id)
  addActivity(store, { type: 'lead_claimed', userId: user.id, leadId, assignmentId: assignment.id, text: 'Lead assumido no CRM.' })
  return { assignment }
}

function releaseLead(store, lead, assignment, user, reason) {
  const now = new Date().toISOString()
  assignment.status = 'released'
  assignment.releasedAt = now
  assignment.updatedAt = now
  assignment.history.push({ at: now, type: 'released', text: reason })
  if (lead) {
    lead.availability = assignment.stage === 'Perdido' ? 'lost' : 'reactivable'
    lead.status = assignment.stage === 'Perdido' ? 'lost' : 'inactive'
    lead.lastOwnerId = assignment.ownerId
  }
  store.followUps
    .filter((followUp) => followUp.assignmentId === assignment.id && followUp.status === 'pending')
    .forEach((followUp) => {
      followUp.status = 'cancelled'
    })
  addActivity(store, { type: 'lead_released', userId: user.id, leadId: assignment.leadId, assignmentId: assignment.id, text: reason })
}

function createDefaultFollowUps(store, lead, assignment, ownerId) {
  ;[1, 2, 3].forEach((step) => {
    store.followUps.push({
      id: createId('fu'),
      leadId: lead.id,
      ownerId,
      assignmentId: assignment.id,
      step,
      text: generateFollowUp(lead, step),
      status: 'pending',
      dueAt: new Date(Date.now() + step * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    })
  })
}

function visibleAssignments(store, user, globalAccess = false) {
  return store.assignments
    .filter((assignment) => assignment.status === 'active')
    .filter((assignment) => globalAccess || assignment.ownerId === user.id)
}

function visibleMessages(store, user, globalAccess = false) {
  return store.messages.filter((message) => globalAccess || message.userId === user.id)
}

function visibleFollowUps(store, user, globalAccess = false) {
  return store.followUps
    .filter((followUp) => followUp.status === 'pending')
    .filter((followUp) => globalAccess || followUp.ownerId === user.id)
}

function visibleRuns(store, user, globalAccess = false) {
  return store.searchRuns.filter((run) => globalAccess || run.createdBy === user.id)
}

function approvalLeads(store, user) {
  return store.leadPool
    .filter((lead) => !activeAssignmentForLead(store, lead.id))
    .filter((lead) => ['available', 'discarded'].includes(lead.availability || 'available'))
    .filter((lead) => isAdmin(user) || (lead.foundByIds || []).includes(user.id) || !(lead.foundByIds || []).length)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
}

function isAvailableForPool(lead, store) {
  if (activeAssignmentForLead(store, lead.id)) return false
  return ['available', 'inactive', 'lost', 'reactivable', 'discarded'].includes(lead.availability || 'available')
}

function buildDailyQueue(store, user, globalAccess) {
  const followUps = visibleFollowUps(store, user, globalAccess)
  const overdue = followUps.filter((followUp) => new Date(followUp.dueAt).getTime() < Date.now())
  const approval = approvalLeads(store, user)
  return {
    nextAction: overdue.length ? 'Resolver follow-ups atrasados' : approval.length ? 'Aprovar novos leads' : 'Criar nova prospecção',
    overdueFollowUps: overdue.length,
    dueToday: followUps.filter((followUp) => isSameDay(followUp.dueAt, new Date())).length,
    approvalQueue: approval.length,
    availablePool: store.leadPool.filter((lead) => isAvailableForPool(lead, store)).length,
  }
}

function assignmentView(store, assignment) {
  const lead = store.leadPool.find((item) => item.id === assignment.leadId)
  const owner = store.users.find((item) => item.id === assignment.ownerId)
  return {
    ...assignment,
    lead: lead ? leadListView(store, lead) : null,
    ownerName: owner?.name || 'Sem responsável',
    pendingFollowUps: store.followUps.filter((followUp) => followUp.assignmentId === assignment.id && followUp.status === 'pending').length,
  }
}

function leadListView(store, lead) {
  const assignment = activeAssignmentForLead(store, lead.id)
  const owner = assignment ? store.users.find((item) => item.id === assignment.ownerId) : null
  return {
    id: lead.id,
    name: lead.name,
    category: lead.category,
    city: lead.city,
    phone: lead.phone,
    website: lead.website,
    instagram: lead.instagram,
    rating: lead.rating,
    reviews: lead.reviews,
    address: lead.address,
    product: lead.product,
    opportunity: lead.opportunity,
    pain: lead.pain,
    score: lead.score,
    scoreReasons: lead.scoreReasons || [],
    scoreWarnings: lead.scoreWarnings || [],
    classification: lead.classification,
    agentAdvice: lead.agentAdvice,
    sourceKeywords: lead.sourceKeywords || [],
    status: lead.status,
    availability: lead.availability,
    fromCache: Boolean(lead.fromCache),
    activeOwnerName: owner?.name || null,
    lastOwnerId: lead.lastOwnerId || null,
    lastContactAt: lead.lastContactAt || null,
  }
}

function leadDetailView(store, lead, assignment) {
  return {
    ...leadListView(store, lead),
    assignment: assignment ? assignmentView(store, assignment) : null,
    messages: store.messages.filter((message) => message.leadId === lead.id).slice(-20),
    followUps: store.followUps.filter((followUp) => followUp.leadId === lead.id).map((followUp) => followUpView(store, followUp)),
    activity: store.activityLog.filter((activity) => activity.leadId === lead.id).slice(-20),
  }
}

function followUpView(store, followUp) {
  const lead = store.leadPool.find((item) => item.id === followUp.leadId)
  const owner = store.users.find((item) => item.id === followUp.ownerId)
  return {
    ...followUp,
    lead: lead ? leadListView(store, lead) : null,
    ownerName: owner?.name || 'Sem responsável',
    isOverdue: new Date(followUp.dueAt).getTime() < Date.now(),
  }
}

function countOwners(store, assignments) {
  const ownerIds = new Set(assignments.map((assignment) => assignment.ownerId).filter(Boolean))
  return [...ownerIds].map((ownerId) => {
    const owner = store.users.find((user) => user.id === ownerId)
    return {
      id: ownerId,
      name: owner?.name || 'Sem responsável',
      total: assignments.filter((assignment) => assignment.ownerId === ownerId).length,
    }
  })
}

function isSameDay(value, date) {
  const left = new Date(value)
  return left.getFullYear() === date.getFullYear() && left.getMonth() === date.getMonth() && left.getDate() === date.getDate()
}

function toWhatsappView(status) {
  const statusMap = {
    open: 'Conectado',
    connecting: 'Aguardando leitura',
    close: 'Desconectado',
    'not-created': 'Não conectado',
  }

  return {
    status: statusMap[status.connectionStatus] || 'Não conectado',
    connectionStatus: status.connectionStatus,
    ownerJid: status.ownerJid,
    profileName: status.profileName,
    profilePicUrl: status.profilePicUrl,
    updatedAt: status.updatedAt,
  }
}
