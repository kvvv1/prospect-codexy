import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type View = 'day' | 'prospect' | 'approval' | 'pool' | 'kanban' | 'crm' | 'followups' | 'whatsapp' | 'admin' | 'inbox' | 'command'

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
  foundByNames?: string[]
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

type SiteCheckResult = {
  id: string
  name: string
  url: string
  status: number | null
  responseMs: number | null
  error: string | null
}

type Project = {
  id: string
  name: string
  client: string
  value: number | null
  tool: string
  assignee: string
  stage: string
  notes: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
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

const stages = ['Aprovado', 'Abordagem pronta', 'Mensagem enviada', 'Reunião marcada', 'Proposta enviada', 'Fechado', 'Perdido', 'Inativo']

const stageColor: Record<string, string> = {
  'Aprovado':         '#a855f7',
  'Abordagem pronta': '#3b82f6',
  'Mensagem enviada': '#8b5cf6',
  'Reunião marcada':  '#f59e0b',
  'Proposta enviada': '#10b981',
  'Fechado':          '#22c55e',
  'Perdido':          '#ef4444',
  'Inativo':          '#6b7280',
}

function App() {
  const introPreview = window.location.search.includes('introPreview=1')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null)
  const [prospectOpen, setProspectOpen] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [status, setStatus] = useState('Pronto.')
  const [isBusy, setIsBusy] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [view, setView] = useState<'kanban' | 'approval' | 'whatsapp' | 'admin'>('kanban')
  const [userQrCode, setUserQrCode] = useState<string>('')
  const [approvalCount, setApprovalCount] = useState(0)
  const [meetingModal, setMeetingModal] = useState<{ assignment: Assignment } | null>(null)

  const refreshCore = useCallback(async () => {
    const globalScope = user?.isAdmin ? '?scope=global' : ''
    const [crmData, followUpData] = await Promise.all([
      api<{ assignments: Assignment[] }>(`/api/crm${globalScope}`),
      api<{ followUps: FollowUp[] }>(`/api/follow-ups${globalScope}`),
    ])
    setAssignments(crmData.assignments)
    setFollowUps(followUpData.followUps)
    setLastRefresh(new Date())
  }, [user?.isAdmin])

  const checkSession = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser | null }>('/api/auth/session')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setIsCheckingSession(false)
    }
  }, [])

  useEffect(() => {
    // Initial session sync from the server-side auth cookie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession()
  }, [checkSession])

  useEffect(() => {
    if (!user) return
    // Initial data load + WhatsApp status after login.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCore()
    api<{ whatsapp: WhatsAppStatus }>('/api/users/me/whatsapp').then((d) => setWhatsapp(d.whatsapp)).catch(() => null)
    const interval = setInterval(refreshCore, 30_000)
    return () => clearInterval(interval)
  }, [refreshCore, user])

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  async function refreshWhatsapp() {
    const d = await api<{ whatsapp: WhatsAppStatus }>('/api/users/me/whatsapp')
    setWhatsapp(d.whatsapp)
    if (d.whatsapp?.connectionStatus === 'open') setUserQrCode('')
  }

  useEffect(() => {
    if (!userQrCode) return
    const poll = setInterval(async () => {
      try {
        const d = await api<{ whatsapp: WhatsAppStatus }>('/api/users/me/whatsapp')
        setWhatsapp(d.whatsapp)
        if (d.whatsapp?.connectionStatus === 'open') {
          setUserQrCode('')
          setStatus('WhatsApp conectado com sucesso!')
        }
      } catch {
        // ignore poll errors
      }
    }, 5000)
    return () => clearInterval(poll)
  }, [userQrCode])

  async function connectWhatsApp() {
    try {
      const d = await api<{ whatsapp: WhatsAppStatus; qrcode: { base64?: string | null } }>('/api/users/me/whatsapp/connect', { method: 'POST' })
      setWhatsapp(d.whatsapp)
      const b64 = d.qrcode?.base64
      if (b64) {
        setUserQrCode(b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`)
      } else {
        setUserQrCode('')
        if (d.whatsapp?.connectionStatus === 'open') {
          setStatus('WhatsApp já está conectado.')
        } else {
          setStatus('QR Code não disponível. Tente novamente.')
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erro ao conectar WhatsApp.')
    }
  }

  async function updateStage(assignment: Assignment, stage: string, extra?: { nextAction?: string; note?: string }) {
    if (stage === 'Reunião marcada' && !extra) {
      setMeetingModal({ assignment })
      return
    }
    await runAction('Atualizando etapa...', async () => {
      const body: Record<string, string> = { stage, ...(extra || {}) }
      const data = await api<{ assignment: Assignment }>(`/api/assignments/${assignment.id}/stage`, { method: 'POST', body: JSON.stringify(body) })
      setSelectedAssignment(data.assignment)
      await refreshCore()
    })
  }

  async function deleteAssignment(assignment: Assignment) {
    await runAction('Removendo lead...', async () => {
      await api(`/api/assignments/${assignment.id}`, { method: 'DELETE' })
      if (selectedAssignment?.id === assignment.id) setSelectedAssignment(null)
      await refreshCore()
    })
  }

  async function releaseAssignment(assignment: Assignment) {
    await runAction('Liberando lead para a Base Geral...', async () => {
      await api(`/api/assignments/${assignment.id}/release`, { method: 'POST', body: JSON.stringify({ reason: 'Liberado manualmente para reativação.' }) })
      setSelectedAssignment(null)
      await refreshCore()
    })
  }

  async function completeFollowUp(followUp: FollowUp) {
    await runAction('Concluindo follow-up...', async () => {
      await api(`/api/follow-ups/${followUp.id}/complete`, { method: 'POST' })
      await refreshCore()
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selectedAssignment != null) { setSelectedAssignment(null); return }
      if (prospectOpen) { setProspectOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedAssignment, prospectOpen])

  if (isCheckingSession) return <div className="boot-screen">Carregando Codexy Prospect...</div>
  if (introPreview) return <LogoValidationScreen />
  if (!user) return <LoginScreen onLogin={setUser} />

  const crmOpen = selectedAssignment != null

  function openCrm(a: Assignment) { setSelectedAssignment(a) }
  function closeCrm() { setSelectedAssignment(null) }
  function closeProspect() { setProspectOpen(false) }

  function refreshTimestamp() {
    if (!lastRefresh) return null
    const sec = Math.floor((Date.now() - lastRefresh.getTime()) / 1000)
    if (sec < 10) return 'agora'
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}min`
  }

  return (
    <main className="page-shell">
      <header className="page-topbar">
        <Brand />
        <nav className="page-nav">
          <button type="button" className={`page-nav-btn${view === 'kanban' ? ' active' : ''}`} onClick={() => setView('kanban')}>Pipeline</button>
          <button type="button" className={`page-nav-btn${view === 'approval' ? ' active' : ''}`} onClick={() => setView('approval')}>
            Aprovação{approvalCount > 0 ? <span className="page-nav-badge">{approvalCount}</span> : null}
          </button>
          <button type="button" className={`page-nav-btn${view === 'whatsapp' ? ' active' : ''}`} onClick={() => setView('whatsapp')}>
            <span className={`ws-dot ${whatsapp?.connectionStatus || 'unknown'}`} style={{ marginRight: 4 }} />
            WhatsApp
          </button>
          {user.isAdmin && (
            <button type="button" className={`page-nav-btn${view === 'admin' ? ' active' : ''}`} onClick={() => setView('admin')}>Admin</button>
          )}
        </nav>
        <div className="page-center">
          <span className="page-status">{status}</span>
          {lastRefresh && <span className="page-refresh-badge" title={lastRefresh.toLocaleTimeString()}>↻ {refreshTimestamp()}</span>}
        </div>
        <div className="page-user">
          <span>{user.name}</span>
          <button type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <div className="page-body">
        {view === 'kanban' && <KanbanView assignments={assignments} followUps={followUps} onOpenCrm={openCrm} onStage={updateStage} onRefresh={refreshCore} onRunAction={runAction} user={user} onDelete={deleteAssignment} />}
        {view === 'approval' && <ApprovalView user={user} onRefreshCore={refreshCore} onCountChange={setApprovalCount} />}
        {view === 'whatsapp' && <WhatsAppView whatsapp={whatsapp} qrCode={userQrCode} onConnect={connectWhatsApp} onRefresh={refreshWhatsapp} />}
        {view === 'admin' && <AdminView dashboard={null} runs={[]} />}
      </div>

      {crmOpen && (
        <>
          <div className="crm-overlay-backdrop" role="button" aria-label="Fechar" tabIndex={0} onClick={closeCrm} onKeyDown={(e) => e.key === 'Enter' && closeCrm()} />
          <div className="crm-overlay-drawer">
            <button type="button" className="crm-overlay-close" onClick={closeCrm}>✕ Fechar</button>
            <CrmView
              assignments={assignments}
              followUps={followUps}
              whatsapp={whatsapp}
              selected={selectedAssignment}
              onSelect={(a) => setSelectedAssignment(a)}
              onStage={updateStage}
              onRelease={async (a) => { await releaseAssignment(a); closeCrm() }}
              onCompleteFollowUp={completeFollowUp}
              onRefresh={refreshCore}
            />
          </div>
        </>
      )}

      {prospectOpen && (
        <>
          <div className="crm-overlay-backdrop" role="button" aria-label="Fechar" tabIndex={0} onClick={closeProspect} onKeyDown={(e) => e.key === 'Enter' && closeProspect()} />
          <div className="crm-overlay-drawer prospect-drawer">
            <button type="button" className="crm-overlay-close" onClick={closeProspect}>✕ Fechar</button>
            <ProspectView
              isBusy={isBusy}
              onRun={async () => { await refreshCore(); closeProspect() }}
              setStatus={setStatus}
              setBusy={setIsBusy}
            />
          </div>
        </>
      )}

      {meetingModal && (
        <MeetingContextModal
          assignment={meetingModal.assignment}
          onConfirm={async (extra) => {
            setMeetingModal(null)
            await updateStage(meetingModal.assignment, 'Reunião marcada', extra)
          }}
          onCancel={() => setMeetingModal(null)}
        />
      )}

      <button type="button" className="fab-prospect" onClick={() => setProspectOpen(true)} title="Criar nova prospecção">
        <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span>Prospectar</span>
      </button>
    </main>
  )
}

function MeetingContextModal({ assignment, onConfirm, onCancel }: {
  assignment: Assignment
  onConfirm: (extra: { nextAction: string; note: string }) => Promise<void>
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [response, setResponse] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [format, setFormat] = useState('')
  const [busy, setBusy] = useState(false)

  const formats = ['Ligação', 'Videochamada', 'Presencial', 'WhatsApp']

  async function confirm() {
    if (!response.trim() || !date || !time || !format) return
    setBusy(true)
    const dateLabel = new Date(`${date}T${time}`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    const nextAction = `Reunião: ${dateLabel} — ${format}`
    const note = `Contexto da conversa: ${response.trim()}`
    await onConfirm({ nextAction, note })
    setBusy(false)
  }

  return (
    <div className="meeting-modal-overlay" onClick={onCancel}>
      <div className="meeting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="meeting-modal-header">
          <span className="meeting-modal-lead">{assignment.lead.name}</span>
          <span className="meeting-modal-step">Passo {step} de 3</span>
        </div>

        <div className="meeting-modal-progress">
          {[1,2,3].map((s) => <div key={s} className={`meeting-modal-dot${step >= s ? ' done' : ''}`} />)}
        </div>

        {step === 1 && (
          <div className="meeting-modal-body">
            <h3>Como eles responderam?</h3>
            <p>Descreva o contexto da conversa que levou à reunião.</p>
            <textarea
              className="meeting-modal-textarea"
              placeholder="Ex: Demonstraram interesse no produto, pediram mais detalhes sobre o preço..."
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              autoFocus
              rows={4}
            />
            <div className="meeting-modal-actions">
              <button type="button" className="meeting-btn-ghost" onClick={onCancel}>Cancelar</button>
              <button type="button" className="meeting-btn-primary" onClick={() => setStep(2)} disabled={!response.trim()}>Próximo →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="meeting-modal-body">
            <h3>Quando é a reunião?</h3>
            <p>Data e horário agendados.</p>
            <div className="meeting-modal-datetime">
              <input type="date" className="meeting-modal-input" value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" className="meeting-modal-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="meeting-modal-actions">
              <button type="button" className="meeting-btn-ghost" onClick={() => setStep(1)}>← Voltar</button>
              <button type="button" className="meeting-btn-primary" onClick={() => setStep(3)} disabled={!date || !time}>Próximo →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="meeting-modal-body">
            <h3>Formato da reunião</h3>
            <p>Como vai acontecer o encontro?</p>
            <div className="meeting-modal-formats">
              {formats.map((f) => (
                <button key={f} type="button" className={`meeting-format-btn${format === f ? ' selected' : ''}`} onClick={() => setFormat(f)}>{f}</button>
              ))}
            </div>
            <div className="meeting-modal-actions">
              <button type="button" className="meeting-btn-ghost" onClick={() => setStep(2)}>← Voltar</button>
              <button type="button" className="meeting-btn-confirm" onClick={confirm} disabled={!format || busy}>
                {busy ? 'Salvando…' : '✓ Confirmar reunião'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
  const [step, setStep] = useState<'product' | 'audience' | 'scale' | 'preview' | 'done'>('product')
  const [product, setProduct] = useState('')
  const [audience, setAudience] = useState('')
  const [scale, setScale] = useState<'moderada' | 'grande' | 'ampla' | ''>('')
  const [productInput, setProductInput] = useState('')
  const [audienceInput, setAudienceInput] = useState('')
  const [preview, setPreview] = useState<StrategyPreview | null>(null)
  const [run, setRun] = useState<SearchRun | null>(null)
  const [error, setError] = useState('')

  const scaleOptions = [
    { value: 'moderada', label: '~40 leads', sub: 'Moderada' },
    { value: 'grande',   label: '~80 leads', sub: 'Grande' },
    { value: 'ampla',    label: '~120 leads', sub: 'Ampla' },
  ]

  function confirmProduct() {
    const v = productInput.trim()
    if (!v) return
    setProduct(v)
    setStep('audience')
  }

  function confirmAudience() {
    const v = audienceInput.trim()
    if (!v) return
    setAudience(v)
    setStep('scale')
  }

  async function confirmScale(s: 'moderada' | 'grande' | 'ampla') {
    setScale(s)
    setStep('preview')
    setError('')
    setBusy(true)
    setStatus('Montando plano de prospecção...')
    try {
      const prompt = `Quero vender ${product} para ${audience}`
      const data = await api<{ preview: StrategyPreview }>('/api/prospect/preview', {
        method: 'POST',
        body: JSON.stringify({ prompt, product, scale: s }),
      })
      setPreview(data.preview)
      setStatus('Plano pronto.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar plano.')
      setStep('scale')
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    if (!preview) return
    setBusy(true)
    setError('')
    setStatus('Buscando leads...')
    try {
      await api<{ run: SearchRun; leads: Lead[] }>('/api/prospect/runs', {
        method: 'POST',
        body: JSON.stringify({ preview }),
      })
      setRun({ status: 'done' } as unknown as SearchRun)
      setStep('done')
      await onRun()
      setStatus('Busca concluída. Leads na fila de aprovação.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar busca.')
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    setStep('product')
    setProduct(''); setAudience(''); setScale(''); setProductInput(''); setAudienceInput('')
    setPreview(null); setRun(null); setError('')
  }

  return (
    <div className="wizard">
      <div className="wizard-header">
        <span className="wizard-title">Nova campanha</span>
        <div className="wizard-steps">
          {['product', 'audience', 'scale', 'preview', 'done'].map((s, i) => (
            <div key={s} className={`wizard-step-dot${step === s ? ' active' : ''} ${['product','audience','scale','preview','done'].indexOf(step) > i ? 'done' : ''}`} />
          ))}
        </div>
      </div>

      <div className="wizard-body">

        {/* ── P1: Produto ── */}
        <div className={`wz-block${step === 'product' ? ' visible' : ' past'}`}>
          <div className="wz-q">O que você vende?</div>
          {step === 'product' ? (
            <div className="wz-answer-row">
              <input
                className="wz-input"
                placeholder="Ex: Landing page, Chatbot, CRM..."
                value={productInput}
                onChange={(e) => setProductInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmProduct()}
                autoFocus
              />
              <button className="wz-btn" type="button" onClick={confirmProduct} disabled={!productInput.trim()}>→</button>
            </div>
          ) : (
            <div className="wz-answer-given">{product}</div>
          )}
        </div>

        {/* ── P2: Público ── */}
        {(step === 'audience' || ['scale','preview','done'].includes(step)) && (
          <div className={`wz-block${step === 'audience' ? ' visible' : ' past'}`}>
            <div className="wz-q">Para quem e onde?</div>
            {step === 'audience' ? (
              <div className="wz-answer-row">
                <input
                  className="wz-input"
                  placeholder="Ex: clínicas odontológicas em BH sem site"
                  value={audienceInput}
                  onChange={(e) => setAudienceInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAudience()}
                  autoFocus
                />
                <button className="wz-btn" type="button" onClick={confirmAudience} disabled={!audienceInput.trim()}>→</button>
              </div>
            ) : (
              <div className="wz-answer-given">{audience}</div>
            )}
          </div>
        )}

        {/* ── P3: Volume ── */}
        {(step === 'scale' || ['preview','done'].includes(step)) && (
          <div className={`wz-block${step === 'scale' ? ' visible' : ' past'}`}>
            <div className="wz-q">Quantos leads?</div>
            {step === 'scale' ? (
              <div className="wz-chips">
                {scaleOptions.map((o) => (
                  <button key={o.value} type="button" className="wz-chip" onClick={() => confirmScale(o.value as 'moderada' | 'grande' | 'ampla')} disabled={isBusy}>
                    <span className="wz-chip-num">{o.label}</span>
                    <span className="wz-chip-sub">{o.sub}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="wz-answer-given">{scaleOptions.find((o) => o.value === scale)?.label}</div>
            )}
          </div>
        )}

        {/* ── Preview carregando ── */}
        {step === 'preview' && isBusy && (
          <div className="wz-loading">
            <div className="wz-spinner" />
            <span>Montando plano com IA…</span>
          </div>
        )}

        {/* ── Preview pronto ── */}
        {step === 'preview' && !isBusy && preview && (
          <div className="wz-block visible">
            <div className="wz-q">Plano gerado</div>
            <div className="wz-plan">
              <div className="wz-plan-row"><span>Produto</span><b>{preview.strategy.product}</b></div>
              <div className="wz-plan-row"><span>Público</span><b>{preview.strategy.audience}</b></div>
              <div className="wz-plan-row"><span>Região</span><b>{preview.strategy.region}</b></div>
              <div className="wz-plan-row"><span>Leads estimados</span><b>{preview.strategy.estimatedUsefulRange}</b></div>
              <div className="wz-plan-row"><span>Chamadas API</span><b>{preview.strategy.estimatedApiCalls}</b></div>
            </div>
            <p className="wz-rec">{preview.strategy.recommendation}</p>
            <div className="wz-plan-keywords">
              {preview.strategy.keywords.slice(0, 8).map((k) => <span key={k} className="wz-kw">{k}</span>)}
            </div>
            <div className="wz-actions">
              <button className="wz-run-btn" type="button" onClick={runSearch} disabled={isBusy}>Buscar leads agora</button>
              <button className="wz-ghost-btn" type="button" onClick={restart}>Recomeçar</button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="wz-block visible">
            <div className="wz-done">
              <div className="wz-done-icon">✓</div>
              <div className="wz-done-text">Leads encontrados e na fila de aprovação.</div>
              <button className="wz-ghost-btn" type="button" onClick={restart}>Nova campanha</button>
            </div>
          </div>
        )}

        {error && <div className="wz-error">{error}</div>}
      </div>
    </div>
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

function KanbanView({ assignments, followUps, onOpenCrm, onStage, onRefresh, onRunAction, user, onDelete }: {
  assignments: Assignment[]
  followUps: FollowUp[]
  onOpenCrm: (a: Assignment) => void
  onStage: (a: Assignment, stage: string) => Promise<void>
  onRefresh: () => Promise<void>
  onRunAction: (msg: string, action: () => Promise<void>) => Promise<void>
  user: SessionUser
  onDelete: (a: Assignment) => Promise<void>
}) {
  const CARD_LIMIT = 50
  const [search, setSearch] = useState('')
  const [temperature, setTemperature] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [advancing, setAdvancing] = useState<Set<string>>(new Set())
  const [colLimits, setColLimits] = useState<Record<string, number>>(
    () => Object.fromEntries(stages.map((s) => [s, CARD_LIMIT]))
  )
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

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

  const pipelineStages = stages.filter((s) => !['Perdido', 'Inativo'].includes(s))

  function nextStage(stage: string): string | null {
    const idx = pipelineStages.indexOf(stage)
    return idx >= 0 && idx < pipelineStages.length - 1 ? pipelineStages[idx + 1] : null
  }

  async function advance(e: React.MouseEvent, a: Assignment) {
    e.stopPropagation()
    const next = nextStage(a.stage)
    if (!next || advancing.has(a.id)) return
    setAdvancing((prev) => new Set(prev).add(a.id))
    try { await onStage(a, next) }
    finally { setAdvancing((prev) => { const s = new Set(prev); s.delete(a.id); return s }) }
  }

  function exportColumn(stage: string, items: Assignment[]) {
    const rows = items.map((a) => [
      a.lead.name, a.lead.category || '', a.lead.city || '', a.lead.phone || '',
      a.lead.website || '', a.lead.email || '', a.temperature,
      a.nextAction || '', a.approach || '', a.ownerName || '',
      a.lead.score != null ? String(a.lead.score) : '',
    ])
    const csv = toCsv([
      ['nome', 'nicho', 'cidade', 'whatsapp', 'site', 'email', 'temperatura', 'proximo_passo', 'abordagem', 'responsavel', 'score'],
      ...rows,
    ])
    downloadText(`pipeline-${stage.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.csv`, csv, 'text/csv')
  }

  const totalActive = filtered.filter((a) => !['Perdido', 'Inativo'].includes(a.stage)).length

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
    setBulkStage('')
  }

  function toggleCard(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  async function applyBulk() {
    if (!bulkStage || selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      await onRunAction(`Movendo ${selectedIds.size} lead(s) para ${bulkStage}...`, async () => {
        await api('/api/assignments/bulk-stage', {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(selectedIds), stage: bulkStage }),
        })
        setSelectedIds(new Set())
        setBulkStage('')
        await onRefresh()
      })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="kanban-view">
      {/* ── Top bar com busca e stats ── */}
      <div className="kb-toolbar">
        <div className="kb-search-wrap">
          <svg className="kb-search-icon" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            className="kb-search"
            type="search"
            placeholder="Buscar lead, nicho ou cidade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="kb-filters">
          <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="kb-select">
            <option value="">Temp.</option>
            <option value="quente">🔥 Quente</option>
            <option value="morno">🌡 Morno</option>
            <option value="frio">❄ Frio</option>
          </select>
          <button type="button" className={`kb-pill${onlyOverdue ? ' on' : ''}`} onClick={() => setOnlyOverdue((v) => !v)}>
            ⏰ Atrasados
          </button>
          <button type="button" className={`kb-pill${selectMode ? ' on' : ''}`} onClick={toggleSelectMode}>
            ☑ Selecionar
          </button>
        </div>
        <div className="kb-stat">
          <span className="kb-stat-num">{totalActive}</span>
          <span className="kb-stat-label">leads ativos</span>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selectMode && (
        <div className="kb-bulk-bar">
          <span className="kb-bulk-count">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
          <select className="kb-select" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
            <option value="">Mover para etapa…</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="kb-bulk-apply" onClick={applyBulk} disabled={!bulkStage || selectedIds.size === 0 || bulkBusy}>
            {bulkBusy ? 'Movendo…' : `Mover ${selectedIds.size > 0 ? selectedIds.size : ''}`}
          </button>
          <button type="button" className="kb-pill" onClick={() => setSelectedIds(new Set())}>Limpar</button>
        </div>
      )}

      {/* ── Board ── */}
      <div className="kanban-board">
        {grouped.map((group) => {
          const isLost = ['Perdido', 'Inativo'].includes(group.stage)
          const color = stageColor[group.stage] ?? '#4a6080'
          return (
            <div className={`kb-col${isLost ? ' kb-col-lost' : ''}`} key={group.stage}>
              {/* cabeçalho */}
              <div className="kb-col-head" style={{ '--col-color': color } as React.CSSProperties}>
                <div className="kb-col-dot" style={{ background: color }} />
                <span className="kb-col-title">{group.stage}</span>
                <span className="kb-col-badge">{group.items.length}</span>
                {selectMode && group.items.length > 0 && (
                  <button
                    type="button"
                    className="kb-csv-btn"
                    title="Selecionar todos nesta coluna"
                    onClick={() => selectAll(group.items.map((a) => a.id))}
                  >☑</button>
                )}
                {!selectMode && group.items.length > 0 && (
                  <button
                    type="button"
                    className="kb-csv-btn"
                    title="Exportar CSV"
                    onClick={(e) => { e.stopPropagation(); exportColumn(group.stage, group.items) }}
                  >↓</button>
                )}
              </div>

              {/* cards */}
              <div className="kb-col-body">
                {group.items.length === 0 && (
                  <div className="kb-col-empty">vazio</div>
                )}
                {group.items.slice(0, colLimits[group.stage] ?? CARD_LIMIT).map((a) => {
                  const fuCount = followUps.filter((fu) => fu.assignmentId === a.id && fu.status === 'pending').length
                  const hasOverdue = overdueIds.has(a.id)
                  const next = nextStage(a.stage)
                  const isAdv = advancing.has(a.id)
                  const isSelected = selectedIds.has(a.id)
                  return (
                    <div
                      key={a.id}
                      className={`kb2-card${hasOverdue ? ' overdue' : ''}${isLost ? ' lost' : ''}${isSelected ? ' kb2-card-selected' : ''}`}
                      onClick={() => selectMode ? toggleCard(a.id) : onOpenCrm(a)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && (selectMode ? toggleCard(a.id) : onOpenCrm(a))}
                      style={{ '--stage-color': color } as React.CSSProperties}
                    >
                      {selectMode && (
                        <div className="kb2-card-check">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleCard(a.id)} onClick={(e) => e.stopPropagation()} />
                        </div>
                      )}
                      <div className="kb2-card-accent" />
                      <div className="kb2-card-body">
                        <div className="kb2-card-name">{a.lead.name}</div>
                        {a.lead.category && <div className="kb2-card-cat">{a.lead.category}</div>}
                        <div className="kb2-card-info">
                          <span>{a.lead.city}</span>
                          {a.lead.phone && <span className="kb2-wa">WA</span>}
                        </div>
                        {user.isAdmin && a.ownerName && <div className="kb2-card-owner">👤 {a.ownerName}</div>}
                        {!isLost && a.nextAction && <div className="kb2-card-action">{a.nextAction}</div>}
                        {!isLost && (
                          <div className="kb2-card-foot">
                            <span className={`kb2-temp kb2-temp-${a.temperature}`}>{a.temperature}</span>
                            {fuCount > 0 && <span className="kb2-fu">{fuCount} fu{hasOverdue ? ' ⚠' : ''}</span>}
                            {a.lead.score != null && <span className="kb2-score">{a.lead.score}</span>}
                            {!selectMode && next && (
                              <button
                                type="button"
                                className={`kb2-advance${isAdv ? ' busy' : ''}`}
                                onClick={(e) => advance(e, a)}
                                title={`→ ${next}`}
                              >
                                {isAdv ? '…' : '→'}
                              </button>
                            )}
                            {!selectMode && (
                              <button
                                type="button"
                                className="kb2-delete"
                                onClick={(e) => { e.stopPropagation(); onDelete(a) }}
                                title="Remover do pipeline"
                              >🗑</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {group.items.length > (colLimits[group.stage] ?? CARD_LIMIT) && (
                  <button
                    type="button"
                    className="kb-col-more"
                    onClick={() => setColLimits((prev) => ({ ...prev, [group.stage]: (prev[group.stage] ?? CARD_LIMIT) + CARD_LIMIT }))}
                  >
                    ver mais {group.items.length - (colLimits[group.stage] ?? CARD_LIMIT)}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ApprovalView({ user, onRefreshCore, onCountChange }: {
  user: SessionUser
  onRefreshCore: () => Promise<void>
  onCountChange: (n: number) => void
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [filterOwner, setFilterOwner] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState('')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  async function fetchLeads() {
    try {
      const data = await api<{ leads: Lead[] }>('/api/leads/approval')
      setLeads(data.leads)
      onCountChange(data.leads.length)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 30_000)
    return () => clearInterval(interval)
  }, [])

  const ownerNames = useMemo(() => {
    const names = new Set<string>()
    leads.forEach((l) => (l.foundByNames || []).forEach((n) => names.add(n)))
    return Array.from(names).sort()
  }, [leads])

  const filtered = useMemo(() => {
    if (!filterOwner) return leads
    return leads.filter((l) => (l.foundByNames || []).includes(filterOwner))
  }, [leads, filterOwner])

  async function approve(lead: Lead) {
    setBusy(true)
    setStatusMsg('')
    try {
      await api(`/api/leads/${lead.id}/approve`, { method: 'POST' })
      await fetchLeads()
      await onRefreshCore()
      if (selected?.id === lead.id) setSelected(null)
      setStatusMsg('Lead aprovado e adicionado ao CRM.')
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Erro ao aprovar.')
    } finally {
      setBusy(false)
    }
  }

  async function discard(lead: Lead) {
    setBusy(true)
    setStatusMsg('')
    try {
      await api(`/api/leads/${lead.id}/discard`, { method: 'POST' })
      await fetchLeads()
      if (selected?.id === lead.id) setSelected(null)
      setStatusMsg('Lead descartado.')
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Erro ao descartar.')
    } finally {
      setBusy(false)
    }
  }

  async function bulkApprove() {
    setBusy(true)
    setStatusMsg('')
    try {
      const data = await api<{ approved: number; failed: number }>('/api/leads/bulk-approve', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(checkedIds) }),
      })
      setCheckedIds(new Set())
      await fetchLeads()
      await onRefreshCore()
      if (selected && checkedIds.has(selected.id)) setSelected(null)
      setStatusMsg(`${data.approved} lead(s) aprovado(s).${data.failed ? ` ${data.failed} falha(s).` : ''}`)
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Erro ao aprovar em massa.')
    } finally {
      setBusy(false)
    }
  }

  async function bulkDiscard() {
    setBusy(true)
    setStatusMsg('')
    try {
      const data = await api<{ discarded: number }>('/api/leads/bulk-discard', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(checkedIds) }),
      })
      setCheckedIds(new Set())
      await fetchLeads()
      if (selected && checkedIds.has(selected.id)) setSelected(null)
      setStatusMsg(`${data.discarded} lead(s) descartado(s).`)
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Erro ao descartar em massa.')
    } finally {
      setBusy(false)
    }
  }

  function toggleCheck(id: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation()
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="approval-view">
      <div className="approval-sidebar">
        <div className="approval-toolbar">
          {filtered.length > 0 && (
            <label className="approval-select-all-label">
              <input
                type="checkbox"
                checked={checkedIds.size > 0 && checkedIds.size === filtered.length}
                ref={(el) => { if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < filtered.length }}
                onChange={() => setCheckedIds(checkedIds.size === filtered.length ? new Set() : new Set(filtered.map((l) => l.id)))}
              />
              <span>{checkedIds.size === filtered.length && filtered.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
            </label>
          )}
          <span className="approval-count">{filtered.length} lead{filtered.length !== 1 ? 's' : ''} aguardando</span>
          {user.isAdmin && ownerNames.length > 0 && (
            <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="kb-select">
              <option value="">Todos responsáveis</option>
              {ownerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
        {checkedIds.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">{checkedIds.size} selecionado{checkedIds.size !== 1 ? 's' : ''}</span>
            <div className="bulk-actions">
              <button type="button" className="bulk-btn" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }} disabled={busy} onClick={bulkApprove}>Aprovar</button>
              <button type="button" className="bulk-btn" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} disabled={busy} onClick={bulkDiscard}>Descartar</button>
            </div>
          </div>
        )}
        {statusMsg && <div className="approval-status-msg">{statusMsg}</div>}
        <div className="approval-list">
          {loading && <div className="approval-empty">Carregando…</div>}
          {!loading && filtered.length === 0 && <div className="approval-empty">Nenhum lead aguardando aprovação.</div>}
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className={`approval-card${selected?.id === lead.id ? ' selected' : ''}${checkedIds.has(lead.id) ? ' checked' : ''}`}
              onClick={() => setSelected(lead)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelected(lead)}
            >
              <input
                type="checkbox"
                className="approval-check"
                checked={checkedIds.has(lead.id)}
                onClick={(e) => toggleCheck(lead.id, e)}
                onChange={() => {}}
              />
              <div className="approval-card-main">
                <div className="approval-card-name">{lead.name}</div>
                <div className="approval-card-meta">{[lead.category, lead.city].filter(Boolean).join(' · ')}</div>
                {user.isAdmin && lead.foundByNames && lead.foundByNames.length > 0 && (
                  <div className="approval-card-owner">👤 {lead.foundByNames[0]}</div>
                )}
              </div>
              <div className="approval-card-right">
                {lead.score != null && <span className="approval-score">{lead.score}</span>}
                <div className="approval-card-btns">
                  <button type="button" className="approval-btn-approve" disabled={busy} onClick={(e) => { e.stopPropagation(); approve(lead) }} title="Aprovar">✓</button>
                  <button type="button" className="approval-btn-discard" disabled={busy} onClick={(e) => { e.stopPropagation(); discard(lead) }} title="Descartar">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="approval-detail">
        {selected ? (
          <LeadDetail
            lead={selected}
            onApprove={() => approve(selected)}
            onDiscard={() => discard(selected)}
            primaryLabel="Aprovar para CRM"
            onLeadUpdate={(updated) => setSelected(updated)}
          />
        ) : (
          <div className="approval-detail-empty">Selecione um lead para ver detalhes.</div>
        )}
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
  onStage: (a: Assignment, stage: string) => Promise<void>
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
                  {isSending ? <><span className="send-spinner" />Enviando…</> : 'Enviar via WhatsApp'}
                </button>
              </div>
              {isSending && <p className="send-delay-hint">Aguardando delay de segurança para proteger sua conta…</p>}
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

function WhatsAppView({ whatsapp, qrCode, onConnect, onRefresh }: { whatsapp: WhatsAppStatus | null; qrCode: string; onConnect: () => Promise<void>; onRefresh: () => void }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const isConnected = whatsapp?.connectionStatus === 'open'

  async function handleConnect() {
    setIsConnecting(true)
    try {
      await onConnect()
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <section className="panel">
      <PanelTitle title="WhatsApp comercial" description="Cada vendedor conecta a própria instância para enviar abordagens." />
      <div className="whatsapp-card">
        <div><span>Status</span><strong>{whatsapp?.status || 'Não conectado'}</strong>{whatsapp?.profileName && <small>{whatsapp.profileName}</small>}</div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={onRefresh}>Atualizar</button>
          {!isConnected && (
            <button className="primary-button" type="button" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? <><span className="send-spinner" /> Aguardando QR…</> : 'Conectar'}
            </button>
          )}
        </div>
      </div>
      {qrCode && (
        <div className="qr-box">
          <div>
            <strong>Escaneie o QR Code</strong>
            <span>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</span>
          </div>
          <img src={qrCode} alt="QR Code do WhatsApp" />
        </div>
      )}
    </section>
  )
}

const PROJECT_STAGES = ['Negociação', 'Em andamento', 'Revisão', 'Entregue', 'Cancelado']

const PROJECT_STAGE_COLORS: Record<string, string> = {
  'Negociação': '#f59e0b',
  'Em andamento': '#4a8fff',
  'Revisão': '#a78bfa',
  'Entregue': '#22c55e',
  'Cancelado': '#6b7280',
}

function ProjectsBoardView() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; project?: Project } | null>(null)
  const [form, setForm] = useState({ name: '', client: '', value: '', tool: '', assignee: '', stage: 'Negociação', notes: '', dueDate: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function fetchProjects() {
    try {
      const data = await api<{ projects: Project[] }>('/api/admin/projects')
      setProjects(Array.isArray(data.projects) ? data.projects : [])
    } catch {
      // API missing or returned non-JSON — stay with empty list
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  function openCreate() {
    setForm({ name: '', client: '', value: '', tool: '', assignee: '', stage: 'Negociação', notes: '', dueDate: '' })
    setErr('')
    setModal({ mode: 'create' })
  }

  function openEdit(p: Project) {
    setForm({
      name: p.name,
      client: p.client,
      value: p.value != null ? String(p.value) : '',
      tool: p.tool,
      assignee: p.assignee,
      stage: p.stage,
      notes: p.notes,
      dueDate: p.dueDate || '',
    })
    setErr('')
    setModal({ mode: 'edit', project: p })
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = { ...form, value: form.value !== '' ? Number(form.value) : null }
      if (modal?.mode === 'edit' && modal.project) {
        const data = await api<{ project: Project }>(`/api/admin/projects/${modal.project.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setProjects((prev) => prev.map((p) => p.id === data.project.id ? data.project : p))
      } else {
        const data = await api<{ project: Project }>('/api/admin/projects', { method: 'POST', body: JSON.stringify(body) })
        setProjects((prev) => [...prev, data.project])
      }
      setModal(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function moveStage(project: Project, stage: string) {
    try {
      const data = await api<{ project: Project }>(`/api/admin/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ stage }) })
      setProjects((prev) => prev.map((p) => p.id === data.project.id ? data.project : p))
    } catch { /* ignore */ }
  }

  async function deleteProject(p: Project) {
    if (!confirm(`Remover projeto "${p.name}"?`)) return
    try {
      await api(`/api/admin/projects/${p.id}`, { method: 'DELETE' })
      setProjects((prev) => prev.filter((x) => x.id !== p.id))
    } catch { /* ignore */ }
  }

  const grouped = PROJECT_STAGES.map((stage) => ({ stage, items: projects.filter((p) => p.stage === stage) }))

  return (
    <div className="proj-board-wrap">
      <div className="proj-board-header">
        <span className="proj-board-title">{projects.length} projeto{projects.length !== 1 ? 's' : ''}</span>
        <button type="button" className="btn-primary small" onClick={openCreate}>+ Novo projeto</button>
      </div>
      {loading && <div className="proj-loading">Carregando…</div>}
      {!loading && (
        <div className="proj-board">
          {grouped.map(({ stage, items }) => (
            <div key={stage} className="proj-col">
              <div className="proj-col-header" style={{ borderColor: PROJECT_STAGE_COLORS[stage] }}>
                <span className="proj-col-title" style={{ color: PROJECT_STAGE_COLORS[stage] }}>{stage}</span>
                <span className="proj-col-count">{items.length}</span>
              </div>
              <div className="proj-col-cards">
                {items.map((p) => (
                  <div key={p.id} className="proj-card" onClick={() => openEdit(p)}>
                    <div className="proj-card-name">{p.name}</div>
                    {p.client && <div className="proj-card-client">👤 {p.client}</div>}
                    <div className="proj-card-meta">
                      {p.value != null && (
                        <span className="proj-card-value">R$ {p.value.toLocaleString('pt-BR')}</span>
                      )}
                      {p.tool && <span className="proj-card-tool">{p.tool}</span>}
                    </div>
                    {p.assignee && <div className="proj-card-assignee">{p.assignee}</div>}
                    {p.dueDate && (
                      <div className={`proj-card-due${new Date(p.dueDate) < new Date() && stage !== 'Entregue' && stage !== 'Cancelado' ? ' overdue' : ''}`}>
                        📅 {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                    <div className="proj-card-actions" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={p.stage}
                        className="proj-stage-select"
                        onChange={(e) => moveStage(p, e.target.value)}
                        title="Mover para etapa"
                      >
                        {PROJECT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" className="proj-delete-btn" onClick={() => deleteProject(p)} title="Remover">✕</button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="proj-col-empty">—</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="proj-modal-backdrop" onClick={() => setModal(null)}>
          <div className="proj-modal" onClick={(e) => e.stopPropagation()}>
            <div className="proj-modal-header">
              <span>{modal.mode === 'create' ? 'Novo projeto' : 'Editar projeto'}</span>
              <button type="button" className="proj-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <form className="proj-modal-form" onSubmit={saveProject}>
              {err && <p className="form-error">{err}</p>}
              <div className="proj-form-row">
                <label>Nome do projeto *
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Site institucional" required />
                </label>
                <label>Cliente
                  <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Ex: Empresa ABC" />
                </label>
              </div>
              <div className="proj-form-row">
                <label>Valor (R$)
                  <input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="Ex: 3500" min="0" step="0.01" />
                </label>
                <label>Ferramenta / Stack
                  <input value={form.tool} onChange={(e) => setForm((f) => ({ ...f, tool: e.target.value }))} placeholder="Ex: React, WhatsApp Bot" />
                </label>
              </div>
              <div className="proj-form-row">
                <label>Responsável
                  <input value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))} placeholder="Ex: Lucas" />
                </label>
                <label>Prazo
                  <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
                </label>
              </div>
              <label>Etapa
                <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}>
                  {PROJECT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Notas
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observações sobre o projeto…" rows={3} />
              </label>
              <div className="proj-modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminView({ dashboard, runs }: { dashboard: Dashboard | null; assignments?: Assignment[]; runs: SearchRun[] }) {
  const [adminTab, setAdminTab] = useState<'users' | 'trojan' | 'sites' | 'projects'>('users')
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
    <div className="admin-shell">
      <div className="admin-tabs">
        <button type="button" className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>Gestão</button>
        <button type="button" className={adminTab === 'projects' ? 'active' : ''} onClick={() => setAdminTab('projects')}>Projetos</button>
        <button type="button" className={adminTab === 'trojan' ? 'active' : ''} onClick={() => setAdminTab('trojan')}>Cavalo de Troia</button>
        <button type="button" className={adminTab === 'sites' ? 'active' : ''} onClick={() => setAdminTab('sites')}>Sites Quebrados</button>
      </div>

      {adminTab === 'projects' && <ProjectsBoardView />}
      {adminTab === 'trojan' && <TrojanView />}
      {adminTab === 'sites' && <SiteHealthView />}

      {adminTab === 'users' && (
    <section className="content-grid" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>

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
    </div>
  )
}

function SiteHealthView() {
  const [results, setResults] = useState<SiteCheckResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'error' | 'slow' | 'ok'>('all')
  const [cityFilter, setCityFilter] = useState('')

  async function scan() {
    setScanning(true)
    setError('')
    setResults([])
    setScanned(false)
    try {
      const body: Record<string, string> = {}
      if (cityFilter.trim()) body.city = cityFilter.trim()
      const data = await api<{ results: SiteCheckResult[]; total: number }>('/api/admin/site-health', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResults(data.results)
      setScanned(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao escanear.')
    } finally {
      setScanning(false)
    }
  }

  const errorCount = results.filter((r) => r.error || (r.status != null && r.status >= 400)).length
  const slowCount = results.filter((r) => !r.error && r.responseMs != null && r.responseMs > 3000).length
  const okCount = results.filter((r) => !r.error && r.status != null && r.status < 400).length

  const filtered = useMemo(() => {
    if (filter === 'error') return results.filter((r) => r.error || (r.status != null && r.status >= 400))
    if (filter === 'slow') return results.filter((r) => !r.error && r.responseMs != null && r.responseMs > 3000)
    if (filter === 'ok') return results.filter((r) => !r.error && r.status != null && r.status < 400)
    return results
  }, [results, filter])

  return (
    <section className="content-grid">
      <article className="panel wide">
        <PanelTitle title="Scanner de Sites" description="Verifica sites dos leads: status HTTP, tempo de resposta, erros 404 e timeouts." />
        {error && <p className="form-error">{error}</p>}
        <div className="site-health-toolbar">
          <input
            className="kb-select"
            style={{ width: 200 }}
            placeholder="Filtrar por cidade (ex: Belo Horizonte)"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            disabled={scanning}
          />
          <button className="btn-primary" type="button" onClick={scan} disabled={scanning}>
            {scanning ? 'Escaneando…' : scanned ? 'Escanear novamente' : 'Iniciar Scan'}
          </button>
          {scanning && <span className="site-health-hint">Verificando sites{cityFilter ? ` em ${cityFilter}` : ''}…</span>}
          {scanned && !scanning && (
            <div className="site-health-filters">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos ({results.length})</button>
              <button type="button" className={`sh-filter-err${filter === 'error' ? ' active' : ''}`} onClick={() => setFilter('error')}>Erros/404 ({errorCount})</button>
              <button type="button" className={`sh-filter-slow${filter === 'slow' ? ' active' : ''}`} onClick={() => setFilter('slow')}>Lentos &gt;3s ({slowCount})</button>
              <button type="button" className={`sh-filter-ok${filter === 'ok' ? ' active' : ''}`} onClick={() => setFilter('ok')}>OK ({okCount})</button>
            </div>
          )}
        </div>
        {scanned && filtered.length > 0 && (
          <div className="site-health-table">
            <div className="site-health-head">
              <span>Lead</span>
              <span>URL</span>
              <span>Status</span>
              <span>Tempo</span>
            </div>
            {filtered.map((r) => {
              const isErr = r.error || (r.status != null && r.status >= 400)
              const isSlow = !r.error && r.responseMs != null && r.responseMs > 3000
              return (
                <div key={r.id} className={`site-health-row ${isErr ? 'sh-row-err' : isSlow ? 'sh-row-slow' : 'sh-row-ok'}`}>
                  <span className="sh-name">{r.name}</span>
                  <a className="sh-url" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
                  <span className="sh-status">
                    {r.error
                      ? <span className="sh-badge sh-badge-err">{r.error === 'timeout' ? 'Timeout' : 'Erro'}</span>
                      : <span className={`sh-badge ${r.status != null && r.status < 400 ? 'sh-badge-ok' : 'sh-badge-err'}`}>{r.status}</span>
                    }
                  </span>
                  <span className="sh-time">{r.responseMs != null ? `${r.responseMs}ms` : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
        {scanned && filtered.length === 0 && <Empty text="Nenhum resultado nessa categoria." />}
      </article>
    </section>
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
    const estimatedMin = Math.ceil((selectedLeads.length * 5.5) / 60)
    if (!confirm(`Enviar Cavalo de Troia para ${selectedLeads.length} lead${selectedLeads.length !== 1 ? 's' : ''}?\n\nDelay de segurança entre mensagens: ~3-8s\nTempo estimado: ~${estimatedMin} min`)) return

    setIsSending(true)
    setStatus(`Enviando com delay de segurança… (estimado ~${estimatedMin} min, não feche a janela)`)
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
            {isSending ? <><span className="send-spinner" />Enviando com delay…</> : `Enviar para ${selectedLeads.length}`}
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

function CommandView({
  assignments, approvalLeads, followUps, whatsapp,
  onApprove, onDiscard, onStage, onRelease, onCompleteFollowUp, onRefresh,
  isBusy, setStatus, setBusy,
}: {
  assignments: Assignment[]
  approvalLeads: Lead[]
  followUps: FollowUp[]
  whatsapp: WhatsAppStatus | null
  onApprove: (lead: Lead) => Promise<void>
  onDiscard: (lead: Lead) => Promise<void>
  onStage: (a: Assignment, stage: string) => Promise<void>
  onRelease: (a: Assignment) => Promise<void>
  onCompleteFollowUp: (fu: FollowUp) => Promise<void>
  onRefresh: () => Promise<void>
  isBusy: boolean
  setStatus: (s: string) => void
  setBusy: (b: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set())
  const [tempFilters, setTempFilters] = useState<Set<string>>(new Set())
  const [onlyFu, setOnlyFu] = useState(false)
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [showApproval, setShowApproval] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showProspect, setShowProspect] = useState(false)

  const overdueIds = useMemo(() => new Set(
    followUps.filter((fu) => fu.isOverdue && fu.status === 'pending').map((fu) => fu.assignmentId).filter(Boolean)
  ), [followUps])

  const filtered = useMemo(() => {
    let r = assignments
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((a) => a.lead.name.toLowerCase().includes(q) || (a.lead.category || '').toLowerCase().includes(q) || (a.lead.city || '').toLowerCase().includes(q)) }
    if (stageFilters.size > 0) r = r.filter((a) => stageFilters.has(a.stage))
    if (tempFilters.size > 0) r = r.filter((a) => tempFilters.has(a.temperature))
    if (onlyFu) r = r.filter((a) => (a.pendingFollowUps || 0) > 0)
    if (onlyOverdue) r = r.filter((a) => overdueIds.has(a.id))
    return r
  }, [assignments, search, stageFilters, tempFilters, onlyFu, onlyOverdue, overdueIds])

  const stageCounts = useMemo(() => {
    let base = assignments
    if (search.trim()) { const q = search.toLowerCase(); base = base.filter((a) => a.lead.name.toLowerCase().includes(q) || (a.lead.category || '').toLowerCase().includes(q)) }
    if (tempFilters.size > 0) base = base.filter((a) => tempFilters.has(a.temperature))
    const m: Record<string, number> = {}
    base.forEach((a) => { m[a.stage] = (m[a.stage] || 0) + 1 })
    return m
  }, [assignments, search, tempFilters])

  const tempCounts = useMemo(() => {
    let base = assignments
    if (search.trim()) { const q = search.toLowerCase(); base = base.filter((a) => a.lead.name.toLowerCase().includes(q)) }
    if (stageFilters.size > 0) base = base.filter((a) => stageFilters.has(a.stage))
    const m: Record<string, number> = {}
    base.forEach((a) => { m[a.temperature] = (m[a.temperature] || 0) + 1 })
    return m
  }, [assignments, search, stageFilters])

  const maxStage = Math.max(...Object.values(stageCounts), 1)
  const maxTemp = Math.max(...Object.values(tempCounts), 1)

  function toggleStage(s: string) { const n = new Set(stageFilters); n.has(s) ? n.delete(s) : n.add(s); setStageFilters(n) }
  function toggleTemp(t: string) { const n = new Set(tempFilters); n.has(t) ? n.delete(t) : n.add(t); setTempFilters(n) }

  const hasFilters = !!(search || stageFilters.size || tempFilters.size || onlyFu || onlyOverdue)
  const selected = assignments.find((a) => a.id === selectedId) || null
  const activeStageList = stages.filter((s) => !['Perdido', 'Inativo'].includes(s))
  const closedStageList = ['Perdido', 'Inativo']

  return (
    <div className="cmd-view">
      {/* ── Filtros ── */}
      <aside className="cmd-filters">
        <div className="cmd-filter-header">
          <span>Filtros</span>
          {hasFilters && <button type="button" className="cmd-clear" onClick={() => { setSearch(''); setStageFilters(new Set()); setTempFilters(new Set()); setOnlyFu(false); setOnlyOverdue(false) }}>Limpar tudo</button>}
        </div>
        <input className="cmd-search" type="search" placeholder="Buscar lead, nicho, cidade…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="cmd-quick-toggles">
          <button type="button" className={`cmd-toggle${onlyFu ? ' active' : ''}`} onClick={() => setOnlyFu((v) => !v)}>Com FU</button>
          <button type="button" className={`cmd-toggle${onlyOverdue ? ' active' : ''}`} onClick={() => setOnlyOverdue((v) => !v)}>Atrasados</button>
        </div>
        <div className="cmd-filter-section">
          <div className="cmd-filter-title">Etapa</div>
          {[...activeStageList, ...closedStageList].map((stage) => {
            const count = stageCounts[stage] || 0
            const on = stageFilters.has(stage)
            return (
              <button key={stage} type="button" className={`cmd-filter-row${on ? ' checked' : ''}`} onClick={() => toggleStage(stage)}>
                <span className={`cmd-check${on ? ' on' : ''}`} />
                <span className="cmd-filter-label">{stage}</span>
                <div className="cmd-bar-wrap"><div className="cmd-bar" style={{ width: `${(count / maxStage) * 100}%` }} /></div>
                <span className="cmd-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="cmd-filter-section">
          <div className="cmd-filter-title">Temperatura</div>
          {['quente', 'morno', 'frio'].map((temp) => {
            const count = tempCounts[temp] || 0
            const on = tempFilters.has(temp)
            return (
              <button key={temp} type="button" className={`cmd-filter-row${on ? ' checked' : ''}`} onClick={() => toggleTemp(temp)}>
                <span className={`cmd-check${on ? ' on' : ''}`} />
                <span className="cmd-filter-label">{temp}</span>
                <div className="cmd-bar-wrap"><div className="cmd-bar" style={{ width: `${(count / maxTemp) * 100}%` }} /></div>
                <span className="cmd-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
        {approvalLeads.length > 0 && (
          <div className="cmd-filter-section">
            <div className="cmd-filter-title">Fila</div>
            <button type="button" className={`cmd-filter-row${showApproval ? ' checked' : ''}`} onClick={() => setShowApproval((v) => !v)}>
              <span className={`cmd-check${showApproval ? ' on' : ''}`} />
              <span className="cmd-filter-label">Aprovação pendente</span>
              <span className="cmd-filter-count">{approvalLeads.length}</span>
            </button>
          </div>
        )}
      </aside>

      {/* ── Lista ── */}
      <div className="cmd-list">
        <div className="cmd-list-header">
          <span className="cmd-list-count">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}{showApproval && approvalLeads.length > 0 ? ` · ${approvalLeads.length} aguardando` : ''}</span>
          <button type="button" className="btn-primary small" onClick={() => setShowProspect(true)}>+ Prospectar</button>
        </div>
        {showApproval && approvalLeads.length > 0 && (
          <div className="cmd-approval-section">
            <div className="cmd-section-label">⏳ Aprovação pendente</div>
            {approvalLeads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="cmd-row approval-row">
                <div className="cmd-row-main">
                  <span className="cmd-row-name">{lead.name}</span>
                  <span className="cmd-row-meta">{[lead.category, lead.city].filter(Boolean).join(' · ')}</span>
                </div>
                {lead.score != null && <span className="cmd-score">{lead.score}</span>}
                <div className="cmd-row-actions-inline">
                  <button type="button" className="btn-ghost small" onClick={() => onApprove(lead)}>Aprovar</button>
                  <button type="button" className="btn-ghost small" style={{ color: '#f87171' }} onClick={() => onDiscard(lead)}>✕</button>
                </div>
              </div>
            ))}
            {approvalLeads.length > 5 && <div className="cmd-more">+{approvalLeads.length - 5} mais na fila</div>}
          </div>
        )}
        <div className="cmd-rows">
          {filtered.map((a) => {
            const aFu = followUps.filter((fu) => fu.assignmentId === a.id && fu.status === 'pending')
            const isOvr = overdueIds.has(a.id)
            return (
              <button key={a.id} type="button" className={`cmd-row${selectedId === a.id ? ' active' : ''}${isOvr ? ' overdue' : ''}`} onClick={() => setSelectedId(a.id)}>
                <div className="cmd-row-main">
                  <div className="cmd-row-top">
                    <span className="cmd-row-name">{a.lead.name}</span>
                    <span className={`cmd-stage-badge s-${a.stage.split(' ')[0].toLowerCase()}`}>{a.stage}</span>
                  </div>
                  <div className="cmd-row-bottom">
                    <span className="cmd-row-meta">{[a.lead.category, a.lead.city].filter(Boolean).join(' · ')}</span>
                    <div className="cmd-row-tags">
                      <span className={`temp-badge ${a.temperature}`}>{a.temperature}</span>
                      {aFu.length > 0 && <span className="fu-badge">{aFu.length}</span>}
                      {a.lead.score != null && <span className="cmd-score">{a.lead.score}</span>}
                    </div>
                  </div>
                  {a.nextAction && <div className="cmd-next-action">→ {a.nextAction}</div>}
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && assignments.length > 0 && <div className="cmd-empty">Nenhum lead com esses filtros.</div>}
          {assignments.length === 0 && <div className="cmd-empty">CRM vazio. Clique em "+ Prospectar".</div>}
        </div>
      </div>

      {/* ── Detalhe ── */}
      <div className="cmd-detail">
        {selected ? (
          <CmdDetail
            assignment={selected}
            followUps={followUps.filter((fu) => fu.assignmentId === selected.id && fu.status === 'pending')}
            whatsapp={whatsapp}
            onStage={onStage}
            onRelease={onRelease}
            onCompleteFollowUp={onCompleteFollowUp}
            onRefresh={onRefresh}
          />
        ) : (
          <div className="cmd-empty-detail">Selecione um lead para ver detalhes e agir.</div>
        )}
      </div>

      {/* ── Modal prospecção ── */}
      {showProspect && (
        <div className="cmd-modal-overlay" onClick={() => setShowProspect(false)}>
          <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cmd-modal-header">
              <h2>Criar Prospecção</h2>
              <button type="button" className="cmd-modal-close" onClick={() => setShowProspect(false)}>✕</button>
            </div>
            <div className="cmd-modal-body">
              <ProspectView isBusy={isBusy} onRun={async () => { await onRefresh(); setShowProspect(false) }} setStatus={setStatus} setBusy={setBusy} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CmdDetail({
  assignment, followUps, whatsapp, onStage, onRelease, onCompleteFollowUp, onRefresh,
}: {
  assignment: Assignment
  followUps: FollowUp[]
  whatsapp: WhatsAppStatus | null
  onStage: (a: Assignment, stage: string) => Promise<void>
  onRelease: (a: Assignment) => Promise<void>
  onCompleteFollowUp: (fu: FollowUp) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [approach, setApproach] = useState(assignment.approach || '')
  const [nextAction, setNextAction] = useState(assignment.nextAction || '')
  const [temperature, setTemperature] = useState(assignment.temperature || 'morno')
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setApproach(assignment.approach || '')
    setNextAction(assignment.nextAction || '')
    setTemperature(assignment.temperature || 'morno')
    setSendStatus(null)
  }, [assignment.id])

  async function save() {
    setIsSaving(true)
    try {
      await api(`/api/assignments/${assignment.id}/stage`, { method: 'POST', body: JSON.stringify({ stage: assignment.stage, approach, nextAction, temperature }) })
      await onRefresh()
    } catch { /* ignore */ } finally { setIsSaving(false) }
  }

  async function generate() {
    setIsGenerating(true)
    try {
      const d = await api<{ approach: string }>('/api/messages/generate', { method: 'POST', body: JSON.stringify({ leadId: assignment.lead.id }) })
      setApproach(d.approach)
    } catch { /* ignore */ } finally { setIsGenerating(false) }
  }

  async function send() {
    setIsSending(true)
    setSendStatus(null)
    try {
      await api('/api/messages/send', { method: 'POST', body: JSON.stringify({ number: assignment.lead.phone, text: approach, leadId: assignment.lead.id }) })
      setSendStatus({ ok: true, msg: 'Mensagem enviada!' })
      await onRefresh()
    } catch (err) {
      setSendStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erro.' })
    } finally { setIsSending(false) }
  }

  const waConnected = whatsapp?.connectionStatus === 'open'

  return (
    <div className="cmd-detail-inner">
      <LeadDetail lead={assignment.lead} />
      <div className="cmd-detail-controls">
        <label>Etapa
          <select value={assignment.stage} onChange={(e) => onStage(assignment, e.target.value)}>
            {stages.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Temperatura
          <select value={temperature} onChange={(e) => setTemperature(e.target.value)} onBlur={save}>
            <option value="frio">Frio</option>
            <option value="morno">Morno</option>
            <option value="quente">Quente</option>
          </select>
        </label>
      </div>
      <div className="cmd-detail-field">
        <label>Próxima ação
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} onBlur={save} placeholder="Ex: Ligar amanhã de manhã" />
        </label>
      </div>
      <div className="cmd-detail-field">
        <label>Abordagem / Mensagem</label>
        <textarea value={approach} onChange={(e) => setApproach(e.target.value)} rows={4} placeholder="Mensagem de abordagem…" />
        <div className="cmd-send-row">
          <button type="button" className="btn-ghost small" onClick={save} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" className="btn-ghost small" onClick={generate} disabled={isGenerating}>{isGenerating ? 'Gerando…' : 'Gerar IA'}</button>
          <button type="button" className="btn-primary small" onClick={send} disabled={isSending || !waConnected || !approach.trim() || !assignment.lead.phone} title={!waConnected ? 'WhatsApp não conectado' : !assignment.lead.phone ? 'Sem telefone' : ''}>
            {isSending ? <><span className="send-spinner" />Enviando…</> : <><span className={`ws-dot ${waConnected ? 'open' : 'close'}`} style={{ marginRight: 5 }} />Enviar WA</>}
          </button>
        </div>
        {isSending && <p className="send-delay-hint">Aguardando delay de segurança…</p>}
        {sendStatus && <p className={sendStatus.ok ? 'form-success' : 'form-error'} style={{ marginTop: 6 }}>{sendStatus.msg}</p>}
      </div>
      {followUps.length > 0 && (
        <div className="cmd-detail-field">
          <strong style={{ fontSize: 12, color: '#8a99b0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-ups pendentes ({followUps.length})</strong>
          {followUps.map((fu) => (
            <div key={fu.id} className={`fu-row${fu.isOverdue ? ' overdue' : ''}`}>
              <div className="fu-meta">
                <span>{formatDate(fu.dueAt)} · passo {fu.step}</span>
                <p>{fu.text}</p>
              </div>
              <div className="fu-actions">
                <button className="btn-ghost small" type="button" onClick={() => onCompleteFollowUp(fu)}>Concluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {assignment.history && assignment.history.length > 0 && (
        <div className="cmd-detail-field">
          <strong style={{ fontSize: 12, color: '#8a99b0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico</strong>
          {assignment.history.slice(-5).reverse().map((h, i) => (
            <div key={i} className="crm-history-item">
              <span className="crm-history-type">{h.type}</span>
              <span className="crm-history-text">{h.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="cmd-detail-field">
        <button type="button" className="btn-ghost small" style={{ color: '#f87171' }} onClick={() => onRelease(assignment)}>Liberar lead do meu CRM</button>
      </div>
    </div>
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

function PanelTitle({ title, description }: { title: string; description: string }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{description}</p></div></div>
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
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
    command: 'Central de Prospecção',
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
    command: 'Filtre, aja e prospecte em uma tela só.',
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



