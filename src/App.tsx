import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type View = 'day' | 'prospect' | 'approval' | 'pool' | 'kanban' | 'crm' | 'followups' | 'whatsapp' | 'admin' | 'inbox'

type SessionUser = {
  id: string
  username: string
  name: string
  role: string
  isAdmin?: boolean
}

type Lead = {
  id: string
  name: string
  category: string
  city: string
  phone?: string
  website?: string
  instagram?: string
  rating?: number | null
  reviews?: number
  address?: string
  product?: string
  opportunity?: string
  pain?: string
  score?: number
  scoreReasons?: string[]
  scoreWarnings?: string[]
  classification?: string
  agentAdvice?: string
  sourceKeywords?: string[]
  status?: string
  availability?: string
  activeOwnerName?: string | null
  lastOwnerId?: string | null
  lastOwnerName?: string | null
  lastContactAt?: string | null
  fromCache?: boolean
  hasTrojan?: boolean
  isApproved?: boolean
  cnpj?: string | null
  cnpjRazaoSocial?: string | null
  cnpjPorte?: string | null
  cnpjCapitalSocial?: number | null
  cnpjDataAbertura?: string | null
  cnpjSituacao?: string | null
  cnpjCnae?: string | null
  cnpjSocios?: { nome: string; qualificacao: string }[]
  email?: string | null
}

type AdminUser = {
  id: string
  username: string
  name: string
  role: string
  isAdmin?: boolean
  evolutionInstanceName?: string
}

type InstanceStatus = {
  status: string
  connectionStatus: string
  profileName?: string | null
  instanceName?: string
}

type Assignment = {
  id: string
  leadId: string
  ownerId: string
  stage: string
  status: string
  temperature: string
  approach: string
  nextAction: string
  ownerName?: string
  pendingFollowUps?: number
  history?: { at: string; type: string; text: string }[]
  lead: Lead
}

type FollowUp = {
  id: string
  leadId: string
  assignmentId?: string | null
  step: number
  text: string
  status: string
  dueAt: string
  ownerName: string
  isOverdue: boolean
  lead: Lead
}

type Notification = {
  id: string
  at: string
  read: boolean
  type: string
  leadId?: string | null
  leadName?: string
  claimedByName?: string
  text: string
}

type Dashboard = {
  totals: { opportunities: number; qualified: number; sent: number; followUps: number; available: number; approval: number; notifications: number }
  daily: { nextAction: string; overdueFollowUps: number; dueToday: number; approvalQueue: number; availablePool: number }
  leads: Assignment[]
  recentRuns: SearchRun[]
  crm: { label: string; isGlobal: boolean; owners: { id: string; name: string; total: number }[] }
}

type StrategyPreview = {
  id: string
  strategy: {
    product: string
    audience: string
    region: string
    objective: string
    pains: string[]
    keywords: string[]
    priorityCriteria: string[]
    discardCriteria: string[]
    quantity: number
    estimatedUsefulRange: string
    estimatedApiCalls: number
    repetitionRisk: string
    alreadySeen: number
    cachePolicy: string
    recommendation: string
  }
}

type SearchRun = {
  id: string
  status: string
  summary: string
  stats: { keywords: number; apiCalls: number; cacheHits: number; rawFound: number; uniqueFound: number; recommended: number; medium: number; discarded: number; duplicated: number; alreadyActive: number }
  preview: StrategyPreview
}

type WhatsAppStatus = {
  status: string
  connectionStatus: string
  profileName?: string | null
}

type InboxMessage = {
  id: string
  leadId: string | null
  assignmentId: string | null
  number: string
  text: string
  status: string
  createdAt: string
  senderName?: string
  lead?: { id: string; name: string; category: string; city: string; phone?: string } | null
}

type TrojanMessage = InboxMessage & {
  source?: string
  campaignId?: string
  campaignName?: string
  variantIndex?: number
}

const stages = ['Aprovado', 'Abordagem pronta', 'Mensagem enviada', 'Respondeu', 'Reunião marcada', 'Proposta enviada', 'Fechado', 'Perdido', 'Inativo']

function App() {
  const introPreview = window.location.search.includes('introPreview=1')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [view, setView] = useState<View>('day')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [approvalLeads, setApprovalLeads] = useState<Lead[]>([])
  const [poolLeads, setPoolLeads] = useState<Lead[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [status, setStatus] = useState('Pronto.')
  const [isBusy, setIsBusy] = useState(false)

  const refreshCore = useCallback(async () => {
    const globalScope = user?.isAdmin ? '?scope=global' : ''
    const [dashboardData, approvalData, poolData, crmData, followUpData, notifData] = await Promise.all([
      api<{ totals: Dashboard['totals']; daily: Dashboard['daily']; leads: Assignment[]; recentRuns: SearchRun[]; crm: Dashboard['crm'] }>('/api/dashboard'),
      api<{ leads: Lead[] }>('/api/leads/approval'),
      api<{ leads: Lead[] }>('/api/leads/pool'),
      api<{ assignments: Assignment[] }>(`/api/crm${globalScope}`),
      api<{ followUps: FollowUp[] }>(`/api/follow-ups${globalScope}`),
      api<{ notifications: Notification[] }>('/api/notifications'),
    ])
    setDashboard(dashboardData)
    setApprovalLeads(approvalData.leads)
    setPoolLeads(poolData.leads)
    setAssignments(crmData.assignments)
    setFollowUps(followUpData.followUps)
    setNotifications(notifData.notifications)
  }, [user?.isAdmin])

  const checkSession = useCallback(async () => {
    const data = await api<{ user: SessionUser | null }>('/api/auth/session')
    setUser(data.user)
    setIsCheckingSession(false)
  }, [])

  useEffect(() => {
    // Initial session sync from the server-side auth cookie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession()
  }, [checkSession])

  useEffect(() => {
    if (!user) return
    // Initial server sync after login.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCore()
    api<{ whatsapp: WhatsAppStatus }>('/api/users/me/whatsapp').then((data) => setWhatsapp(data.whatsapp)).catch(() => null)
  }, [refreshCore, user])

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setDashboard(null)
  }

  async function approveLead(lead: Lead) {
    await runAction(`Aprovando ${lead.name} para seu CRM...`, async () => {
      await api<{ assignment: Assignment }>(`/api/leads/${lead.id}/approve`, { method: 'POST' })
      await refreshCore()
    })
  }

  async function discardLead(lead: Lead) {
    await runAction(`Descartando ${lead.name}...`, async () => {
      await api(`/api/leads/${lead.id}/discard`, { method: 'POST', body: JSON.stringify({ reason: 'Descartado na revisão manual.' }) })
      await refreshCore()
    })
  }

  async function bulkApproveLead(leads: Lead[]) {
    await runAction(`Aprovando ${leads.length} leads em lote...`, async () => {
      for (const lead of leads) {
        await api(`/api/leads/${lead.id}/approve`, { method: 'POST' })
      }
      await refreshCore()
    })
  }

  async function bulkDiscardLead(leads: Lead[]) {
    await runAction(`Descartando ${leads.length} leads em lote...`, async () => {
      for (const lead of leads) {
        await api(`/api/leads/${lead.id}/discard`, { method: 'POST', body: JSON.stringify({ reason: 'Descartado em lote na revisão manual.' }) })
      }
      await refreshCore()
    })
  }

  async function claimLead(lead: Lead) {
    await runAction(`Assumindo ${lead.name}...`, async () => {
      const data = await api<{ assignment: Assignment }>(`/api/leads/${lead.id}/claim`, { method: 'POST' })
      setSelectedAssignment(data.assignment)
      setSelectedLead(data.assignment.lead)
      setView('crm')
      await refreshCore()
    })
  }

  async function updateStage(assignment: Assignment, stage: string) {
    await runAction('Atualizando etapa...', async () => {
      const data = await api<{ assignment: Assignment }>(`/api/assignments/${assignment.id}/stage`, { method: 'POST', body: JSON.stringify({ stage }) })
      setSelectedAssignment(data.assignment)
      await refreshCore()
    })
  }

  async function releaseAssignment(assignment: Assignment) {
    await runAction('Liberando lead para a Base Geral...', async () => {
      await api(`/api/assignments/${assignment.id}/release`, { method: 'POST', body: JSON.stringify({ reason: 'Liberado manualmente para reativação.' }) })
      setSelectedAssignment(null)
      setSelectedLead(null)
      await refreshCore()
    })
  }

  async function completeFollowUp(followUp: FollowUp) {
    await runAction('Concluindo follow-up...', async () => {
      await api(`/api/follow-ups/${followUp.id}/complete`, { method: 'POST' })
      await refreshCore()
    })
  }

  async function connectWhatsApp() {
    await runAction('Gerando QR Code do WhatsApp comercial...', async () => {
      const data = await api<{ whatsapp: WhatsAppStatus; qrcode: { base64?: string } }>('/api/users/me/whatsapp/connect', { method: 'POST' })
      setWhatsapp(data.whatsapp)
      setQrCode(data.qrcode.base64 || '')
    })
  }

  async function runAction(message: string, action: () => Promise<void>) {
    setIsBusy(true)
    setStatus(message)
    try {
      await action()
      setStatus('Pronto.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro inesperado.')
    } finally {
      setIsBusy(false)
    }
  }

  const metrics = dashboard?.totals || { opportunities: 0, qualified: 0, sent: 0, followUps: 0, available: 0, approval: 0, notifications: 0 }
  const unreadCount = notifications.filter((n) => !n.read).length

  if (isCheckingSession) return <div className="boot-screen">Carregando Codexy Prospect...</div>
  if (introPreview) return <LogoValidationScreen />
  if (!user) return <LoginScreen onLogin={setUser} />

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="user-card">
          <span>Logado como</span>
          <strong>{user.name}</strong>
          <small>{user.role}</small>
          <button type="button" onClick={logout}>Sair</button>
        </div>
        <nav>
          <NavButton current={view} id="day" label={greeting()} badge={unreadCount} onClick={setView} />
          <NavButton current={view} id="prospect" label="Criar Prospecção" onClick={setView} />
          <NavButton current={view} id="approval" label={`Aprovação (${metrics.approval})`} onClick={setView} />
          <NavButton current={view} id="crm" label="Meu CRM" onClick={setView} />
          <NavButton current={view} id="kanban" label="Pipeline" onClick={setView} />
          <NavButton current={view} id="followups" label={`Follow-ups (${metrics.followUps})`} onClick={setView} />
          <NavButton current={view} id="inbox" label={`Inbox (${metrics.sent})`} onClick={(v) => { setView(v); api<{ messages: InboxMessage[] }>(`/api/inbox${user.isAdmin ? '?scope=global' : ''}`).then((d) => setInboxMessages(d.messages)).catch(() => null) }} />
          <NavButton current={view} id="pool" label={`Base Geral (${metrics.available})`} onClick={setView} />
          <NavButton current={view} id="whatsapp" label="WhatsApp" onClick={setView} />
          {user.isAdmin && <NavButton current={view} id="admin" label="Admin" onClick={setView} />}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="product-label">Codexy Prospect</span>
            <h1>{viewTitle(view, user)}</h1>
            <p>{viewDescription(view)}</p>
          </div>
          <div className="status-pill">{status}</div>
        </header>

        <section className="metrics">
          <Metric label="CRM ativo" value={metrics.opportunities} />
          <Metric label="Aprovação" value={metrics.approval} />
          <Metric label="Base Geral" value={metrics.available} />
          <Metric label="Follow-ups" value={metrics.followUps} />
          <Metric label="Enviadas" value={metrics.sent} />
        </section>

        {view === 'day' && <DayView dashboard={dashboard} assignments={assignments} followUps={followUps} notifications={notifications} onOpenCrm={(assignment) => { setSelectedAssignment(assignment); setSelectedLead(assignment.lead); setView('crm') }} onGo={setView} onReadNotifications={async () => { await api('/api/notifications/read-all', { method: 'POST' }); setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))) }} />}
        {view === 'prospect' && <ProspectView isBusy={isBusy} onRun={refreshCore} setStatus={setStatus} setBusy={setIsBusy} />}
        {view === 'approval' && <LeadReviewView title="Leads para aprovação" leads={approvalLeads} selectedLead={selectedLead} onSelect={setSelectedLead} onLeadUpdate={setSelectedLead} onApprove={approveLead} onDiscard={discardLead} onBulkApprove={bulkApproveLead} onBulkDiscard={bulkDiscardLead} primaryLabel="Aprovar para meu CRM" />}
        {view === 'pool' && <LeadReviewView title="Base Geral disponível" leads={poolLeads} selectedLead={selectedLead} onSelect={setSelectedLead} onLeadUpdate={setSelectedLead} onApprove={claimLead} onDiscard={discardLead} onBulkDiscard={bulkDiscardLead} primaryLabel="Assumir lead" />}
        {view === 'kanban' && <KanbanView assignments={assignments} followUps={followUps} onOpenCrm={(a) => { setSelectedAssignment(a); setSelectedLead(a.lead); setView('crm') }} />}
        {view === 'crm' && <CrmView assignments={assignments} followUps={followUps} whatsapp={whatsapp} selected={selectedAssignment} onSelect={(assignment) => { setSelectedAssignment(assignment); setSelectedLead(assignment.lead) }} onStage={updateStage} onRelease={releaseAssignment} onCompleteFollowUp={completeFollowUp} onRefresh={refreshCore} />}
        {view === 'followups' && <FollowUpView followUps={followUps} onDone={completeFollowUp} />}
        {view === 'inbox' && <InboxView messages={inboxMessages} onOpenCrm={(msg) => { if (msg.lead) { const a = assignments.find((x) => x.id === msg.assignmentId); if (a) { setSelectedAssignment(a); setView('crm') } } }} />}
        {view === 'whatsapp' && <WhatsAppView whatsapp={whatsapp} qrCode={qrCode} onConnect={connectWhatsApp} onRefresh={async () => setWhatsapp((await api<{ whatsapp: WhatsAppStatus }>('/api/users/me/whatsapp')).whatsapp)} />}
        {view === 'admin' && user.isAdmin && <AdminView dashboard={dashboard} assignments={assignments} runs={dashboard?.recentRuns || []} />}
      </section>
    </main>
  )
}

