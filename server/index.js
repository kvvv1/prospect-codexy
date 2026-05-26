import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessionCookie, createSessionCookie, getSession, requireAuth } from './auth.js'
import { connectInstance, deleteInstance, ensureInstance, getInstanceStatus, sendWhatsAppText } from './evolution.js'
import { buildProspectingPreview, generateApproach, generateFollowUp, runProspectingSearch } from './prospecting.js'
import { enrichByCnpj, searchCnpjByName } from './cnpj.js'
import {
  activeAssignmentForLead,
  addActivity,
  addNotification,
  canAccessAssignment,
  canClaimLead,
  createId,
  isAdmin,
  publicUser,
  readStore,
  writeStore,
} from './store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomDelay = (min, max) => sleep(min + Math.random() * (max - min))

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
    evolutionConfigured: Boolean((process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_URL) && process.env.EVOLUTION_API_KEY),
    googleConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY),
    llmConfigured: Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
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
  const released = autoReleaseStaleLeads(store) + autoReleaseStaleAssignments(store)
  if (released > 0) await writeStore(store)
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
      notifications: (store.notifications || []).filter((n) => n.userId === user.id && !n.read).length,
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
  const released = autoReleaseStaleLeads(store) + autoReleaseStaleAssignments(store)
  if (released > 0) await writeStore(store)
  res.json({ leads: approvalLeads(store, user).map((lead) => leadListView(store, lead)) })
})

app.get('/api/leads/pool', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const released = autoReleaseStaleLeads(store) + autoReleaseStaleAssignments(store)
  if (released > 0) await writeStore(store)
  const leads = store.leadPool
    .filter((lead) => lead.availability !== 'pending_approval')
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

  // Leads da fila de aprovação vão para Base Geral ao serem descartados
  if (lead.availability === 'pending_approval') {
    lead.status = 'available'
    lead.availability = 'available'
    lead.lastOwnerId = user.id // marca quem avaliou, para aparecer no pool
    lead.discardedReason = null
  } else {
    lead.status = 'discarded'
    lead.availability = 'discarded'
    lead.discardedReason = req.body.reason || 'Descartado manualmente.'
  }
  addActivity(store, { type: 'lead_discarded', userId: user.id, leadId: lead.id, text: lead.discardedReason || 'Movido para Base Geral.' })
  await writeStore(store)
  res.json({ lead: leadListView(store, lead) })
})

app.post('/api/leads/:id/enrich-cnpj', async (req, res) => {
  const store = await readStore()
  await getCurrentUser(req, store)
  const lead = store.leadPool.find((item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })

  let cnpjData = null
  if (req.body.cnpj) {
    cnpjData = await enrichByCnpj(req.body.cnpj)
  } else {
    cnpjData = await searchCnpjByName(lead.name, lead.city)
  }

  if (!cnpjData) return res.json({ lead: leadListView(store, lead), enriched: false })

  applyEnrichment(lead, cnpjData)
  await writeStore(store)
  res.json({ lead: leadListView(store, lead), enriched: true, cnpjData })
})

function applyEnrichment(lead, cnpjData) {
  lead.cnpj = cnpjData.cnpj
  lead.cnpjRazaoSocial = cnpjData.razaoSocial
  lead.cnpjPorte = cnpjData.porte
  lead.cnpjCapitalSocial = cnpjData.capitalSocial
  lead.cnpjDataAbertura = cnpjData.dataAbertura
  lead.cnpjSituacao = cnpjData.situacao
  lead.cnpjCnae = cnpjData.cnae
  lead.cnpjSocios = cnpjData.socios || []
  if (cnpjData.email && !lead.email) lead.email = cnpjData.email
}

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
  const prevStage = assignment.stage
  assignment.stage = req.body.stage || assignment.stage
  assignment.nextAction = req.body.nextAction || assignment.nextAction
  if (req.body.temperature) assignment.temperature = req.body.temperature
  if (req.body.approach !== undefined) assignment.approach = req.body.approach
  assignment.updatedAt = new Date().toISOString()
  if (req.body.stage && req.body.stage !== prevStage) {
    assignment.history.push({ at: assignment.updatedAt, type: 'stage', text: `Etapa alterada para ${assignment.stage}.` })
  }
  if (req.body.note) {
    assignment.history.push({ at: assignment.updatedAt, type: 'note', text: req.body.note })
  }

  const lead = store.leadPool.find((item) => item.id === assignment.leadId)
  if (lead && ['Perdido', 'Inativo'].includes(assignment.stage)) releaseLead(store, lead, assignment, user, assignment.stage.toLowerCase())

  await writeStore(store)
  res.json({ assignment: assignmentView(store, assignment) })
})

app.delete('/api/assignments/:id', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const assignment = store.assignments.find((item) => item.id === req.params.id)
  if (!assignment) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (!canAccessAssignment(user, assignment)) return res.status(403).json({ error: 'Atendimento pertence a outro vendedor.' })
  const lead = store.leadPool.find((item) => item.id === assignment.leadId)
  releaseLead(store, lead, assignment, user, 'Removido do pipeline.')
  await writeStore(store)
  res.json({ ok: true })
})

