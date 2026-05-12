import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type View = 'day' | 'prospect' | 'approval' | 'pool' | 'crm' | 'followups' | 'whatsapp' | 'admin'

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
  lastContactAt?: string | null
  fromCache?: boolean
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
  lead: Lead
}

type FollowUp = {
  id: string
  leadId: string
  step: number
  text: string
  status: string
  dueAt: string
  ownerName: string
  isOverdue: boolean
  lead: Lead
}

type Dashboard = {
  totals: { opportunities: number; qualified: number; sent: number; followUps: number; available: number; approval: number }
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

const presets = [
  { id: 'sem-site', label: 'Empresas sem site' },
  { id: 'premium', label: 'NegÃ³cios premium' },
  { id: 'whatsapp', label: 'WhatsApp manual' },
  { id: 'google', label: 'Bom Google, presenÃ§a fraca' },
]

const stages = ['Aprovado', 'Abordagem pronta', 'Mensagem enviada', 'Respondeu', 'ReuniÃ£o marcada', 'Proposta enviada', 'Fechado', 'Perdido', 'Inativo']

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
  const [status, setStatus] = useState('Pronto.')
  const [isBusy, setIsBusy] = useState(false)

  const refreshCore = useCallback(async () => {
    const [dashboardData, approvalData, poolData, crmData, followUpData] = await Promise.all([
      api<{ totals: Dashboard['totals']; daily: Dashboard['daily']; leads: Assignment[]; recentRuns: SearchRun[]; crm: Dashboard['crm'] }>('/api/dashboard'),
      api<{ leads: Lead[] }>('/api/leads/approval'),
      api<{ leads: Lead[] }>('/api/leads/pool'),
      api<{ assignments: Assignment[] }>('/api/crm'),
      api<{ followUps: FollowUp[] }>('/api/follow-ups'),
    ])
    setDashboard(dashboardData)
    setApprovalLeads(approvalData.leads)
    setPoolLeads(poolData.leads)
    setAssignments(crmData.assignments)
    setFollowUps(followUpData.followUps)
  }, [])

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
      const data = await api<{ assignment: Assignment }>(`/api/leads/${lead.id}/approve`, { method: 'POST' })
      setSelectedAssignment(data.assignment)
      setSelectedLead(data.assignment.lead)
      setView('crm')
      await refreshCore()
    })
  }

  async function discardLead(lead: Lead) {
    await runAction(`Descartando ${lead.name}...`, async () => {
      await api(`/api/leads/${lead.id}/discard`, { method: 'POST', body: JSON.stringify({ reason: 'Descartado na revisÃ£o manual.' }) })
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
      await api(`/api/assignments/${assignment.id}/release`, { method: 'POST', body: JSON.stringify({ reason: 'Liberado manualmente para reativaÃ§Ã£o.' }) })
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

  const metrics = dashboard?.totals || { opportunities: 0, qualified: 0, sent: 0, followUps: 0, available: 0, approval: 0 }

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
          <NavButton current={view} id="day" label="Meu Dia" onClick={setView} />
          <NavButton current={view} id="prospect" label="Criar ProspecÃ§Ã£o" onClick={setView} />
          <NavButton current={view} id="approval" label={`AprovaÃ§Ã£o (${metrics.approval})`} onClick={setView} />
          <NavButton current={view} id="pool" label={`Base Geral (${metrics.available})`} onClick={setView} />
          <NavButton current={view} id="crm" label="Meu CRM" onClick={setView} />
          <NavButton current={view} id="followups" label={`Follow-ups (${metrics.followUps})`} onClick={setView} />
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
          <Metric label="AprovaÃ§Ã£o" value={metrics.approval} />
          <Metric label="Base Geral" value={metrics.available} />
          <Metric label="Follow-ups" value={metrics.followUps} />
          <Metric label="Enviadas" value={metrics.sent} />
        </section>

        {view === 'day' && <DayView dashboard={dashboard} assignments={assignments} followUps={followUps} onOpenCrm={(assignment) => { setSelectedAssignment(assignment); setSelectedLead(assignment.lead); setView('crm') }} onGo={setView} />}
        {view === 'prospect' && <ProspectView isBusy={isBusy} onRun={refreshCore} setStatus={setStatus} setBusy={setIsBusy} />}
        {view === 'approval' && <LeadReviewView title="Leads para aprovaÃ§Ã£o" leads={approvalLeads} selectedLead={selectedLead} onSelect={setSelectedLead} onApprove={approveLead} onDiscard={discardLead} primaryLabel="Aprovar para meu CRM" />}
        {view === 'pool' && <LeadReviewView title="Base Geral disponÃ­vel" leads={poolLeads} selectedLead={selectedLead} onSelect={setSelectedLead} onApprove={claimLead} onDiscard={discardLead} primaryLabel="Assumir lead" />}
        {view === 'crm' && <CrmView assignments={assignments} selected={selectedAssignment} onSelect={(assignment) => { setSelectedAssignment(assignment); setSelectedLead(assignment.lead) }} onStage={updateStage} onRelease={releaseAssignment} />}
        {view === 'followups' && <FollowUpView followUps={followUps} onDone={completeFollowUp} />}
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
        <h1>Sistema diÃ¡rio de prospecÃ§Ã£o comercial</h1>
        <p>Crie buscas inteligentes, aprove leads manualmente e mantenha cada vendedor focado nos prÃ³prios atendimentos ativos.</p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div>
          <span className="product-label">Acesso interno</span>
          <h2>Entrar no Prospect</h2>
        </div>
        <label>UsuÃ¡rio<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={isBusy}>{isBusy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  )
}

function DayView({ dashboard, assignments, followUps, onOpenCrm, onGo }: { dashboard: Dashboard | null; assignments: Assignment[]; followUps: FollowUp[]; onOpenCrm: (assignment: Assignment) => void; onGo: (view: View) => void }) {
  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="PrÃ³xima melhor aÃ§Ã£o" description="O sistema prioriza o que move o dia comercial." />
        <div className="daily-action">
          <strong>{dashboard?.daily.nextAction || 'Criar nova prospecÃ§Ã£o'}</strong>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => onGo('prospect')}>Criar prospecÃ§Ã£o</button>
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
          ['DisponÃ­veis na base', dashboard?.daily.availablePool || 0],
        ]} />
      </article>
      <article className="panel">
        <PanelTitle title="CRM ativo" description="Atendimentos que estÃ£o com vocÃª." />
        <div className="stack">
          {assignments.slice(0, 5).map((assignment) => (
            <button className="mini-row" type="button" key={assignment.id} onClick={() => onOpenCrm(assignment)}>
              <strong>{assignment.lead.name}</strong>
              <span>{assignment.stage} Â· {assignment.nextAction}</span>
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
    </section>
  )
}

function ProspectView({ isBusy, onRun, setStatus, setBusy }: { isBusy: boolean; onRun: () => Promise<void>; setStatus: (value: string) => void; setBusy: (value: boolean) => void }) {
  const [prompt, setPrompt] = useState('Quero vender landing page para odontologia em Belo Horizonte')
  const [preset, setPreset] = useState('sem-site')
  const [product, setProduct] = useState('Landing Pages')
  const [region, setRegion] = useState('Belo Horizonte')
  const [preview, setPreview] = useState<StrategyPreview | null>(null)
  const [run, setRun] = useState<SearchRun | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])

  async function generatePreview() {
    setBusy(true)
    setStatus('Montando preview da estratÃ©gia...')
    try {
      const data = await api<{ preview: StrategyPreview }>('/api/prospect/preview', { method: 'POST', body: JSON.stringify({ prompt, preset, product, region }) })
      setPreview(data.preview)
      setStatus('Preview pronto para revisÃ£o.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro ao gerar preview.')
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    if (!preview) return
    setBusy(true)
    setStatus('Executando busca com cache e deduplicaÃ§Ã£o...')
    try {
      const data = await api<{ run: SearchRun; leads: Lead[] }>('/api/prospect/runs', { method: 'POST', body: JSON.stringify({ preview }) })
      setRun(data.run)
      setLeads(data.leads)
      await onRun()
      setStatus('Busca concluÃ­da. Revise os leads na aprovaÃ§Ã£o manual.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro ao executar busca.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="Criar prospecÃ§Ã£o com agente" description="Descreva a intenÃ§Ã£o comercial. O agente transforma isso em estratÃ©gia antes de gastar chamadas de API." />
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
        <div className="preset-row">
          {presets.map((item) => <button className={preset === item.id ? 'chip active' : 'chip'} type="button" key={item.id} onClick={() => setPreset(item.id)}>{item.label}</button>)}
        </div>
        <div className="form-grid three">
          <label>Produto<input value={product} onChange={(event) => setProduct(event.target.value)} /></label>
          <label>RegiÃ£o<input value={region} onChange={(event) => setRegion(event.target.value)} /></label>
          <button className="primary-button" type="button" disabled={isBusy} onClick={generatePreview}>Gerar preview</button>
        </div>
      </article>

      {preview && (
        <article className="panel wide">
          <PanelTitle title="Preview da estratÃ©gia" description="Confira como a busca serÃ¡ executada antes de aprovar." />
          <div className="strategy-grid">
            <InfoCard label="Produto" value={preview.strategy.product} />
            <InfoCard label="PÃºblico" value={preview.strategy.audience} />
            <InfoCard label="RegiÃ£o" value={preview.strategy.region} />
            <InfoCard label="Leads Ãºteis estimados" value={preview.strategy.estimatedUsefulRange} />
            <InfoCard label="Chamadas previstas" value={preview.strategy.estimatedApiCalls} />
            <InfoCard label="Risco de repetiÃ§Ã£o" value={preview.strategy.repetitionRisk} />
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
            <InfoCard label="Ãšnicos" value={run.stats.uniqueFound} />
            <InfoCard label="Recomendados" value={run.stats.recommended} />
            <InfoCard label="MÃ©dios" value={run.stats.medium} />
            <InfoCard label="Cache" value={run.stats.cacheHits} />
          </div>
          <div className="lead-table">{leads.slice(0, 8).map((lead) => <LeadRow key={lead.id} lead={lead} onClick={() => undefined} />)}</div>
        </article>
      )}
    </section>
  )
}

function LeadReviewView({ title, leads, selectedLead, onSelect, onApprove, onDiscard, primaryLabel }: { title: string; leads: Lead[]; selectedLead: Lead | null; onSelect: (lead: Lead) => void; onApprove: (lead: Lead) => void; onDiscard: (lead: Lead) => void; primaryLabel: string }) {
  return (
    <section className="content-grid review-layout">
      <article className="panel">
        <PanelTitle title={title} description="Revise a recomendaÃ§Ã£o do agente antes de colocar alguÃ©m em atendimento ativo." />
        <div className="lead-table">
          {leads.map((lead) => <LeadRow key={lead.id} lead={lead} onClick={() => onSelect(lead)} selected={selectedLead?.id === lead.id} />)}
          {!leads.length && <Empty text="Nenhum lead nesta fila." />}
        </div>
      </article>
      <article className="panel sticky-panel">
        <PanelTitle title="Ficha rÃ¡pida" description="Dados, score e orientaÃ§Ã£o de abordagem." />
        {selectedLead ? (
          <LeadDetail lead={selectedLead} onApprove={() => onApprove(selectedLead)} onDiscard={() => onDiscard(selectedLead)} primaryLabel={primaryLabel} />
        ) : <Empty text="Selecione um lead para revisar." />}
      </article>
    </section>
  )
}

function CrmView({ assignments, selected, onSelect, onStage, onRelease }: { assignments: Assignment[]; selected: Assignment | null; onSelect: (assignment: Assignment) => void; onStage: (assignment: Assignment, stage: string) => void; onRelease: (assignment: Assignment) => void }) {
  const grouped = useMemo(() => stages.map((stage) => ({ stage, items: assignments.filter((assignment) => assignment.stage === stage) })), [assignments])
  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="Pipeline enxuto" description="Somente leads ativos do vendedor aparecem aqui." />
        <div className="kanban">
          {grouped.map((group) => (
            <div className="kanban-column" key={group.stage}>
              <strong>{group.stage}</strong>
              {group.items.map((assignment) => (
                <button className="pipeline-card" type="button" key={assignment.id} onClick={() => onSelect(assignment)}>
                  <b>{assignment.lead.name}</b>
                  <span>{assignment.lead.product} Â· {assignment.temperature}</span>
                  <small>{assignment.nextAction}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      </article>
      <article className="panel wide">
        <PanelTitle title="Ficha do lead" description="HistÃ³rico comercial, mensagem e prÃ³xima etapa." />
        {selected ? (
          <div className="crm-detail">
            <LeadDetail lead={selected.lead} />
            <div className="message-box">
              <label>Abordagem sugerida<textarea value={selected.approach} readOnly rows={6} /></label>
              <div className="form-grid three">
                <label>Etapa<select value={selected.stage} onChange={(event) => onStage(selected, event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
                <button className="ghost-button" type="button" onClick={() => onRelease(selected)}>Liberar para Base Geral</button>
              </div>
            </div>
          </div>
        ) : <Empty text="Selecione um card do pipeline." />}
      </article>
    </section>
  )
}

function FollowUpView({ followUps, onDone }: { followUps: FollowUp[]; onDone: (followUp: FollowUp) => void }) {
  return (
    <section className="panel">
      <PanelTitle title="Follow-ups" description="Cada follow-up ativo pertence ao vendedor responsÃ¡vel pelo lead." />
      <div className="lead-table">
        {followUps.map((followUp) => (
          <div className={followUp.isOverdue ? 'follow-row overdue' : 'follow-row'} key={followUp.id}>
            <div>
              <strong>{followUp.lead.name}</strong>
              <span>{formatDate(followUp.dueAt)} Â· passo {followUp.step} Â· {followUp.ownerName}</span>
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
      <PanelTitle title="WhatsApp comercial" description="Cada vendedor conecta a prÃ³pria instÃ¢ncia para enviar abordagens." />
      <div className="whatsapp-card">
        <div><span>Status</span><strong>{whatsapp?.status || 'NÃ£o conectado'}</strong>{whatsapp?.profileName && <small>{whatsapp.profileName}</small>}</div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={onRefresh}>Atualizar</button>
          <button className="primary-button" type="button" onClick={onConnect}>Conectar</button>
        </div>
      </div>
      {qrCode && <div className="qr-box"><div><strong>Escaneie o QR Code</strong><span>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</span></div><img src={qrCode} alt="QR Code do WhatsApp" /></div>}
    </section>
  )
}

function AdminView({ dashboard, assignments, runs }: { dashboard: Dashboard | null; assignments: Assignment[]; runs: SearchRun[] }) {
  return (
    <section className="content-grid">
      <article className="panel">
        <PanelTitle title="GestÃ£o do time" description="VisÃ£o administrativa da operaÃ§Ã£o." />
        <InfoList items={(dashboard?.crm.owners || []).map((owner) => [owner.name, owner.total])} />
      </article>
      <article className="panel">
        <PanelTitle title="Buscas recentes" description="Controle de qualidade e custo." />
        <div className="stack">
          {runs.map((run) => <div className="mini-row static" key={run.id}><strong>{run.preview.strategy.audience}</strong><span>{run.summary}</span></div>)}
          {!runs.length && <Empty text="Nenhuma busca recente." />}
        </div>
      </article>
      <article className="panel wide">
        <PanelTitle title="CRM global" description="Admin acompanha todos os atendimentos ativos." />
        <div className="lead-table">{assignments.map((assignment) => <LeadRow key={assignment.id} lead={assignment.lead} onClick={() => undefined} />)}</div>
      </article>
    </section>
  )
}

function LeadDetail({ lead, onApprove, onDiscard, primaryLabel }: { lead: Lead; onApprove?: () => void; onDiscard?: () => void; primaryLabel?: string }) {
  return (
    <div className="lead-detail">
      <div className="score-header">
        <div><strong>{lead.name}</strong><span>{lead.category} Â· {lead.city}</span></div>
        <b>{lead.score || 0}</b>
      </div>
      <p>{lead.agentAdvice || lead.pain}</p>
      <InfoList items={[
        ['Produto', lead.product || '-'],
        ['Telefone', lead.phone || 'NÃ£o identificado'],
        ['Site', lead.website || 'Sem site identificado'],
        ['Google', `${lead.rating || '-'} Â· ${lead.reviews || 0} avaliaÃ§Ãµes`],
        ['Status', lead.activeOwnerName ? `Ativo com ${lead.activeOwnerName}` : lead.availability || 'disponÃ­vel'],
      ]} />
      <TwoColumnList leftTitle="Sinais positivos" left={lead.scoreReasons || []} rightTitle="Alertas" right={lead.scoreWarnings || []} />
      {lead.sourceKeywords?.length ? <div className="keyword-wrap">{lead.sourceKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div> : null}
      {(onApprove || onDiscard) && <div className="button-row"><button className="ghost-button" type="button" onClick={onDiscard}>Descartar</button><button className="primary-button" type="button" onClick={onApprove}>{primaryLabel}</button></div>}
    </div>
  )
}

function LeadRow({ lead, onClick, selected = false }: { lead: Lead; onClick: () => void; selected?: boolean }) {
  return (
    <button className={selected ? 'lead-row is-selected' : 'lead-row'} type="button" onClick={onClick}>
      <span><strong>{lead.name}</strong><small>{lead.category} Â· {lead.city}</small></span>
      <span><strong>{classificationLabel(lead.classification)}</strong><small>{lead.agentAdvice || lead.pain}</small></span>
      <b>{lead.score || 0}</b>
    </button>
  )
}

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
  return <div className={followUp.isOverdue ? 'mini-row static danger' : 'mini-row static'}><strong>{followUp.lead.name}</strong><span>{formatDate(followUp.dueAt)} Â· {followUp.text}</span></div>
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

function NavButton({ id, current, label, onClick }: { id: View; current: View; label: string; onClick: (view: View) => void }) {
  return <button className={id === current ? 'active' : ''} type="button" onClick={() => onClick(id)}>{label}</button>
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
  if (!response.ok) throw new Error(data.error || 'Erro na requisiÃ§Ã£o.')
  return data as T
}

function viewTitle(view: View, user: SessionUser) {
  const map: Record<View, string> = {
    day: `Meu Dia, ${user.name.split(' ')[0]}`,
    prospect: 'Criar ProspecÃ§Ã£o',
    approval: 'AprovaÃ§Ã£o Manual',
    pool: 'Base Geral',
    crm: 'Meu CRM',
    followups: 'Follow-ups',
    whatsapp: 'WhatsApp',
    admin: 'Admin',
  }
  return map[view]
}

function viewDescription(view: View) {
  const map: Record<View, string> = {
    day: 'Comece pelo que precisa de aÃ§Ã£o hoje.',
    prospect: 'O agente planeja a busca antes de consumir APIs e gerar novos leads.',
    approval: 'SÃ³ aprove para o CRM os leads que fazem sentido abordar.',
    pool: 'Leads sem conversa ativa ficam disponÃ­veis para reativaÃ§Ã£o.',
    crm: 'Acompanhe seus atendimentos ativos sem misturar leads de outros vendedores.',
    followups: 'Controle os retornos antes que oportunidades esfriem.',
    whatsapp: 'Conecte a instÃ¢ncia comercial do vendedor.',
    admin: 'VisÃ£o global para gestÃ£o da operaÃ§Ã£o.',
  }
  return map[view]
}

function classificationLabel(value?: string) {
  const map: Record<string, string> = {
    recommended: 'Recomendado',
    medium: 'MÃ©dio',
    discarded: 'Baixa prioridade',
    duplicate: 'Duplicado',
    'already-active': 'JÃ¡ ativo',
  }
  return map[value || ''] || 'Em anÃ¡lise'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default App