function LogoValidationScreen() {
  return (
    <main className="logo-validation-screen">
      <img className="logo-validation-mark" src="/codexy-logo-vector.svg" alt="Codexy" />
      <button className="logo-validation-back" type="button" onClick={() => window.location.assign('/')}>Voltar ao login</button>
    </main>
  )
}
function LoginScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsBusy(true)
    setError('')
    try {
      const data = await api<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      onLogin(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-visual">
        <Brand />
        <h1>Sistema diário de prospecção comercial</h1>
        <p>Crie buscas inteligentes, aprove leads manualmente e mantenha cada vendedor focado nos próprios atendimentos ativos.</p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div>
          <span className="product-label">Acesso interno</span>
          <h2>Entrar no Prospect</h2>
        </div>
        <label>Usuário<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={isBusy}>{isBusy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  )
}

function DayView({ dashboard, assignments, followUps, notifications, onOpenCrm, onGo, onReadNotifications }: { dashboard: Dashboard | null; assignments: Assignment[]; followUps: FollowUp[]; notifications: Notification[]; onOpenCrm: (assignment: Assignment) => void; onGo: (view: View) => void; onReadNotifications: () => void }) {
  const unread = notifications.filter((n) => !n.read)
  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="Próxima melhor ação" description="O sistema prioriza o que move o dia comercial." />
        <div className="daily-action">
          <strong>{dashboard?.daily.nextAction || 'Criar nova prospecção'}</strong>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => onGo('prospect')}>Criar prospecção</button>
            <button className="ghost-button" type="button" onClick={() => onGo('followups')}>Ver follow-ups</button>
            <button className="ghost-button" type="button" onClick={() => onGo('approval')}>Aprovar leads</button>
          </div>
        </div>
      </article>
      <article className="panel">
        <PanelTitle title="Fila de hoje" description="Resumo operacional." />
        <InfoList items={[
          ['Follow-ups atrasados', dashboard?.daily.overdueFollowUps || 0],
          ['Vencem hoje', dashboard?.daily.dueToday || 0],
          ['Leads para aprovar', dashboard?.daily.approvalQueue || 0],
          ['Disponíveis na base', dashboard?.daily.availablePool || 0],
        ]} />
      </article>
      <article className="panel">
        <PanelTitle title="CRM ativo" description="Atendimentos que estão com você." />
        <div className="stack">
          {assignments.slice(0, 5).map((assignment) => (
            <button className="mini-row" type="button" key={assignment.id} onClick={() => onOpenCrm(assignment)}>
              <strong>{assignment.lead.name}</strong>
              <span>{assignment.stage} · {assignment.nextAction}</span>
            </button>
          ))}
          {!assignments.length && <Empty text="Nenhum lead ativo ainda." />}
        </div>
      </article>
      <article className="panel wide">
        <PanelTitle title="Follow-ups urgentes" description="Evite que leads mornos esfriem." />
        <div className="lead-table">
          {followUps.slice(0, 6).map((followUp) => <FollowUpRow key={followUp.id} followUp={followUp} />)}
          {!followUps.length && <Empty text="Sem follow-ups pendentes." />}
        </div>
      </article>
      {notifications.length > 0 && (
        <article className="panel wide">
          <div className="panel-title">
            <div><h2>Notificações</h2><p>Atualizações sobre leads que passaram pelo seu CRM.</p></div>
            {unread.length > 0 && <button className="btn-ghost small" type="button" onClick={onReadNotifications}>Marcar tudo como lido</button>}
          </div>
          <div className="notif-list">
            {notifications.slice(0, 10).map((n) => (
              <div key={n.id} className={`notif-row${n.read ? ' read' : ''}`}>
                <div className="notif-icon">{n.type === 'lead_claimed_by_other' ? '👥' : n.type === 'assignment_auto_released' ? '⏰' : '📋'}</div>
                <div className="notif-body">
                  <p>{n.text}</p>
                  <span>{formatDate(n.at)}</span>
                </div>
                {!n.read && <span className="notif-dot" />}
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  )
}

function ProspectView({ isBusy, onRun, setStatus, setBusy }: { isBusy: boolean; onRun: () => Promise<void>; setStatus: (value: string) => void; setBusy: (value: boolean) => void }) {
  const [prompt, setPrompt] = useState('Quero vender landing page para odontologia em Belo Horizonte')
  const [product, setProduct] = useState('')
  const [scale, setScale] = useState<'moderada' | 'grande' | 'ampla'>('grande')
  const [preview, setPreview] = useState<StrategyPreview | null>(null)
  const [run, setRun] = useState<SearchRun | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])

  async function generatePreview() {
    setBusy(true)
    setStatus('Montando preview da estratégia...')
    try {
      const data = await api<{ preview: StrategyPreview }>('/api/prospect/preview', { method: 'POST', body: JSON.stringify({ prompt, product, scale }) })
      setPreview(data.preview)
      setStatus('Preview pronto para revisão.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro ao gerar preview.')
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    if (!preview) return
    setBusy(true)
    setStatus('Executando busca com cache e deduplicação...')
    try {
      const data = await api<{ run: SearchRun; leads: Lead[] }>('/api/prospect/runs', { method: 'POST', body: JSON.stringify({ preview }) })
      setRun(data.run)
      setLeads(data.leads)
      await onRun()
      setStatus('Busca concluída. Revise os leads na aprovação manual.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro ao executar busca.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="Criar prospecção com agente" description="Descreva quem você quer prospectar. O agente monta a estratégia de busca antes de consumir APIs." />
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Ex: Quero prospectar clínicas odontológicas em BH que não têm site, para oferecer landing page de captação pelo WhatsApp." />
        <div className="form-grid three">
          <label>
            Produto <span className="field-optional">(opcional)</span>
            <input value={product} placeholder="Ex: Landing Pages, Chatbot..." onChange={(event) => setProduct(event.target.value)} />
          </label>
          <label>Escala da busca
            <select value={scale} onChange={(event) => setScale(event.target.value as typeof scale)}>
              <option value="moderada">Moderada (~40 leads)</option>
              <option value="grande">Grande (~80 leads)</option>
              <option value="ampla">Ampla (~120 leads)</option>
            </select>
          </label>
          <button className="primary-button" type="button" disabled={isBusy} onClick={generatePreview}>Gerar preview</button>
        </div>
        {!product && <p className="intent-hint">Sem produto definido — a busca vai mapear problemas e oportunidades sem ancoragem comercial.</p>}
      </article>

      {preview && (
        <article className="panel wide">
          <PanelTitle title="Preview da estratégia" description="Confira como a busca será executada antes de aprovar." />
          <div className="strategy-grid">
            <InfoCard label="Produto" value={preview.strategy.product} />
            <InfoCard label="Público" value={preview.strategy.audience} />
            <InfoCard label="Região" value={preview.strategy.region} />
            <InfoCard label="Leads úteis estimados" value={preview.strategy.estimatedUsefulRange} />
            <InfoCard label="Chamadas previstas" value={preview.strategy.estimatedApiCalls} />
            <InfoCard label="Risco de repetição" value={preview.strategy.repetitionRisk} />
          </div>
          <p className="agent-note">{preview.strategy.recommendation}</p>
          <EditableList title="Keywords planejadas" items={preview.strategy.keywords} onChange={(keywords) => setPreview({ ...preview, strategy: { ...preview.strategy, keywords } })} />
          <TwoColumnList leftTitle="Priorizar" left={preview.strategy.priorityCriteria} rightTitle="Descartar" right={preview.strategy.discardCriteria} />
          <div className="button-row">
            <button className="primary-button" type="button" disabled={isBusy} onClick={runSearch}>Aprovar e buscar leads</button>
          </div>
        </article>
      )}

      {run && (
        <article className="panel wide">
          <PanelTitle title="Resultado da busca" description={run.summary} />
          <div className="strategy-grid">
            <InfoCard label="Únicos" value={run.stats.uniqueFound} />
            <InfoCard label="Recomendados" value={run.stats.recommended} />
            <InfoCard label="Médios" value={run.stats.medium} />
            <InfoCard label="Cache" value={run.stats.cacheHits} />
          </div>
          <div className="lead-table">{leads.slice(0, 8).map((lead) => <LeadRow key={lead.id} lead={lead} onClick={() => undefined} />)}</div>
        </article>
      )}
    </section>
  )
}

function LeadReviewView({ title, leads, selectedLead, onSelect, onLeadUpdate, onApprove, onDiscard, onBulkApprove, onBulkDiscard, primaryLabel }: {
  title: string
  leads: Lead[]
  selectedLead: Lead | null
  onSelect: (lead: Lead) => void
  onLeadUpdate?: (lead: Lead) => void
  onApprove: (lead: Lead) => void
  onDiscard: (lead: Lead) => void
  onBulkApprove?: (leads: Lead[]) => Promise<void>
  onBulkDiscard?: (leads: Lead[]) => Promise<void>
  primaryLabel: string
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [classification, setClassification] = useState('')
  const [city, setCity] = useState('')
  const [porte, setPorte] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'city'>('score')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const categories = useMemo(() => {
    const set = new Set(leads.map((l) => l.category).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [leads])

  const cities = useMemo(() => {
    const set = new Set(leads.map((l) => l.city).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [leads])

  const hasPorteData = useMemo(() => leads.some((l) => l.cnpjPorte), [leads])

  const filtered = useMemo(() => {
    let result = leads
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q) ||
        (l.agentAdvice || '').toLowerCase().includes(q)
      )
    }
    if (category) result = result.filter((l) => l.category === category)
    if (city) result = result.filter((l) => l.city === city)
    if (classification) result = result.filter((l) => (l.classification || 'medium') === classification)
    if (porte) result = result.filter((l) => l.cnpjPorte === porte)
    if (sortBy === 'score') result = [...result].sort((a, b) => (b.score || 0) - (a.score || 0))
    if (sortBy === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'city') result = [...result].sort((a, b) => (a.city || '').localeCompare(b.city || ''))
    return result
  }, [leads, search, category, city, classification, porte, sortBy])

  function clearFilters() {
    setSearch(''); setCategory(''); setCity(''); setClassification(''); setPorte('')
  }

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allFilteredChecked = filtered.length > 0 && filtered.every((l) => checkedIds.has(l.id))

  function toggleAll() {
    if (allFilteredChecked) {
      setCheckedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((l) => next.delete(l.id))
        return next
      })
    } else {
      setCheckedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((l) => next.add(l.id))
        return next
      })
    }
  }

  const checkedLeads = filtered.filter((l) => checkedIds.has(l.id))
  const hasFilters = search || category || city || classification || porte

  async function handleBulkApprove() {
    if (!onBulkApprove || checkedLeads.length === 0) return
    setBulkBusy(true)
    await onBulkApprove(checkedLeads)
    setCheckedIds(new Set())
    setBulkBusy(false)
  }

  async function handleBulkDiscard() {
    if (!onBulkDiscard || checkedLeads.length === 0) return
    setBulkBusy(true)
    await onBulkDiscard(checkedLeads)
    setCheckedIds(new Set())
    setBulkBusy(false)
  }

  return (
    <section className="content-grid review-layout">
      <article className="panel">
        <PanelTitle title={title} description={`${filtered.length} de ${leads.length} lead${leads.length !== 1 ? 's' : ''} — revise antes de colocar alguém em atendimento ativo.`} />

        {/* ── Filtros ── */}
        <div className="review-filters">
          <input
            className="review-search"
            type="search"
            placeholder="Buscar por nome, nicho ou cidade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="review-filter-row">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todos os nichos</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Todas as cidades</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'score' | 'name' | 'city')}>
              <option value="score">Maior score</option>
              <option value="name">Nome A–Z</option>
              <option value="city">Cidade A–Z</option>
            </select>
            {hasPorteData && (
              <select value={porte} onChange={(e) => setPorte(e.target.value)}>
                <option value="">Todos os portes</option>
                <option value="MEI">MEI</option>
                <option value="ME">Micro (ME)</option>
                <option value="EPP">Pequeno (EPP)</option>
                <option value="MEDIO">Médio porte</option>
                <option value="GRANDE">Grande porte</option>
              </select>
            )}
          </div>
          <div className="review-filter-row">
            {(['', 'recommended', 'medium', 'discarded'] as const).map((val) => (
              <button
                key={val || 'all'}
                type="button"
                className={`review-pill${classification === val ? ' active' : ''}`}
                onClick={() => setClassification(val)}
              >
                {val === '' ? 'Todos' : classificationLabel(val)}
              </button>
            ))}
            {hasFilters && (
              <button type="button" className="review-pill clear" onClick={clearFilters}>✕ Limpar</button>
            )}
          </div>

          {/* ── Barra de seleção em massa ── */}
          {(onBulkApprove || onBulkDiscard) && filtered.length > 0 && (
            <div className="bulk-bar">
              <button type="button" className={`bulk-select-all${allFilteredChecked ? ' active' : ''}`} onClick={toggleAll}>
                <span className={`check-box${allFilteredChecked ? ' checked' : ''}`} />
                {allFilteredChecked ? 'Desmarcar todos' : `Selecionar todos (${filtered.length})`}
              </button>
              {checkedLeads.length > 0 && (
                <div className="bulk-actions">
                  <span className="bulk-count">{checkedLeads.length} selecionado{checkedLeads.length !== 1 ? 's' : ''}</span>
                  {onBulkApprove && (
                    <button type="button" className="bulk-btn approve" onClick={handleBulkApprove} disabled={bulkBusy}>
                      {bulkBusy ? 'Aprovando…' : `Aprovar ${checkedLeads.length}`}
                    </button>
                  )}
                  {onBulkDiscard && (
                    <button type="button" className="bulk-btn discard" onClick={handleBulkDiscard} disabled={bulkBusy}>
                      {bulkBusy ? 'Descartando…' : `Descartar ${checkedLeads.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lead-table">
          {filtered.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onClick={() => onSelect(lead)}
              selected={selectedLead?.id === lead.id}
              checked={checkedIds.has(lead.id)}
              onCheck={(e) => toggleCheck(lead.id, e)}
            />
          ))}
          {!filtered.length && leads.length > 0 && <Empty text="Nenhum lead encontrado com esses filtros." />}
          {!leads.length && <Empty text="Nenhum lead nesta fila." />}
        </div>
      </article>
      <article className="panel sticky-panel">
        <PanelTitle title="Ficha rápida" description="Dados, score e orientação de abordagem." />
        {selectedLead ? (
          <LeadDetail lead={selectedLead} onApprove={() => onApprove(selectedLead)} onDiscard={() => onDiscard(selectedLead)} primaryLabel={primaryLabel} onLeadUpdate={onLeadUpdate} />
        ) : <Empty text="Selecione um lead para revisar." />}
      </article>
    </section>
  )
}

function KanbanView({ assignments, followUps, onOpenCrm }: {
  assignments: Assignment[]
  followUps: FollowUp[]
  onOpenCrm: (a: Assignment) => void
}) {
  const [search, setSearch] = useState('')
  const [temperature, setTemperature] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)

  const overdueIds = useMemo(() => new Set(
    followUps.filter((fu) => fu.isOverdue && fu.status === 'pending').map((fu) => fu.assignmentId).filter(Boolean)
  ), [followUps])

  const filtered = useMemo(() => {
    let result = assignments
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((a) =>
        a.lead.name.toLowerCase().includes(q) ||
        (a.lead.category || '').toLowerCase().includes(q) ||
        (a.lead.city || '').toLowerCase().includes(q)
      )
    }
    if (temperature) result = result.filter((a) => a.temperature === temperature)
    if (onlyOverdue) result = result.filter((a) => overdueIds.has(a.id))
    return result
  }, [assignments, search, temperature, onlyOverdue, overdueIds])

  const grouped = useMemo(() =>
    stages.map((stage) => ({ stage, items: filtered.filter((a) => a.stage === stage) })),
    [filtered]
  )

  const activeStageGroups = grouped.filter((g) => !['Perdido', 'Inativo'].includes(g.stage))

  function exportColumn(stage: string, items: Assignment[]) {
    const rows = items.map((a) => [
      a.lead.name,
      a.lead.category || '',
      a.lead.city || '',
      a.lead.phone || '',
      a.lead.website || '',
      a.lead.email || '',
      a.temperature,
      a.nextAction || '',
      a.approach || '',
      a.ownerName || '',
      a.lead.score != null ? String(a.lead.score) : '',
    ])
    const csv = toCsv([
      ['nome', 'nicho', 'cidade', 'whatsapp', 'site', 'email', 'temperatura', 'proximo_passo', 'abordagem', 'responsavel', 'score'],
      ...rows,
    ])
    const slug = stage.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    downloadText(`pipeline-${slug}.csv`, csv, 'text/csv')
  }

  return (
    <div className="kanban-view">
      {/* ── Filtros ── */}
      <div className="kanban-filters">
        <input
          className="review-search"
          type="search"
          placeholder="Buscar por nome, nicho ou cidade…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="kanban-filter-select">
          <option value="">Todas temperaturas</option>
          <option value="quente">Quente</option>
          <option value="morno">Morno</option>
          <option value="frio">Frio</option>
        </select>
        <button
          type="button"
          className={`review-pill${onlyOverdue ? ' active' : ''}`}
          onClick={() => setOnlyOverdue((v) => !v)}
        >
          Follow-ups atrasados
        </button>
        <span className="kanban-count">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Colunas ── */}
      <div className="kanban-board">
        {activeStageGroups.map((group) => (
          <div className="kanban-col" key={group.stage}>
            <div className="kanban-col-header">
              <span>{group.stage}</span>
              <div className="kanban-col-header-right">
                <span className="kanban-col-count">{group.items.length}</span>
                {group.items.length > 0 && (
                  <button
                    type="button"
                    className="kanban-export-btn"
                    title={`Exportar CSV — ${group.stage}`}
                    onClick={(e) => { e.stopPropagation(); exportColumn(group.stage, group.items) }}
                  >
                    ↓ CSV
                  </button>
                )}
              </div>
            </div>
            <div className="kanban-col-body">
              {group.items.map((a) => {
                const fuCount = followUps.filter((fu) => fu.assignmentId === a.id && fu.status === 'pending').length
                const hasOverdue = overdueIds.has(a.id)
                return (
                  <button
                    key={a.id}
                    className={`kb-card${hasOverdue ? ' overdue' : ''}`}
                    type="button"
                    onClick={() => onOpenCrm(a)}
                    title="Abrir no CRM para tratar"
                  >
                    <div className="kb-card-top">
                      <b>{a.lead.name}</b>
                      <span className={`temp-badge ${a.temperature}`}>{a.temperature}</span>
                    </div>
                    {a.lead.category && <div className="kb-card-category">{a.lead.category}</div>}
                    <div className="kb-card-meta">{a.lead.city}{a.lead.phone ? ' · WA' : ''}</div>
                    <div className="kb-card-action">{a.nextAction}</div>
                    <div className="kb-card-footer">
                      {fuCount > 0 && <span className="fu-badge">{fuCount} fu</span>}
                      {a.lead.score != null && <span className="kb-score">{a.lead.score}</span>}
                    </div>
                  </button>
                )
              })}
              {group.items.length === 0 && (
                <div className="kb-empty">— vazio</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Perdido / Inativo (colapsados) ── */}
      <div className="kanban-lost-row">
        {grouped.filter((g) => ['Perdido', 'Inativo'].includes(g.stage)).map((group) => (
          group.items.length > 0 && (
            <details key={group.stage} className="kanban-lost-group">
              <summary>{group.stage} ({group.items.length})</summary>
              <div className="kanban-lost-cards">
                {group.items.map((a) => (
                  <button key={a.id} className="kb-card lost" type="button" onClick={() => onOpenCrm(a)}>
                    <b>{a.lead.name}</b>
                    <div className="kb-card-meta">{a.lead.city}</div>
                  </button>
                ))}
              </div>
            </details>
          )
        ))}
      </div>
    </div>
  )
}

function CrmFollowUpRow({ fu, waConnected, onComplete, onRefresh }: {
  fu: FollowUp
  waConnected: boolean
  onComplete: (fu: FollowUp) => void
  onRefresh: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(fu.text)
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [fuStatus, setFuStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  async function saveText() {
    if (text === fu.text) { setEditing(false); return }
    setIsSaving(true)
    try {
      await api(`/api/follow-ups/${fu.id}`, { method: 'PUT', body: JSON.stringify({ text }) })
      await onRefresh()
    } catch { /* ignore */ } finally {
      setIsSaving(false)
      setEditing(false)
    }
  }

  async function sendFollowUp() {
    setIsSending(true)
    setFuStatus(null)
    try {
      await api(`/api/follow-ups/${fu.id}/send`, { method: 'POST', body: JSON.stringify({ text }) })
      setFuStatus({ ok: true, msg: 'Follow-up enviado!' })
      await onRefresh()
    } catch (err) {
      setFuStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erro ao enviar.' })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={`fu-row${fu.isOverdue ? ' overdue' : ''}`}>
      <div className="fu-meta">
        <span>{formatDate(fu.dueAt)} · passo {fu.step}</span>
        {!editing && <p>{text}</p>}
        {editing && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
          />
        )}
        {fuStatus && <p className={fuStatus.ok ? 'form-success' : 'form-error'} style={{ marginTop: 4 }}>{fuStatus.msg}</p>}
      </div>
      <div className="fu-actions">
        {!editing && <button className="btn-ghost small" type="button" onClick={() => setEditing(true)}>Editar</button>}
        {editing && <button className="btn-ghost small" type="button" onClick={saveText} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</button>}
        {editing && <button className="btn-ghost small" type="button" onClick={() => setEditing(false)}>Cancelar</button>}
        {!editing && (
          <button
            className="btn-ghost small"
            type="button"
            onClick={sendFollowUp}
            disabled={isSending || !waConnected}
            title={!waConnected ? 'Conecte o WhatsApp primeiro' : 'Enviar via WhatsApp e concluir'}
          >
            <span className={`ws-dot ${waConnected ? 'open' : 'close'}`} style={{ marginRight: 5 }} />
            {isSending ? 'Enviando…' : 'Enviar WA'}
          </button>
        )}
        {!editing && <button className="btn-ghost small" type="button" onClick={() => onComplete(fu)}>Concluir</button>}
      </div>
    </div>
  )
}

function CrmView({
  assignments, followUps, whatsapp, selected, onSelect, onStage, onRelease, onCompleteFollowUp, onRefresh,
}: {
  assignments: Assignment[]
  followUps: FollowUp[]
  whatsapp: WhatsAppStatus | null
  selected: Assignment | null
  onSelect: (a: Assignment) => void
  onStage: (a: Assignment, stage: string) => void
  onRelease: (a: Assignment) => void
  onCompleteFollowUp: (fu: FollowUp) => void
  onRefresh: () => Promise<void>
}) {
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [sidebarTemp, setSidebarTemp] = useState('')
  const [sidebarOverdue, setSidebarOverdue] = useState(false)

  const overdueAssignmentIds = useMemo(() => new Set(
    followUps.filter((fu) => fu.isOverdue && fu.status === 'pending').map((fu) => fu.assignmentId).filter(Boolean)
  ), [followUps])

  const filteredAssignments = useMemo(() => {
    let result = assignments
    if (sidebarSearch.trim()) {
      const q = sidebarSearch.toLowerCase()
      result = result.filter((a) =>
        a.lead.name.toLowerCase().includes(q) ||
        (a.lead.category || '').toLowerCase().includes(q) ||
        (a.lead.city || '').toLowerCase().includes(q)
      )
    }
    if (sidebarTemp) result = result.filter((a) => a.temperature === sidebarTemp)
    if (sidebarOverdue) result = result.filter((a) => overdueAssignmentIds.has(a.id))
    return result
  }, [assignments, sidebarSearch, sidebarTemp, sidebarOverdue, overdueAssignmentIds])

  const grouped = useMemo(() => stages.map((stage) => ({ stage, items: filteredAssignments.filter((a) => a.stage === stage) })), [filteredAssignments])

  const [approach, setApproach] = useState(selected?.approach || '')
  const [nextAction, setNextAction] = useState(selected?.nextAction || '')
  const [temperature, setTemperature] = useState(selected?.temperature || 'morno')
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    setApproach(selected?.approach || '')
    setNextAction(selected?.nextAction || '')
    setTemperature(selected?.temperature || 'morno')
    setSendStatus(null)
  }, [selected?.id])

  const assignmentFollowUps = useMemo(
    () => followUps.filter((fu) => fu.assignmentId === selected?.id && fu.status === 'pending'),
    [followUps, selected?.id]
  )

  async function saveDetails() {
    if (!selected) return
    try {
      await api(`/api/assignments/${selected.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: selected.stage, nextAction, temperature }),
      })
      await onRefresh()
    } catch { /* ignore */ }
  }

  async function saveApproach() {
    if (!selected) return
    setIsSaving(true)
    try {
      await api(`/api/assignments/${selected.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: selected.stage, approach }),
      })
      setSendStatus({ ok: true, msg: 'Rascunho salvo.' })
    } catch (err) {
      setSendStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erro ao salvar.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function generateMessage() {
    if (!selected) return
    setIsGenerating(true)
    try {
      const data = await api<{ approach: string }>('/api/messages/generate', {
        method: 'POST',
        body: JSON.stringify({ leadId: selected.lead.id }),
      })
      setApproach(data.approach)
    } catch (err) {
      setSendStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erro ao gerar.' })
    } finally {
      setIsGenerating(false)
    }
  }

  async function sendMessage() {
    if (!selected || !approach.trim()) return
    setIsSending(true)
    setSendStatus(null)
    try {
      await api('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({ number: selected.lead.phone, text: approach, leadId: selected.lead.id }),
      })
      setSendStatus({ ok: true, msg: 'Mensagem enviada via WhatsApp!' })
      await onRefresh()
    } catch (err) {
      setSendStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erro ao enviar.' })
    } finally {
      setIsSending(false)
    }
  }

  const waConnected = whatsapp?.connectionStatus === 'open'

  return (
    <div className="crm-layout">

      {/* ── Sidebar pipeline ── */}
      <div className="crm-sidebar">
        <div className="crm-sidebar-header">
          <span>Pipeline</span>
          <small>{filteredAssignments.length}/{assignments.length}</small>
        </div>
        <div className="crm-sidebar-filters">
          <input
            className="crm-sidebar-search"
            type="search"
            placeholder="Buscar…"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
          <div className="crm-sidebar-filter-row">
            <select value={sidebarTemp} onChange={(e) => setSidebarTemp(e.target.value)} className="crm-sidebar-select">
              <option value="">Temp.</option>
              <option value="quente">Quente</option>
              <option value="morno">Morno</option>
              <option value="frio">Frio</option>
            </select>
            <button
              type="button"
              className={`crm-filter-pill${sidebarOverdue ? ' active' : ''}`}
              onClick={() => setSidebarOverdue((v) => !v)}
              title="Só leads com follow-ups atrasados"
            >
              Atrasados
            </button>
            {(sidebarSearch || sidebarTemp || sidebarOverdue) && (
              <button type="button" className="crm-filter-pill clear" onClick={() => { setSidebarSearch(''); setSidebarTemp(''); setSidebarOverdue(false) }}>✕</button>
            )}
          </div>
        </div>

        {/* Funil resumido */}
        <div className="crm-funnel">
          {grouped.filter((g) => !['Perdido', 'Inativo'].includes(g.stage)).map((group) => (
            <div
              key={group.stage}
              className={`crm-funnel-row${group.items.length === 0 ? ' empty' : ''}`}
              title={group.stage}
            >
              <span className="crm-funnel-label">{group.stage}</span>
              <span className="crm-funnel-count">{group.items.length}</span>
            </div>
          ))}
        </div>

        <div className="crm-sidebar-list">
          {grouped.map((group) => (
            <div key={group.stage} className={group.items.length === 0 ? 'crm-stage-block empty' : 'crm-stage-block'}>
              <div className="crm-stage-label">
                {group.stage}
                <span>({group.items.length})</span>
              </div>
              {group.items.map((a) => (
                <button
                  className={`crm-lead-item${selected?.id === a.id ? ' active' : ''}`}
                  type="button"
                  key={a.id}
                  onClick={() => onSelect(a)}
                >
                  <div className="crm-lead-name">
                    <b>{a.lead.name}</b>
                    <span className={`temp-badge ${a.temperature}`}>{a.temperature}</span>
                    {a.pendingFollowUps ? <span className="fu-badge">{a.pendingFollowUps}</span> : null}
                  </div>
                  <div className="crm-lead-meta">{a.lead.city}{a.lead.category ? ` · ${a.lead.category}` : ''}</div>
                  <div className="crm-lead-action">{a.nextAction}</div>
                </button>
              ))}
              {group.items.length === 0 && (
                <div className="crm-stage-empty">— vazio</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Ficha ── */}
      <div className="crm-ficha">
        {selected ? (
          <div className="crm-detail">

            <LeadDetail lead={selected.lead} />

            {/* ── Controles de etapa ── */}
            <div className="crm-controls">
              <label>Etapa
                <select value={selected.stage} onChange={(e) => onStage(selected, e.target.value)}>
                  {stages.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Temperatura
                <select value={temperature} onChange={(e) => setTemperature(e.target.value)} onBlur={saveDetails}>
                  <option value="frio">Frio</option>
                  <option value="morno">Morno</option>
                  <option value="quente">Quente</option>
                </select>
              </label>
              <label>Próxima ação
                <input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  onBlur={saveDetails}
                  placeholder="Ex: Ligar amanhã de manhã"
                />
              </label>
              <button className="ghost-button" type="button" onClick={() => onRelease(selected)}>
                Liberar para Base Geral
              </button>
            </div>

            {/* ── Mensagem / Abordagem ── */}
            <div className="message-box">
              <div className="message-toolbar">
                <strong>Abordagem</strong>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`ws-dot ${whatsapp?.connectionStatus || 'unknown'}`} title={waConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'} />
                  <small>{selected.lead.phone || 'Sem telefone'}</small>
                  <button className="btn-ghost small" type="button" onClick={generateMessage} disabled={isGenerating}>
                    {isGenerating ? 'Gerando…' : 'Gerar IA'}
                  </button>
                </div>
              </div>
              <textarea
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                rows={6}
                placeholder="Escreva ou gere a abordagem para este lead…"
              />
              <div className="button-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={saveApproach}
                  disabled={isSaving || !approach.trim()}
                >
                  {isSaving ? 'Salvando…' : 'Salvar rascunho'}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={sendMessage}
                  disabled={isSending || !approach.trim() || !selected.lead.phone}
                  title={!waConnected ? 'Conecte o WhatsApp na aba WhatsApp primeiro' : ''}
                >
                  {isSending ? 'Enviando…' : 'Enviar via WhatsApp'}
                </button>
              </div>
              {sendStatus && (
                <p className={sendStatus.ok ? 'form-success' : 'form-error'}>{sendStatus.msg}</p>
              )}
            </div>

            {/* ── Follow-ups pendentes ── */}
            {assignmentFollowUps.length > 0 && (
              <div className="crm-followups">
                <strong className="section-label">Follow-ups pendentes ({assignmentFollowUps.length})</strong>
                {assignmentFollowUps.map((fu) => (
                  <CrmFollowUpRow
                    key={fu.id}
                    fu={fu}
                    waConnected={waConnected}
                    onComplete={onCompleteFollowUp}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            )}

            {/* ── Histórico ── */}
            {(selected.history?.length ?? 0) > 0 && (
              <div className="crm-history">
                <strong className="section-label">Histórico</strong>
                {[...(selected.history || [])].reverse().map((h, i) => (
                  <div key={i} className="history-entry">
                    <span>{formatDate(h.at)}</span>
                    <p>{h.text}</p>
                  </div>
                ))}
              </div>
            )}

          </div>
        ) : (
          <div className="crm-empty-ficha">
            <p>Selecione um lead do pipeline para ver a ficha completa.</p>
          </div>
        )}
      </div>

    </div>
  )
}

function InboxView({ messages, onOpenCrm }: { messages: InboxMessage[]; onOpenCrm: (msg: InboxMessage) => void }) {
  return (
    <section className="panel">
      <PanelTitle title="Inbox" description={`${messages.length} mensagem${messages.length !== 1 ? 's' : ''} enviada${messages.length !== 1 ? 's' : ''} via WhatsApp.`} />
      <div className="inbox-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`inbox-row${msg.status === 'failed' ? ' failed' : ''}`}>
            <div className="inbox-lead">
              {msg.lead ? (
                <>
                  <strong>{msg.lead.name}</strong>
                  <span>{msg.lead.category}{msg.lead.city ? ` · ${msg.lead.city}` : ''}</span>
                  <span className="inbox-phone">{msg.lead.phone || msg.number}</span>
                </>
              ) : (
                <strong>{msg.number}</strong>
              )}
            </div>
            <div className="inbox-body">
              <p className="inbox-text">{msg.text}</p>
              <div className="inbox-footer">
                <span className={`inbox-status ${msg.status}`}>{msg.status === 'sent' ? 'Enviado' : 'Falhou'}</span>
                <span>{formatDate(msg.createdAt)}</span>
                {msg.senderName && <span>por {msg.senderName}</span>}
                {msg.assignmentId && msg.lead && (
                  <button className="btn-ghost small" type="button" onClick={() => onOpenCrm(msg)}>Ver no CRM</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {messages.length === 0 && <Empty text="Nenhuma mensagem enviada ainda." />}
      </div>
    </section>
  )
}

function FollowUpView({ followUps, onDone }: { followUps: FollowUp[]; onDone: (followUp: FollowUp) => void }) {
  return (
    <section className="panel">
      <PanelTitle title="Follow-ups" description="Cada follow-up ativo pertence ao vendedor responsável pelo lead." />
      <div className="lead-table">
        {followUps.map((followUp) => (
          <div className={followUp.isOverdue ? 'follow-row overdue' : 'follow-row'} key={followUp.id}>
            <div>
              <strong>{followUp.lead.name}</strong>
              <span>{formatDate(followUp.dueAt)} · passo {followUp.step} · {followUp.ownerName}</span>
              <p>{followUp.text}</p>
            </div>
            <button className="primary-button" type="button" onClick={() => onDone(followUp)}>Concluir</button>
          </div>
        ))}
        {!followUps.length && <Empty text="Sem follow-ups pendentes." />}
      </div>
    </section>
  )
}

function WhatsAppView({ whatsapp, qrCode, onConnect, onRefresh }: { whatsapp: WhatsAppStatus | null; qrCode: string; onConnect: () => void; onRefresh: () => void }) {
  return (
    <section className="panel">
      <PanelTitle title="WhatsApp comercial" description="Cada vendedor conecta a própria instância para enviar abordagens." />
      <div className="whatsapp-card">
        <div><span>Status</span><strong>{whatsapp?.status || 'Não conectado'}</strong>{whatsapp?.profileName && <small>{whatsapp.profileName}</small>}</div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={onRefresh}>Atualizar</button>
          <button className="primary-button" type="button" onClick={onConnect}>Conectar</button>
        </div>
      </div>
      {qrCode && <div className="qr-box"><div><strong>Escaneie o QR Code</strong><span>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</span></div><img src={qrCode} alt="QR Code do WhatsApp" /></div>}
    </section>
  )
}

function AdminView({ dashboard, runs }: { dashboard: Dashboard | null; assignments?: Assignment[]; runs: SearchRun[] }) {
  const [adminTab, setAdminTab] = useState<'users' | 'trojan'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'Comercial' })
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState({ name: '', password: '', role: '', status: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [instanceStatuses, setInstanceStatuses] = useState<Record<string, InstanceStatus>>({})
  const [loadingStatuses, setLoadingStatuses] = useState(false)
  const [activeQR, setActiveQR] = useState<{ userId: string; code: string } | null>(null)
  const [connectingUserId, setConnectingUserId] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)

  useEffect(() => {
    api<{ users: AdminUser[] }>('/api/admin/users').then((d) => {
      setUsers(d.users)
      loadAllStatuses()
    }).catch(() => {})
  }, [])

  async function loadAllStatuses() {
    setLoadingStatuses(true)
    try {
      const data = await api<{ statuses: (InstanceStatus & { userId: string })[] }>('/api/admin/whatsapp')
      const map: Record<string, InstanceStatus> = {}
      for (const s of data.statuses) map[s.userId] = s
      setInstanceStatuses(map)
    } catch {
      // silently ignore if Evolution not configured
    } finally {
      setLoadingStatuses(false)
    }
  }

  async function provisionAll() {
    setProvisioning(true)
    setError('')
    try {
      const data = await api<{ provisioned: number; failed: string[] }>('/api/admin/whatsapp/provision-all', { method: 'POST' })
      setSuccess(`${data.provisioned} instância(s) provisionada(s).${data.failed.length ? ` Falhou: ${data.failed.join(', ')}` : ''}`)
      await loadAllStatuses()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao provisionar.')
    } finally {
      setProvisioning(false)
    }
  }

  async function connectUser(u: AdminUser) {
    setConnectingUserId(u.id)
    setActiveQR(null)
    setError('')
    try {
      const data = await api<{ whatsapp: InstanceStatus; qrcode: { base64?: string | null } }>(`/api/admin/users/${u.id}/whatsapp/connect`, { method: 'POST' })
      setInstanceStatuses((prev) => ({ ...prev, [u.id]: data.whatsapp }))
      if (data.qrcode?.base64) {
        const src = data.qrcode.base64.startsWith('data:') ? data.qrcode.base64 : `data:image/png;base64,${data.qrcode.base64}`
        setActiveQR({ userId: u.id, code: src })
      } else {
        setSuccess(`${u.name} já está conectado.`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar.')
    } finally {
      setConnectingUserId(null)
    }
  }

  async function refreshStatus(u: AdminUser) {
    try {
      const data = await api<{ whatsapp: InstanceStatus }>(`/api/admin/users/${u.id}/whatsapp`)
      setInstanceStatuses((prev) => ({ ...prev, [u.id]: data.whatsapp }))
    } catch { /* ignore */ }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      const data = await api<{ user: AdminUser }>('/api/admin/users', {
        method: 'POST', body: JSON.stringify(form),
      })
      setUsers((prev) => [...prev, data.user])
      setForm({ name: '', username: '', password: '', role: 'Comercial' })
      setSuccess(`Conta "${data.user.name}" criada. A instância WhatsApp está sendo provisionada.`)
      // Give Evolution a moment to create, then fetch status
      setTimeout(() => refreshStatus(data.user), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.')
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setError('')
    try {
      const data = await api<{ user: AdminUser }>(`/api/admin/users/${editing.id}`, {
        method: 'PUT', body: JSON.stringify(editForm),
      })
      setUsers((prev) => prev.map((u) => u.id === data.user.id ? data.user : u))
      setEditing(null)
      setSuccess(`Conta "${data.user.name}" atualizada.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar.')
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Remover a conta de ${u.name}? Isso não apaga os leads do vendedor.`)) return
    setError('')
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      setUsers((prev) => prev.filter((x) => x.id !== u.id))
      setInstanceStatuses((prev) => { const n = { ...prev }; delete n[u.id]; return n })
      if (activeQR?.userId === u.id) setActiveQR(null)
      setSuccess(`Conta "${u.name}" removida.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover.')
    }
  }

  function startEdit(u: AdminUser) {
    setEditing(u)
    setEditForm({ name: u.name, password: '', role: u.role, status: 'active' })
    setError('')
    setSuccess('')
    setActiveQR(null)
  }

  return (
    <>
      <div className="admin-tabs">
        <button type="button" className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>Gestão</button>
        <button type="button" className={adminTab === 'trojan' ? 'active' : ''} onClick={() => setAdminTab('trojan')}>Cavalo de Troia</button>
      </div>

      {adminTab === 'trojan' && <TrojanView />}

      {adminTab === 'users' && (
    <section className="content-grid">

      {/* ── Criar conta ── */}
      <article className="panel">
        <PanelTitle title="Criar conta" description="Adicione vendedores ao sistema." />
        {error && <p className="form-error">{error}</p>}
        {success && <p className="form-success">{success}</p>}
        <form className="stack" onSubmit={createUser}>
          <label>Nome completo
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: João Silva" required />
          </label>
          <label>Usuário (login)
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Ex: joao@codexy" required />
          </label>
          <label>Senha
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Senha de acesso" required />
          </label>
          <label>Perfil
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="Comercial">Comercial</option>
              <option value="Administrador">Administrador</option>
            </select>
          </label>
          <button type="submit" className="btn-primary">Criar conta</button>
        </form>
      </article>

      {/* ── Instâncias WhatsApp ── */}
      <article className="panel wide">
        <PanelTitle title="Instâncias WhatsApp" description="Status de conexão de cada conta. Clique em Conectar para gerar o QR." />
        <div className="instance-toolbar">
          <button className="btn-ghost small" onClick={loadAllStatuses} disabled={loadingStatuses}>
            {loadingStatuses ? 'Atualizando…' : 'Atualizar status'}
          </button>
          <button className="btn-primary small" onClick={provisionAll} disabled={provisioning}>
            {provisioning ? 'Provisionando…' : 'Provisionar todas'}
          </button>
        </div>
        <div className="stack">
          {users.map((u) => {
            const ws = instanceStatuses[u.id]
            const cs = ws?.connectionStatus || 'unknown'
            const isOpen = cs === 'open'
            const isConnecting = cs === 'connecting'
            const isThisQR = activeQR?.userId === u.id
            return (
              <div key={u.id} className="instance-row">
                <div className="instance-info">
                  <div className="instance-name">
                    <span className={`ws-dot ${cs}`} title={ws?.status || 'Desconhecido'} />
                    <strong>{u.name}</strong>
                    {u.isAdmin && <span className="badge-admin">admin</span>}
                  </div>
                  <span className="instance-meta">
                    {u.evolutionInstanceName || '—'}
                    {ws?.profileName ? ` · ${ws.profileName}` : ''}
                    {ws?.status ? ` · ${ws.status}` : ''}
                  </span>
                </div>
                <div className="user-actions">
                  {!isOpen && (
                    <button
                      className="btn-primary small"
                      onClick={() => connectUser(u)}
                      disabled={connectingUserId === u.id}
                    >
                      {connectingUserId === u.id ? 'Aguarde…' : isConnecting ? 'Novo QR' : 'Conectar'}
                    </button>
                  )}
                  {isOpen && (
                    <button className="btn-ghost small" onClick={() => refreshStatus(u)}>Verificar</button>
                  )}
                </div>
                {isThisQR && activeQR && (
                  <div className="instance-qr">
                    <div className="qr-instructions">
                      <strong>Escaneie o QR Code</strong>
                      <span>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</span>
                    </div>
                    <img src={activeQR.code} alt={`QR Code de ${u.name}`} className="qr-img" />
                    <button className="btn-ghost small" onClick={() => setActiveQR(null)}>Fechar</button>
                  </div>
                )}
              </div>
            )
          })}
          {!users.length && <Empty text="Nenhuma conta cadastrada." />}
        </div>
      </article>

      {/* ── Contas ── */}
      <article className="panel">
        <PanelTitle title="Contas ativas" description={`${users.length} usuário${users.length !== 1 ? 's' : ''} no sistema.`} />
        <div className="stack">
          {users.map((u) => (
            <div key={u.id} className="user-row">
              <div className="user-info">
                <strong>{u.name}</strong>
                <span>{u.username} · {u.role}</span>
              </div>
              <div className="user-actions">
                {!u.isAdmin && (
                  <>
                    <button className="btn-ghost small" onClick={() => startEdit(u)}>Editar</button>
                    <button className="btn-ghost small danger" onClick={() => deleteUser(u)}>Remover</button>
                  </>
                )}
                {u.isAdmin && <span className="badge-admin">admin</span>}
              </div>
            </div>
          ))}
          {!users.length && <Empty text="Nenhuma conta cadastrada." />}
        </div>
      </article>

      {/* ── Editar conta ── */}
      {editing && (
        <article className="panel wide">
          <PanelTitle title={`Editar: ${editing.name}`} description="Altere nome, senha ou perfil do vendedor." />
          <form className="form-grid three" onSubmit={saveEdit}>
            <label>Nome
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label>Nova senha <span className="field-optional">(deixe vazio para manter)</span>
              <input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Nova senha" />
            </label>
            <label>Perfil
              <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="Comercial">Comercial</option>
                <option value="Administrador">Administrador</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn-primary">Salvar</button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </article>
      )}

      {/* ── Time no CRM ── */}
      <article className="panel">
        <PanelTitle title="Desempenho do time" description="Leads ativos por vendedor." />
        <InfoList items={(dashboard?.crm.owners || []).map((owner) => [owner.name, owner.total])} />
      </article>

      {/* ── Buscas recentes ── */}
      <article className="panel">
        <PanelTitle title="Buscas recentes" description="Controle de qualidade e custo." />
        <div className="stack">
          {runs.map((run) => <div className="mini-row static" key={run.id}><strong>{run.preview.strategy.audience}</strong><span>{run.summary}</span></div>)}
          {!runs.length && <Empty text="Nenhuma busca recente." />}
        </div>
      </article>

    </section>
      )}
    </>
  )
}

function TrojanView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [history, setHistory] = useState<TrojanMessage[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'approved' | 'new'>('all')
  const [campaignName, setCampaignName] = useState('')
  const [messages, setMessages] = useState([
    'Oi, {nome}! Vi a presença digital de vocês em {cidade} e queria te mostrar uma ideia rápida para gerar mais contatos pelo WhatsApp.',
    'Olá! Falo com o pessoal da {nome}? Trabalho com melhorias comerciais para empresas de {nicho} e tenho uma sugestão bem objetiva.',
    'Tudo bem? Passei pelo perfil da {nome} e notei uma oportunidade simples para aumentar pedidos e orçamentos online.',
  ])
  const [status, setStatus] = useState('')
  const [isSending, setIsSending] = useState(false)

  const loadTrojan = useCallback(async () => {
    const [leadData, historyData] = await Promise.all([
      api<{ leads: Lead[] }>('/api/admin/trojan/leads'),
      api<{ messages: TrojanMessage[] }>('/api/admin/trojan/history'),
    ])
    setLeads(leadData.leads)
    setHistory(historyData.messages)
  }, [])

  useEffect(() => {
    loadTrojan().catch((err) => setStatus(err instanceof Error ? err.message : 'Erro ao carregar Cavalo de Troia.'))
  }, [loadTrojan])

  const cities = useMemo(() => Array.from(new Set(leads.map((lead) => lead.city).filter(Boolean))).sort(), [leads])
  const categories = useMemo(() => Array.from(new Set(leads.map((lead) => lead.category).filter(Boolean))).sort(), [leads])

  const filtered = useMemo(() => {
    let result = leads
    if (sourceFilter === 'approved') result = result.filter((lead) => lead.isApproved)
    if (sourceFilter === 'new') result = result.filter((lead) => !lead.hasTrojan)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((lead) =>
        lead.name.toLowerCase().includes(q) ||
        (lead.phone || '').includes(q) ||
        (lead.city || '').toLowerCase().includes(q) ||
        (lead.category || '').toLowerCase().includes(q)
      )
    }
    if (city) result = result.filter((lead) => lead.city === city)
    if (category) result = result.filter((lead) => lead.category === category)
    return result
  }, [leads, search, city, category, sourceFilter])

  const selectedLeads = useMemo(() => leads.filter((lead) => selectedIds.has(lead.id)), [leads, selectedIds])
  const allFilteredSelected = filtered.length > 0 && filtered.every((lead) => selectedIds.has(lead.id))
  const sentHistory = history.filter((msg) => msg.status === 'sent')

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filtered.forEach((lead) => allFilteredSelected ? next.delete(lead.id) : next.add(lead.id))
      return next
    })
  }

  async function sendTrojan() {
    if (!selectedLeads.length) return setStatus('Selecione ao menos um lead.')
    if (messages.some((msg) => !msg.trim())) return setStatus('Preencha as 3 formas de mensagem.')
    if (!confirm(`Enviar Cavalo de Troia para ${selectedLeads.length} lead${selectedLeads.length !== 1 ? 's' : ''}?`)) return

    setIsSending(true)
    setStatus('Enviando mensagens...')
    try {
      const data = await api<{ campaign: { sent: number; failed: number } }>('/api/admin/trojan/send', {
        method: 'POST',
        body: JSON.stringify({ leadIds: selectedLeads.map((lead) => lead.id), messages, name: campaignName }),
      })
      setStatus(`${data.campaign.sent} enviada(s), ${data.campaign.failed} falha(s).`)
      setSelectedIds(new Set())
      await loadTrojan()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erro ao enviar Cavalo de Troia.')
    } finally {
      setIsSending(false)
    }
  }

  function exportTxt() {
    const numbers = uniqueNumbers(sentHistory)
    downloadText('cavalo-de-troia-numeros.txt', numbers.join('\n'), 'text/plain')
  }

  function exportCsv() {
    const rows = sentHistory.map((msg) => [
      msg.number,
      msg.lead?.name || '',
      msg.lead?.city || '',
      msg.lead?.category || '',
      msg.campaignName || '',
      formatDate(msg.createdAt),
      msg.variantIndex || '',
    ])
    downloadText('cavalo-de-troia-numeros.csv', toCsv([['numero', 'lead', 'cidade', 'nicho', 'campanha', 'enviado_em', 'variacao'], ...rows]), 'text/csv')
  }

  return (
    <section className="content-grid trojan-grid">
      <article className="panel wide trojan-hero">
        <PanelTitle title="Cavalo de Troia" description="Selecione leads, alterne 3 mensagens e deixe o histórico pronto para auditoria e exportação." />
        <div className="strategy-grid">
          <InfoCard label="Leads com WhatsApp" value={leads.length} />
          <InfoCard label="Selecionados" value={selectedLeads.length} />
          <InfoCard label="Histórico enviado" value={sentHistory.length} />
          <InfoCard label="Números únicos" value={uniqueNumbers(sentHistory).length} />
        </div>
        {status && <p className={status.includes('Erro') || status.includes('Conecte') || status.includes('Selecione') ? 'form-error' : 'form-success'}>{status}</p>}
      </article>

      <article className="panel">
        <PanelTitle title="Selecionar leads" description={`${filtered.length} de ${leads.length} lead${leads.length !== 1 ? 's' : ''} com número disponível.`} />
        <div className="review-filters">
          <div className="trojan-source-tabs">
            <button type="button" className={`review-pill${sourceFilter === 'all' ? ' active' : ''}`} onClick={() => setSourceFilter('all')}>Todos</button>
            <button type="button" className={`review-pill${sourceFilter === 'approved' ? ' active' : ''}`} onClick={() => setSourceFilter('approved')}>Aprovados no CRM</button>
            <button type="button" className={`review-pill${sourceFilter === 'new' ? ' active' : ''}`} onClick={() => setSourceFilter('new')}>Ainda não contatados</button>
          </div>
          <input className="review-search" type="search" placeholder="Buscar por nome, telefone, nicho ou cidade..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="review-filter-row">
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Todas as cidades</option>
              {cities.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todos os nichos</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {(search || city || category) && <button type="button" className="review-pill clear" onClick={() => { setSearch(''); setCity(''); setCategory('') }}>Limpar</button>}
          </div>
          <div className="bulk-bar">
            <button type="button" className={`bulk-select-all${allFilteredSelected ? ' active' : ''}`} onClick={toggleFiltered}>
              <span className={`check-box${allFilteredSelected ? ' checked' : ''}`} />
              {allFilteredSelected ? 'Desmarcar filtrados' : `Selecionar filtrados (${filtered.length})`}
            </button>
            <span className="bulk-count">{selectedLeads.length} selecionado{selectedLeads.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="lead-table trojan-leads">
          {filtered.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onClick={() => toggleLead(lead.id)} checked={selectedIds.has(lead.id)} onCheck={(e) => { e.stopPropagation(); toggleLead(lead.id) }} />
          ))}
          {!filtered.length && <Empty text="Nenhum lead com WhatsApp encontrado." />}
        </div>
      </article>

      <article className="panel sticky-panel">
        <PanelTitle title="3 formas de mensagem" description="Use {nome}, {cidade}, {nicho} e {telefone}; o envio alterna as variações automaticamente." />
        <label>Nome da campanha
          <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex: Reativação maio" />
        </label>
        <div className="trojan-message-stack">
          {messages.map((message, index) => (
            <label key={index}>Variação {index + 1}
              <textarea rows={5} value={message} onChange={(e) => setMessages((prev) => prev.map((item, i) => i === index ? e.target.value : item))} />
            </label>
          ))}
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={sendTrojan} disabled={isSending || selectedLeads.length === 0}>
            {isSending ? 'Enviando...' : `Enviar para ${selectedLeads.length}`}
          </button>
        </div>
      </article>

      <article className="panel wide">
        <PanelTitle title="Histórico do Cavalo de Troia" description="Registros de quem recebeu, número usado, campanha e variação enviada." />
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={exportTxt} disabled={!sentHistory.length}>Exportar TXT</button>
          <button className="ghost-button" type="button" onClick={exportCsv} disabled={!sentHistory.length}>Exportar CSV</button>
        </div>
        <div className="inbox-list">
          {history.map((msg) => (
            <div key={msg.id} className={`inbox-row${msg.status === 'failed' ? ' failed' : ''}`}>
              <div className="inbox-lead">
                <strong>{msg.lead?.name || msg.number}</strong>
                <span>{msg.campaignName || 'Cavalo de Troia'}{msg.variantIndex ? ` · variação ${msg.variantIndex}` : ''}</span>
                <span className="inbox-phone">{msg.number}</span>
              </div>
              <div className="inbox-body">
                <p className="inbox-text">{msg.text}</p>
                <div className="inbox-footer">
                  <span className={`inbox-status ${msg.status}`}>{msg.status === 'sent' ? 'Enviado' : 'Falhou'}</span>
                  <span>{formatDate(msg.createdAt)}</span>
                  {msg.senderName && <span>por {msg.senderName}</span>}
                </div>
              </div>
            </div>
          ))}
          {!history.length && <Empty text="Nenhum Cavalo de Troia enviado ainda." />}
        </div>
      </article>
    </section>
  )
}

function LeadDetail({ lead, onApprove, onDiscard, primaryLabel, onLeadUpdate }: { lead: Lead; onApprove?: () => void; onDiscard?: () => void; primaryLabel?: string; onLeadUpdate?: (lead: Lead) => void }) {
  const [cnpjInput, setCnpjInput] = useState('')
  const [cnpjBusy, setCnpjBusy] = useState(false)
  const [cnpjMsg, setCnpjMsg] = useState('')

  async function handleCnpjSearch() {
    setCnpjBusy(true)
    setCnpjMsg('')
    try {
      const body = cnpjInput.trim() ? { cnpj: cnpjInput.trim() } : {}
      const data = await api<{ lead: Lead; enriched: boolean }>(`/api/leads/${lead.id}/enrich-cnpj`, { method: 'POST', body: JSON.stringify(body) })
      if (data.enriched) {
        setCnpjMsg('Dados encontrados!')
        onLeadUpdate?.(data.lead)
      } else {
        setCnpjMsg('CNPJ não encontrado automaticamente. Digite o CNPJ manualmente.')
      }
    } catch {
      setCnpjMsg('Erro ao buscar CNPJ.')
    } finally {
      setCnpjBusy(false)
    }
  }

  const hasCnpj = Boolean(lead.cnpj)

  return (
    <div className="lead-detail">
      {lead.lastOwnerName && !lead.activeOwnerName && (
        <div className="lead-prev-owner-banner">
          <span>📋</span>
          <span>Trabalhado anteriormente por <strong>{lead.lastOwnerName}</strong>. O histórico completo estará disponível no CRM ao assumir.</span>
        </div>
      )}
      {lead.activeOwnerName && (
        <div className="lead-active-banner">
          <span>🔒</span>
          <span>Este lead está <strong>ativo no CRM de {lead.activeOwnerName}</strong>. Ficará disponível se ele liberar ou por inatividade.</span>
        </div>
      )}
      <div className="score-header">
        <div><strong>{lead.name}</strong><span>{lead.category} · {lead.city}</span></div>
        <b>{lead.score || 0}</b>
      </div>
      <p>{lead.agentAdvice || lead.pain}</p>
      <InfoList items={[
        ['Produto', lead.product || '-'],
        ['Telefone', lead.phone || 'Não identificado'],
        ['Site', lead.website || 'Sem site identificado'],
        ['Google', `${lead.rating || '-'} · ${lead.reviews || 0} avaliações`],
        ['Contato', lead.lastContactAt ? formatDate(lead.lastContactAt) : 'Nunca contatado'],
      ]} />

      {/* ── Seção CNPJ ── */}
      <div className="cnpj-section">
        <div className="cnpj-header">
          <strong>Dados da Receita Federal</strong>
          {hasCnpj && <span className="cnpj-badge">{formatCnpj(lead.cnpj!)}</span>}
        </div>

        {hasCnpj ? (
          <div className="cnpj-data">
            <InfoList items={([
              ['Razão social', lead.cnpjRazaoSocial || '-'],
              ['Porte', lead.cnpjPorte || '-'],
              ['Capital social', lead.cnpjCapitalSocial != null ? `R$ ${lead.cnpjCapitalSocial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'],
              ['Abertura', lead.cnpjDataAbertura ? formatDateStr(lead.cnpjDataAbertura) : '-'],
              ['Situação', lead.cnpjSituacao || '-'],
              ['CNAE', lead.cnpjCnae || '-'],
            ] as [string, string][]).filter(([, v]) => v !== '-')} />
            {lead.cnpjSocios && lead.cnpjSocios.length > 0 && (
              <div className="cnpj-socios">
                <span>Sócios:</span>
                {lead.cnpjSocios.map((s, i) => <span key={i}>{s.nome}</span>)}
              </div>
            )}
          </div>
        ) : (
          <div className="cnpj-lookup">
            <p className="cnpj-hint">Busca automática pelo nome do negócio. Se não encontrar, digite o CNPJ.</p>
            <div className="cnpj-input-row">
              <input
                type="text"
                placeholder="CNPJ (opcional)"
                value={cnpjInput}
                onChange={(e) => setCnpjInput(e.target.value)}
                maxLength={18}
              />
              <button type="button" className="btn-ghost small" onClick={handleCnpjSearch} disabled={cnpjBusy}>
                {cnpjBusy ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {cnpjMsg && <p className={`cnpj-msg${cnpjMsg.includes('encontrad') && !cnpjMsg.includes('não') ? ' ok' : ' warn'}`}>{cnpjMsg}</p>}
          </div>
        )}
      </div>

      <TwoColumnList leftTitle="Sinais positivos" left={lead.scoreReasons || []} rightTitle="Alertas" right={lead.scoreWarnings || []} />
      {lead.sourceKeywords?.length ? <div className="keyword-wrap">{lead.sourceKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div> : null}
      {(onApprove || onDiscard) && <div className="button-row"><button className="ghost-button" type="button" onClick={onDiscard}>Descartar</button><button className="primary-button" type="button" onClick={onApprove}>{primaryLabel}</button></div>}
    </div>
  )
}

function formatCnpj(cnpj: string) {
  const c = String(cnpj).replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
}

function formatDateStr(str: string) {
  if (!str) return '-'
  // Handle YYYY-MM-DD format
  const [y, m, d] = str.split('-')
  if (y && m && d) return `${d}/${m}/${y}`
  return str
}

function LeadRow({ lead, onClick, selected = false, checked, onCheck }: { lead: Lead; onClick: () => void; selected?: boolean; checked?: boolean; onCheck?: (e: React.MouseEvent) => void }) {
  const cls = lead.classification || 'medium'
  return (
    <button className={`lead-row is-${cls}${selected ? ' is-selected' : ''}${checked ? ' is-checked' : ''}`} type="button" onClick={onClick}>
      {onCheck !== undefined && (
        <span className="lead-row-check" onClick={onCheck} role="checkbox" aria-checked={checked}>
          <span className={`check-box${checked ? ' checked' : ''}`} />
        </span>
      )}
      <div className="lead-row-main">
        <div className="lead-row-top">
          <strong>{lead.name}</strong>
          <span className={`score-badge score-${cls}`}>{lead.score || 0}</span>
        </div>
        <div className="lead-row-tags">
          {lead.category && <span className="tag-nicho">{lead.category}</span>}
          {lead.city && <span className="tag-city">{lead.city}</span>}
          {lead.phone && <span className="tag-phone">WA</span>}
          {!lead.website && <span className="tag-no-site">Sem site</span>}
          {lead.hasTrojan && <span className="tag-trojan">Trojan</span>}
        </div>
        <div className="lead-row-advice">{lead.agentAdvice || lead.pain}</div>
      </div>
      <span className={`class-badge class-${cls}`}>{classificationLabel(cls)}</span>
    </button>
  )
}

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
  return <div className={followUp.isOverdue ? 'mini-row static danger' : 'mini-row static'}><strong>{followUp.lead.name}</strong><span>{formatDate(followUp.dueAt)} · {followUp.text}</span></div>
}

function EditableList({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="editable-list">
      <strong>{title}</strong>
      {items.map((item, index) => (
        <input key={`${item}-${index}`} value={item} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? event.target.value : current))} />
      ))}
    </div>
  )
}

function TwoColumnList({ leftTitle, left, rightTitle, right }: { leftTitle: string; left: string[]; rightTitle: string; right: string[] }) {
  return (
    <div className="two-list">
      <div><strong>{leftTitle}</strong>{left.length ? left.map((item) => <span key={item}>{item}</span>) : <small>Nenhum item.</small>}</div>
      <div><strong>{rightTitle}</strong>{right.length ? right.map((item) => <span key={item}>{item}</span>) : <small>Nenhum item.</small>}</div>
    </div>
  )
}

function InfoList({ items }: { items: Array<[string, string | number]> }) {
  return <div className="info-list">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return <div className="info-card"><span>{label}</span><strong>{value}</strong></div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>
}

function PanelTitle({ title, description }: { title: string; description: string }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{description}</p></div></div>
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function NavButton({ id, current, label, badge, onClick }: { id: View; current: View; label: string; badge?: number; onClick: (view: View) => void }) {
  return (
    <button className={id === current ? 'active' : ''} type="button" onClick={() => onClick(id)}>
      {label}
      {badge && badge > 0 ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}

function Brand() {
  return <div className="brand"><img src="/codexy-logo.png" alt="Codexy" /><span>Prospect</span></div>
}

async function api<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Erro na requisição.')
  return data as T
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function viewTitle(view: View, user: SessionUser) {
  const map: Record<View, string> = {
    day: `${greeting()}, ${user.name.split(' ')[0]}`,
    prospect: 'Criar Prospecção',
    approval: 'Aprovação Manual',
    pool: 'Base Geral',
    kanban: 'Pipeline',
    crm: 'Meu CRM',
    followups: 'Follow-ups',
    inbox: 'Inbox',
    whatsapp: 'WhatsApp',
    admin: 'Admin',
  }
  return map[view]
}

function viewDescription(view: View) {
  const map: Record<View, string> = {
    day: 'Comece pelo que precisa de ação hoje.',
    prospect: 'O agente planeja a busca antes de consumir APIs e gerar novos leads.',
    approval: 'Só aprove para o CRM os leads que fazem sentido abordar.',
    pool: 'Leads sem conversa ativa ficam disponíveis para reativação.',
    kanban: 'Visão geral de todos os leads por etapa. Clique em um card para tratar no CRM.',
    crm: 'Acompanhe seus atendimentos ativos sem misturar leads de outros vendedores.',
    followups: 'Controle os retornos antes que oportunidades esfriem.',
    inbox: 'Histórico de mensagens enviadas via WhatsApp com os leads.',
    whatsapp: 'Conecte a instância comercial do vendedor.',
    admin: 'Visão global para gestão da operação.',
  }
  return map[view]
}

function classificationLabel(value?: string) {
  const map: Record<string, string> = {
    recommended: 'Recomendado',
    medium: 'Médio',
    discarded: 'Baixa prioridade',
    duplicate: 'Duplicado',
    'already-active': 'Já ativo',
  }
  return map[value || ''] || 'Em análise'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function uniqueNumbers(messages: Pick<TrojanMessage, 'number'>[]) {
  return Array.from(new Set(messages.map((msg) => msg.number).filter(Boolean)))
}

function toCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default App