app.post('/api/assignments/bulk-stage', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const { ids, stage } = req.body
  if (!Array.isArray(ids) || !stage) return res.status(400).json({ error: 'ids[] e stage obrigatórios.' })
  const updated = []
  for (const id of ids) {
    const assignment = store.assignments.find((item) => item.id === id)
    if (!assignment || !canAccessAssignment(user, assignment)) continue
    const prevStage = assignment.stage
    assignment.stage = stage
    assignment.updatedAt = new Date().toISOString()
    if (stage !== prevStage) {
      assignment.history.push({ at: assignment.updatedAt, type: 'stage', text: `Etapa alterada para ${stage}.` })
    }
    const lead = store.leadPool.find((item) => item.id === assignment.leadId)
    if (lead && ['Perdido', 'Inativo'].includes(stage)) releaseLead(store, lead, assignment, user, stage.toLowerCase())
    updated.push(id)
  }
  await writeStore(store)
  res.json({ updated })
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

app.put('/api/follow-ups/:id', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const followUp = store.followUps.find((item) => item.id === req.params.id)
  if (!followUp) return res.status(404).json({ error: 'Follow-up não encontrado.' })
  if (!isAdmin(user) && followUp.ownerId !== user.id) return res.status(403).json({ error: 'Follow-up pertence a outro vendedor.' })
  if (req.body.text) followUp.text = req.body.text
  if (req.body.dueAt) followUp.dueAt = req.body.dueAt
  await writeStore(store)
  res.json({ followUp: followUpView(store, followUp) })
})

app.post('/api/follow-ups/:id/send', async (req, res, next) => {
  try {
    const store = await readStore()
    const user = await getCurrentUser(req, store)
    const followUp = store.followUps.find((item) => item.id === req.params.id)
    if (!followUp) return res.status(404).json({ error: 'Follow-up não encontrado.' })
    if (!isAdmin(user) && followUp.ownerId !== user.id) return res.status(403).json({ error: 'Follow-up pertence a outro vendedor.' })

    const lead = store.leadPool.find((item) => item.id === followUp.leadId)
    const targetNumber = lead?.phone
    if (!targetNumber) return res.status(400).json({ error: 'Lead não possui número de WhatsApp.' })

    const text = req.body.text || followUp.text
    if (!text) return res.status(400).json({ error: 'Informe o texto do follow-up.' })

    const status = await getInstanceStatus(user.evolutionInstanceName)
    if (status.connectionStatus !== 'open') {
      return res.status(409).json({ error: 'Conecte o WhatsApp comercial antes de enviar.' })
    }

    await randomDelay(1000, 3000)
    const result = await sendWhatsAppText({ number: targetNumber, text, instanceName: user.evolutionInstanceName })

    store.messages.push({
      id: createId('msg'),
      userId: user.id,
      leadId: followUp.leadId,
      assignmentId: followUp.assignmentId || null,
      number: String(targetNumber).replace(/\D/g, ''),
      text,
      status: result.ok ? 'sent' : 'failed',
      providerStatus: result.status || null,
      createdAt: new Date().toISOString(),
    })

    followUp.status = 'done'
    followUp.completedAt = new Date().toISOString()
    if (req.body.text) followUp.text = req.body.text

    const assignment = followUp.assignmentId ? store.assignments.find((a) => a.id === followUp.assignmentId) : null
    if (assignment) {
      assignment.updatedAt = new Date().toISOString()
      assignment.history.push({
        at: assignment.updatedAt,
        type: result.ok ? 'followup_sent' : 'followup_failed',
        text: result.ok ? `Follow-up ${followUp.step} enviado via WhatsApp.` : `Falha ao enviar follow-up ${followUp.step}.`,
      })
    }
    if (lead) lead.lastContactAt = new Date().toISOString()
    addActivity(store, { type: 'follow_up_sent', userId: user.id, leadId: followUp.leadId, text: `Follow-up ${followUp.step} enviado via WhatsApp.` })
    await writeStore(store)
    res.json({ ok: result.ok })
  } catch (error) {
    next(error)
  }
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

app.get('/api/notifications', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const notifications = (store.notifications || [])
    .filter((n) => n.userId === user.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50)
  res.json({ notifications, unread: notifications.filter((n) => !n.read).length })
})

app.post('/api/notifications/read-all', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  ;(store.notifications || []).filter((n) => n.userId === user.id && !n.read).forEach((n) => { n.read = true })
  await writeStore(store)
  res.json({ ok: true })
})

app.get('/api/inbox', async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  const globalAccess = isAdmin(user) && req.query.scope === 'global'
  const messages = visibleMessages(store, user, globalAccess)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100)
    .map((msg) => {
      const lead = msg.leadId ? store.leadPool.find((l) => l.id === msg.leadId) : null
      const sender = store.users.find((u) => u.id === msg.userId)
      return {
        ...msg,
        lead: lead ? { id: lead.id, name: lead.name, category: lead.category, city: lead.city, phone: lead.phone } : null,
        senderName: sender?.name || 'Desconhecido',
      }
    })
  res.json({ messages })
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

    await randomDelay(1000, 3000)
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

