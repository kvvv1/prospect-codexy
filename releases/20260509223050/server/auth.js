import crypto from 'node:crypto'

const cookieName = 'codexy_prospect_session'

function getSecret() {
  return process.env.SESSION_SECRET || process.env.EVOLUTION_API_KEY || 'codexy-prospect-dev-secret'
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verify(token) {
  if (!token || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null
  return payload
}

export function parseCookies(req) {
  const header = req.headers.cookie || ''
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

export function createSessionCookie(user) {
  const token = sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12,
  })
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function getSession(req) {
  return verify(parseCookies(req)[cookieName])
}

export function requireAuth(req, res, next) {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Não autenticado.' })
  req.user = session
  next()
}