// ── Admin: gestão de usuários ────────────────────────────────────────────────

app.get('/api/admin/users', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  res.json({ users: store.users.map(adminPublicUser) })
})

app.post('/api/admin/users', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const { name, username, password, role } = req.body
  if (!name?.trim() || !username?.trim() || !password?.trim()) return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios.' })
  const store = await readStore()
  if (store.users.find((u) => u.username === username.trim())) return res.status(409).json({ error: 'Usuário já existe.' })
  const newUser = {
    id: createId('user'),
    name: name.trim(),
    username: username.trim().toLowerCase(),
    password: password.trim(),
    role: role || 'Comercial',
    status: 'active',
    evolutionInstanceName: `codexy_prospect_${username.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  }
  store.users.push(newUser)
  await writeStore(store)
  // Fire-and-forget — provision Evolution instance in background
  ensureInstance(newUser.evolutionInstanceName).catch((err) => console.error('Evolution provision failed for', newUser.evolutionInstanceName, err.message))
  res.status(201).json({ user: adminPublicUser(newUser) })
})

// GET /api/admin/whatsapp — status de todas as instâncias de todos os usuários
app.get('/api/admin/whatsapp', requireAuth, async (req, res, next) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const store = await readStore()
    const results = await Promise.allSettled(
      store.users.map(async (u) => {
        const status = await getInstanceStatus(u.evolutionInstanceName)
        return { userId: u.id, instanceName: u.evolutionInstanceName, ...toWhatsappView(status) }
      })
    )
    const statuses = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { userId: store.users[i].id, instanceName: store.users[i].evolutionInstanceName, status: 'Erro', connectionStatus: 'error' }
    )
    res.json({ statuses })
  } catch (error) {
    next(error)
  }
})

// POST /api/admin/whatsapp/provision-all — cria instâncias de todos os usuários que ainda não têm
app.post('/api/admin/whatsapp/provision-all', requireAuth, async (req, res, next) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const store = await readStore()
    const results = await Promise.allSettled(
      store.users.map((u) => ensureInstance(u.evolutionInstanceName).then(() => ({ userId: u.id, ok: true })))
    )
    const provisioned = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').map((r, i) => store.users[i]?.evolutionInstanceName)
    res.json({ provisioned, failed })
  } catch (error) {
    next(error)
  }
})

// GET /api/admin/users/:id/whatsapp — status da instância de um usuário específico
app.get('/api/admin/users/:id/whatsapp', requireAuth, async (req, res, next) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const store = await readStore()
    const user = store.users.find((u) => u.id === req.params.id)
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const status = await getInstanceStatus(user.evolutionInstanceName)
    res.json({ whatsapp: { ...toWhatsappView(status), instanceName: user.evolutionInstanceName } })
  } catch (error) {
    next(error)
  }
})

// POST /api/admin/users/:id/whatsapp/connect — provisiona e gera QR para um usuário
app.post('/api/admin/users/:id/whatsapp/connect', requireAuth, async (req, res, next) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const store = await readStore()
    const user = store.users.find((u) => u.id === req.params.id)
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const qr = await connectInstance(user.evolutionInstanceName)
    const status = await getInstanceStatus(user.evolutionInstanceName)
    res.json({
      whatsapp: { ...toWhatsappView(status), instanceName: user.evolutionInstanceName },
      qrcode: {
        base64: qr.base64 || qr.qrcode?.base64 || null,
        code: qr.code || qr.qrcode?.code || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/users/:id', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  const user = store.users.find((u) => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
  if (user.id === 'codexy-admin') return res.status(403).json({ error: 'Conta admin principal não pode ser editada aqui.' })
  const { name, password, role, status } = req.body
  if (name?.trim()) user.name = name.trim()
  if (password?.trim()) user.password = password.trim()
  if (role) user.role = role
  if (status) user.status = status
  await writeStore(store)
  res.json({ user: adminPublicUser(user) })
})

app.delete('/api/admin/users/:id', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  if (req.params.id === 'codexy-admin') return res.status(403).json({ error: 'Admin principal não pode ser removido.' })
  const store = await readStore()
  const idx = store.users.findIndex((u) => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' })
  store.users.splice(idx, 1)
  await writeStore(store)
  res.json({ ok: true })
})

app.get('/api/admin/trojan/leads', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  const trojanLeadIds = new Set(store.messages.filter((m) => m.source === 'trojan').map((m) => m.leadId).filter(Boolean))
  const approvedLeadIds = new Set(store.assignments.filter((a) => a.status === 'active').map((a) => a.leadId))
  const leads = store.leadPool
    .filter((lead) => lead.phone)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((lead) => ({ ...leadListView(store, lead), hasTrojan: trojanLeadIds.has(lead.id), isApproved: approvedLeadIds.has(lead.id) }))
  res.json({ leads })
})

app.get('/api/admin/trojan/history', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  const messages = store.messages
    .filter((message) => message.source === 'trojan')
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 250)
    .map((message) => {
      const lead = message.leadId ? store.leadPool.find((item) => item.id === message.leadId) : null
      const sender = store.users.find((item) => item.id === message.userId)
      return {
        ...message,
        lead: lead ? { id: lead.id, name: lead.name, category: lead.category, city: lead.city, phone: lead.phone } : null,
        senderName: sender?.name || 'Desconhecido',
      }
    })
  res.json({ messages, campaigns: store.trojanCampaigns || [] })
})

app.post('/api/admin/trojan/send', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })

    const leadIds = Array.isArray(req.body.leadIds) ? req.body.leadIds : []
    const variants = Array.isArray(req.body.messages)
      ? req.body.messages.map((text) => String(text || '').trim()).filter(Boolean)
      : []
    if (!leadIds.length) return res.status(400).json({ error: 'Selecione ao menos um lead.' })
    if (variants.length < 3) return res.status(400).json({ error: 'Preencha as 3 formas de mensagem.' })

    const store = await readStore()
    const user = await getCurrentUser(req, store)
    const status = await getInstanceStatus(user.evolutionInstanceName)
    if (status.connectionStatus !== 'open') {
      return res.status(409).json({ error: 'Conecte o WhatsApp do administrador antes de enviar o Cavalo de Troia.' })
    }

    const selectedLeads = leadIds
      .map((id) => store.leadPool.find((lead) => lead.id === id))
      .filter(Boolean)
      .filter((lead) => lead.phone)

    if (!selectedLeads.length) return res.status(400).json({ error: 'Os leads selecionados não possuem WhatsApp válido.' })

    const now = new Date().toISOString()
    const campaign = {
      id: createId('trojan'),
      name: req.body.name?.trim() || `Cavalo de Troia ${new Date().toLocaleDateString('pt-BR')}`,
      userId: user.id,
      createdAt: now,
      total: selectedLeads.length,
      sent: 0,
      failed: 0,
      variants,
    }
    store.trojanCampaigns.push(campaign)

    const results = []
    for (let index = 0; index < selectedLeads.length; index += 1) {
      if (index > 0) await randomDelay(3000, 8000)
      const lead = selectedLeads[index]
      const variantIndex = index % variants.length
      const text = renderTrojanText(variants[variantIndex], lead)
      let result
      try {
        result = await sendWhatsAppText({ number: lead.phone, text, instanceName: user.evolutionInstanceName })
      } catch (error) {
        result = { ok: false, status: 'network_error', error: error.message }
      }

      const message = {
        id: createId('msg'),
        userId: user.id,
        leadId: lead.id,
        assignmentId: activeAssignmentForLead(store, lead.id)?.id || null,
        number: String(lead.phone).replace(/\D/g, ''),
        text,
        status: result.ok ? 'sent' : 'failed',
        providerStatus: result.status || null,
        source: 'trojan',
        campaignId: campaign.id,
        campaignName: campaign.name,
        variantIndex: variantIndex + 1,
        createdAt: new Date().toISOString(),
      }
      store.messages.push(message)
      if (result.ok) {
        campaign.sent += 1
        lead.lastContactAt = message.createdAt
      } else {
        campaign.failed += 1
      }
      results.push({ leadId: lead.id, leadName: lead.name, number: message.number, status: message.status, variantIndex: message.variantIndex })
    }

    addActivity(store, {
      type: 'trojan_campaign',
      userId: user.id,
      text: `${campaign.name}: ${campaign.sent} enviada(s), ${campaign.failed} falha(s).`,
    })
    await writeStore(store)
    res.status(201).json({ campaign, results })
  } catch (error) {
    next(error)
  }
})

app.post('/api/leads/bulk-approve', requireAuth, async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  if (!isAdmin(user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const ids = Array.isArray(req.body.ids) ? req.body.ids : []
  if (!ids.length) return res.status(400).json({ error: 'Nenhum lead selecionado.' })
  let approved = 0
  let failed = 0
  for (const id of ids) {
    const result = claimLead(store, user, id, {})
    if (result.error) failed += 1
    else approved += 1
  }
  await writeStore(store)
  res.json({ approved, failed })
})

app.post('/api/leads/bulk-discard', requireAuth, async (req, res) => {
  const store = await readStore()
  const user = await getCurrentUser(req, store)
  if (!isAdmin(user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const ids = Array.isArray(req.body.ids) ? req.body.ids : []
  if (!ids.length) return res.status(400).json({ error: 'Nenhum lead selecionado.' })
  let discarded = 0
  for (const id of ids) {
    const lead = store.leadPool.find((item) => item.id === id)
    if (!lead) continue
    if (lead.availability === 'pending_approval') {
      lead.status = 'available'
      lead.availability = 'available'
      lead.lastOwnerId = user.id
      lead.discardedReason = null
    } else {
      lead.status = 'discarded'
      lead.availability = 'discarded'
      lead.discardedReason = 'Descartado em massa.'
    }
    addActivity(store, { type: 'lead_discarded', userId: user.id, leadId: lead.id, text: lead.discardedReason || 'Movido para Base Geral.' })
    discarded += 1
  }
  await writeStore(store)
  res.json({ discarded })
})

app.post('/api/admin/site-health', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
    const store = await readStore()
    const cityFilter = req.body.city ? String(req.body.city).toLowerCase().trim() : null
    const leadsWithSites = store.leadPool
      .filter((l) => (l.website || l.site) && String(l.website || l.site).trim())
      .filter((l) => !cityFilter || (l.city && String(l.city).toLowerCase().includes(cityFilter)))
      .slice(0, 500)

    async function checkOne(lead) {
      let url = String(lead.website || lead.site).trim()
      if (!url.startsWith('http')) url = 'https://' + url
      const start = Date.now()
      let status = null
      let errorMsg = null
      let responseMs = null
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        let resp = await fetch(url, {
          signal: controller.signal,
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteHealthChecker/1.0)' },
        })
        // Some servers reject HEAD — fallback to GET
        if (resp.status === 405) {
          resp = await fetch(url, { signal: controller.signal, method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
        }
        clearTimeout(timer)
        responseMs = Date.now() - start
        status = resp.status
      } catch (err) {
        responseMs = Date.now() - start
        errorMsg = err.name === 'AbortError' ? 'timeout' : (err.message || 'error')
      }
      return { id: lead.id, name: lead.name, url, status, responseMs, error: errorMsg }
    }

    // Process in parallel batches of 15
    const CONCURRENCY = 15
    const results = []
    for (let i = 0; i < leadsWithSites.length; i += CONCURRENCY) {
      const batch = leadsWithSites.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(batch.map(checkOne))
      results.push(...batchResults)
    }

    // Save results to store for Lobo de Wall Street
    for (const result of results) {
      store.siteHealthResults[result.id] = {
        status: result.status,
        responseMs: result.responseMs,
        error: result.error,
        url: result.url,
        checkedAt: new Date().toISOString(),
      }
    }
    await writeStore(store)

    res.json({ results, total: leadsWithSites.length })
  } catch (err) {
    next(err)
  }
})

// ── Projects board ────────────────────────────────────────────────────────────

app.get('/api/admin/projects', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  res.json({ projects: store.projects || [] })
})

app.post('/api/admin/projects', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const { name, client, value, tool, assignee, stage, notes, dueDate } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório.' })
  const store = await readStore()
  const project = {
    id: createId('proj'),
    name: String(name).trim(),
    client: String(client || '').trim(),
    value: value != null && value !== '' ? Number(value) : null,
    tool: String(tool || '').trim(),
    assignee: String(assignee || '').trim(),
    stage: stage || 'Negociação',
    notes: String(notes || '').trim(),
    dueDate: dueDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.projects = [...(store.projects || []), project]
  await writeStore(store)
  res.json({ project })
})

app.put('/api/admin/projects/:id', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  const idx = (store.projects || []).findIndex((p) => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Projeto não encontrado.' })
  const { name, client, value, tool, assignee, stage, notes, dueDate } = req.body
  store.projects[idx] = {
    ...store.projects[idx],
    ...(name != null && { name: String(name).trim() }),
    ...(client != null && { client: String(client).trim() }),
    ...(value !== undefined && { value: value !== '' && value != null ? Number(value) : null }),
    ...(tool != null && { tool: String(tool).trim() }),
    ...(assignee != null && { assignee: String(assignee).trim() }),
    ...(stage != null && { stage }),
    ...(notes != null && { notes: String(notes).trim() }),
    ...(dueDate !== undefined && { dueDate: dueDate || null }),
    updatedAt: new Date().toISOString(),
  }
  await writeStore(store)
  res.json({ project: store.projects[idx] })
})

app.delete('/api/admin/projects/:id', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  const before = (store.projects || []).length
  store.projects = (store.projects || []).filter((p) => p.id !== req.params.id)
  if (store.projects.length === before) return res.status(404).json({ error: 'Projeto não encontrado.' })
  await writeStore(store)
  res.json({ ok: true })
})

// ── Lobo de Wall Street ────────────────────────────────────────────────────────

app.get('/api/admin/wolf', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()

  const brokenLeads = store.leadPool
    .filter((lead) => lead.website || lead.site)
    .map((lead) => {
      const health = store.siteHealthResults[lead.id]
      if (!health) return null
      const isBroken = health.error !== null || (health.status != null && health.status >= 400)
      if (!isBroken) return null
      return { ...leadListView(store, lead), siteHealth: health }
    })
    .filter(Boolean)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const approvedLeads = store.assignments
    .filter((a) => a.status === 'active')
    .map((a) => assignmentView(store, a))
    .filter((a) => a.lead?.phone)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  res.json({ brokenLeads, approvedLeads })
})

app.post('/api/admin/wolf/send', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })

    const { leadId, text } = req.body
    if (!leadId || !text?.trim()) return res.status(400).json({ error: 'leadId e text obrigatórios.' })

    const store = await readStore()
    const user = await getCurrentUser(req, store)

    const lead = store.leadPool.find((item) => item.id === leadId)
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
    if (!lead.phone) return res.status(400).json({ error: 'Lead não possui número de WhatsApp.' })

    const adminInstance = store.users.find((u) => isAdmin(u))
    const instanceName = adminInstance?.evolutionInstanceName || user.evolutionInstanceName

    const wStatus = await getInstanceStatus(instanceName)
    if (wStatus.connectionStatus !== 'open') {
      return res.status(409).json({ error: 'Conecte o WhatsApp do administrador antes de enviar.' })
    }

    let assignment = activeAssignmentForLead(store, leadId)
    if (!assignment) {
      const result = claimLead(store, user, leadId, {})
      if (result.error) return res.status(result.status).json({ error: result.error })
      assignment = result.assignment
    }

    await randomDelay(1000, 3000)
    const result = await sendWhatsAppText({ number: lead.phone, text: text.trim(), instanceName })

    store.messages.push({
      id: createId('msg'),
      userId: user.id,
      leadId,
      assignmentId: assignment.id,
      number: String(lead.phone).replace(/\D/g, ''),
      text: text.trim(),
      status: result.ok ? 'sent' : 'failed',
      providerStatus: result.status || null,
      source: 'wolf',
      createdAt: new Date().toISOString(),
    })

    if (result.ok) {
      assignment.stage = 'Mensagem enviada'
      assignment.updatedAt = new Date().toISOString()
      assignment.history.push({ at: assignment.updatedAt, type: 'sent', text: 'Mensagem enviada via Lobo de Wall Street.' })
      lead.lastContactAt = new Date().toISOString()
    }

    addActivity(store, { type: 'wolf_sent', userId: user.id, leadId, text: 'Lobo de Wall Street: mensagem enviada.' })
    await writeStore(store)

    res.json({ ok: result.ok, assignment: assignmentView(store, assignment) })
  } catch (error) {
    next(error)
  }
})

// ── Lobo de Wall Street — Automático ─────────────────────────────────────────

const wolfTemplates = [
  (lead) => `${lead.name.split(' ')[0]}, acabei de analisar a ${lead.name} em ${lead.city} e tô vendo uns 20 a 40 clientes por mês indo direto pra concorrência que aparece no Google — e você não aparece. Isso é faturamento real escorrendo pelo ralo todo dia. Coloco a ${lead.name} na frente em 48h ou não me paga nada. Me manda um SIM que eu te mando a proposta agora.`,
  (lead) => `${lead.name.split(' ')[0]}, a ${lead.name} tá invisível online enquanto seus concorrentes em ${lead.city} faturam com os clientes que deveriam ser seus. Calculei: com presença digital certa, você recupera no mínimo R$3k a R$8k por mês que tá perdendo agora. Trabalho com garantia — se não entregar resultado em 30 dias, devolvo tudo. Me fala SIM.`,
  (lead) => `${lead.name.split(' ')[0]}, fiz uma análise rápida: todo ${lead.category} em ${lead.city} que não aparece no Google perde em média 35 clientes por mês pra quem aparece. São pessoas que pesquisaram, encontraram o concorrente e foram embora sem nem saber que a ${lead.name} existe. Resolvo isso essa semana. Garantia total. Manda SIM que a gente começa hoje.`,
  (lead) => `${lead.name.split(' ')[0]}, você tá trabalhando duro pra manter a ${lead.name} de pé enquanto tem gente em ${lead.city} captando clientes no automático pela internet — clientes que deveriam ser seus. Já dobrei o faturamento de vários ${lead.category} só com presença digital certa. Faço o mesmo pela ${lead.name} com garantia de resultado ou devolução. Me dá uma chance — manda SIM.`,
  (lead) => `${lead.name.split(' ')[0]}, enquanto você lê isso, alguém em ${lead.city} pesquisou "${lead.category}" no Google e foi pro seu concorrente — porque a ${lead.name} não apareceu. Isso acontece todo dia. Posso mudar esse cenário em 48h com garantia: resultado em 30 dias ou devolvo o investimento inteiro. Não tem risco pra você. Me manda SIM e eu te mostro exatamente como.`,
]

function buildWolfTemplate(lead, index) {
  const fn = wolfTemplates[index % wolfTemplates.length]
  return fn(lead)
}

function getLeadsEligibleForWolf(store) {
  const contactedLeadIds = new Set(store.messages.filter((m) => m.leadId).map((m) => m.leadId))

  const brokenLeads = store.leadPool
    .filter((l) => l.phone && !contactedLeadIds.has(l.id))
    .filter((l) => store.siteHealthResults[l.id])
    .filter((l) => {
      const h = store.siteHealthResults[l.id]
      return h.error !== null || (h.status != null && h.status >= 400)
    })

  const approvedLeadIds = new Set(
    store.assignments.filter((a) => a.status === 'active').map((a) => a.leadId)
  )
  const approvedLeads = store.leadPool
    .filter((l) => l.phone && !contactedLeadIds.has(l.id) && approvedLeadIds.has(l.id))

  const combined = [...brokenLeads, ...approvedLeads]
  const unique = combined.filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i)

  // Fisher-Yates shuffle
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[unique[i], unique[j]] = [unique[j], unique[i]]
  }
  return unique
}

async function runWolfCron() {
  const store = await readStore()
  if (!store.wolfCron?.enabled) return

  const adminUser = store.users.find((u) => isAdmin(u))
  if (!adminUser) return

  const wStatus = await getInstanceStatus(adminUser.evolutionInstanceName).catch(() => null)
  if (!wStatus || wStatus.connectionStatus !== 'open') {
    console.log('[wolf-cron] WhatsApp admin desconectado — abortando.')
    return
  }

  const eligible = getLeadsEligibleForWolf(store)
  const limit = store.wolfCron.dailyLimit || 50
  const targets = eligible.slice(0, limit)

  let sent = 0
  let failed = 0

  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await randomDelay(3000, 8000)
    const lead = targets[i]
    const text = buildWolfTemplate(lead, i)
    let result
    try {
      result = await sendWhatsAppText({ number: lead.phone, text, instanceName: adminUser.evolutionInstanceName })
    } catch {
      result = { ok: false }
    }

    store.messages.push({
      id: createId('msg'),
      userId: adminUser.id,
      leadId: lead.id,
      assignmentId: null,
      number: String(lead.phone).replace(/\D/g, ''),
      text,
      status: result.ok ? 'sent' : 'failed',
      providerStatus: null,
      source: 'wolf-auto',
      createdAt: new Date().toISOString(),
    })

    if (result.ok) {
      sent++
      lead.lastContactAt = new Date().toISOString()
    } else {
      failed++
    }
  }

  const stats = { sent, failed, total: targets.length, ranAt: new Date().toISOString() }
  store.wolfCron.lastRunAt = stats.ranAt
  store.wolfCron.lastRunStats = stats

  addNotification(store, {
    userId: adminUser.id,
    type: 'wolf_auto_done',
    text: `Lobo Automático: ${sent} enviado${sent !== 1 ? 's' : ''}, ${failed} falha${failed !== 1 ? 's' : ''} — ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  })

  await writeStore(store)
  console.log(`[wolf-cron] Rodou: ${sent} enviados, ${failed} falhas.`)
}

app.get('/api/admin/wolf/cron', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  res.json({ wolfCron: store.wolfCron })
})

app.post('/api/admin/wolf/cron', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const store = await readStore()
  if (typeof req.body.enabled === 'boolean') store.wolfCron.enabled = req.body.enabled
  if (req.body.dailyLimit != null) store.wolfCron.dailyLimit = Math.min(150, Math.max(1, Number(req.body.dailyLimit)))
  await writeStore(store)
  res.json({ wolfCron: store.wolfCron })
})

app.post('/api/admin/wolf/cron/run-now', requireAuth, async (req, res, next) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    await runWolfCron()
    const store = await readStore()
    res.json({ wolfCron: store.wolfCron })
  } catch (error) {
    next(error)
  }
})

// Roda todo dia às 9h (horário do servidor)
cron.schedule('0 9 * * *', () => {
  runWolfCron().catch((err) => console.error('[wolf-cron] Erro:', err.message))
})

app.use(express.static(distDir))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: error.message || 'Erro interno.' })
})

const host = process.env.HOST || '127.0.0.1'
app.listen(port, host, () => {
  console.log(`Codexy Prospect API on http://${host}:${port}`)
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
  const previousOwnerId = lead.lastOwnerId
  const previousOwner = previousOwnerId ? store.users.find((u) => u.id === previousOwnerId) : null

  lead.status = 'approved'
  lead.availability = 'active'
  lead.lastOwnerId = user.id

  const historyNote = previousOwner && previousOwnerId !== user.id
    ? `Lead retomado do pool. Trabalhado anteriormente por ${previousOwner.name}.`
    : 'Lead aprovado e assumido no CRM.'

  const assignment = {
    id: createId('asn'),
    leadId,
    ownerId: user.id,
    campaignId: body.campaignId || null,
    stage: body.stage || 'Aprovado',
    status: 'active',
    temperature: lead.score >= 78 ? 'quente' : 'morno',
    approach: body.approach || generateApproach(lead),
    nextAction: previousOwnerId && previousOwnerId !== user.id ? 'Revisar histórico anterior antes de abordar' : 'Enviar primeira abordagem',
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, type: 'claimed', text: historyNote }],
  }
  store.assignments.push(assignment)
  createDefaultFollowUps(store, lead, assignment, user.id)
  addActivity(store, { type: 'lead_claimed', userId: user.id, leadId, assignmentId: assignment.id, text: historyNote })

  // Notifica o dono anterior que o lead foi assumido por outra pessoa
  if (previousOwnerId && previousOwnerId !== user.id) {
    addNotification(store, {
      userId: previousOwnerId,
      type: 'lead_claimed_by_other',
      leadId,
      leadName: lead.name,
      claimedByName: user.name,
      text: `"${lead.name}" que estava no seu CRM foi assumido por ${user.name}. O histórico está preservado.`,
    })
  }

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
    .filter((lead) => lead.availability === 'pending_approval')
    .filter((lead) => isAdmin(user) || (lead.foundByIds || []).includes(user.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
}

function isAvailableForPool(lead, store) {
  if (activeAssignmentForLead(store, lead.id)) return false
  if (!['available', 'inactive', 'lost', 'reactivable', 'discarded'].includes(lead.availability)) return false
  // Só entra no pool se já foi trabalhado por alguém (tem dono anterior)
  return Boolean(lead.lastOwnerId)
}

// Migra leads em pending_approval há mais de 48h: volta para quem encontrou (via foundByIds)
// Não vai para o pool — apenas o admin pode ver como overflow
function autoReleaseStaleLeads(store) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  let released = 0
  for (const lead of store.leadPool) {
    if (lead.availability !== 'pending_approval') continue
    const age = new Date(lead.firstSeenAt || lead.lastSeenAt || 0).getTime()
    if (age < cutoff) {
      // Mantém pending mas remove foundByIds para que só o admin veja
      // O admin pode então aprovar manualmente ou descartar
      lead.availability = 'pending_approval'
      lead.foundByIds = [] // admin-only a partir daqui
      released++
    }
  }
  return released
}

// Libera assignments ativos sem nenhuma atividade há 7 dias para o pool
function autoReleaseStaleAssignments(store) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  let released = 0
  for (const assignment of store.assignments) {
    if (assignment.status !== 'active') continue
    const lastActivity = new Date(assignment.updatedAt || assignment.createdAt || 0).getTime()
    if (lastActivity >= cutoff) continue

    const lead = store.leadPool.find((l) => l.id === assignment.leadId)
    const now = new Date().toISOString()
    assignment.status = 'released'
    assignment.releasedAt = now
    assignment.updatedAt = now
    assignment.history.push({ at: now, type: 'auto_released', text: 'Lead liberado automaticamente por inatividade (7 dias sem ação).' })

    if (lead) {
      lead.availability = 'reactivable'
      lead.status = 'inactive'
      lead.lastOwnerId = assignment.ownerId
    }

    store.followUps
      .filter((fu) => fu.assignmentId === assignment.id && fu.status === 'pending')
      .forEach((fu) => { fu.status = 'cancelled' })

    // Notifica o dono que o lead foi liberado por inatividade
    addNotification(store, {
      userId: assignment.ownerId,
      type: 'assignment_auto_released',
      leadId: assignment.leadId,
      leadName: lead?.name || 'Lead',
      text: `Seu lead "${lead?.name || 'Lead'}" foi liberado para a Base Geral por 7 dias sem atividade.`,
    })

    addActivity(store, { type: 'lead_auto_released', userId: assignment.ownerId, leadId: assignment.leadId, text: 'Liberado por inatividade (7 dias).' })
    released++
  }
  return released
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
    lastOwnerName: lead.lastOwnerId ? (store.users.find((u) => u.id === lead.lastOwnerId)?.name || null) : null,
    lastContactAt: lead.lastContactAt || null,
    foundByNames: (lead.foundByIds || []).map((id) => store.users.find((u) => u.id === id)?.name || null).filter(Boolean),
  }
}

function leadDetailView(store, lead, assignment) {
  const pastAssignments = store.assignments
    .filter((a) => a.leadId === lead.id && a.status !== 'active')
    .map((a) => {
      const owner = store.users.find((u) => u.id === a.ownerId)
      return { ...a, ownerName: owner?.name || 'Desconhecido' }
    })
  return {
    ...leadListView(store, lead),
    assignment: assignment ? assignmentView(store, assignment) : null,
    messages: store.messages.filter((message) => message.leadId === lead.id).slice(-50),
    followUps: store.followUps.filter((followUp) => followUp.leadId === lead.id).map((followUp) => followUpView(store, followUp)),
    activity: store.activityLog.filter((activity) => activity.leadId === lead.id).slice(-30),
    pastAssignments,
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

function renderTrojanText(template, lead) {
  return String(template || '')
    .replace(/\{nome\}/gi, lead.name || '')
    .replace(/\{cidade\}/gi, lead.city || '')
    .replace(/\{nicho\}/gi, lead.category || '')
    .replace(/\{telefone\}/gi, lead.phone || '')
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

function adminPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isAdmin: isAdmin(user),
    evolutionInstanceName: user.evolutionInstanceName,
  }
}
