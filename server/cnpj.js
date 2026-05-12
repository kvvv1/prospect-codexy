/**
 * CNPJ enrichment via BrasilAPI (free, no key required).
 * Name-based search uses the Receita Federal public dataset via BrasilAPI.
 * All failures are silent — enrichment is best-effort.
 */

const BRASILAPI = 'https://brasilapi.com.br/api/cnpj/v1'
const TIMEOUT_MS = 6000

function timeout() {
  return AbortSignal.timeout(TIMEOUT_MS)
}

// Lookup by CNPJ number — reliable
export async function enrichByCnpj(cnpj) {
  const clean = String(cnpj || '').replace(/\D/g, '')
  if (clean.length !== 14) return null
  try {
    const res = await fetch(`${BRASILAPI}/${clean}`, { signal: timeout() })
    if (!res.ok) return null
    const data = await res.json()
    return parseCnpjData(data)
  } catch {
    return null
  }
}

// Name-based search — best-effort, may return null
// Tries BrasilAPI search endpoint (supported in newer versions)
export async function searchCnpjByName(name, city) {
  if (!name) return null
  try {
    const q = encodeURIComponent(cleanName(name))
    const res = await fetch(`${BRASILAPI}/search?q=${q}`, { signal: timeout() })
    if (!res.ok) return null
    const results = await res.json()
    if (!Array.isArray(results) || results.length === 0) return null
    const best = pickBestMatch(results, name, city)
    if (!best) return null
    // Fetch full data for the matched CNPJ
    return enrichByCnpj(best.cnpj)
  } catch {
    return null
  }
}

function parseCnpjData(data) {
  if (!data?.cnpj) return null
  const cnpj = String(data.cnpj).replace(/\D/g, '')
  const porte = normalizePorte(data.porte || data.descricao_porte)
  const capitalSocial = Number(data.capital_social) || null
  const dataAbertura = data.data_inicio_atividade || data.abertura || null
  const situacao = normalizeSituacao(data.descricao_situacao_cadastral || data.situacao)
  const razaoSocial = data.razao_social || data.nome || null
  const cnae = data.cnae_fiscal_descricao || data.atividade_principal?.[0]?.text || null
  const socios = parseSocios(data.qsa || [])
  const email = data.email || null
  const telefone = data.ddd_telefone_1 ? `${data.ddd_telefone_1}`.replace(/\D/g, '') : null

  return { cnpj, porte, capitalSocial, dataAbertura, situacao, razaoSocial, cnae, socios, email, telefone }
}

function normalizePorte(raw) {
  if (!raw) return null
  const s = String(raw).toUpperCase()
  if (s.includes('MEI')) return 'MEI'
  if (s.includes('MICRO')) return 'ME'
  if (s.includes('PEQUENO') || s.includes('EPP')) return 'EPP'
  if (s.includes('MEDIO') || s.includes('MÉDIO')) return 'MEDIO'
  if (s.includes('GRANDE')) return 'GRANDE'
  return raw
}

function normalizeSituacao(raw) {
  if (!raw) return null
  const s = String(raw).toUpperCase()
  if (s.includes('ATIVA') || s === 'ATIVA') return 'ativa'
  if (s.includes('BAIXADA')) return 'baixada'
  if (s.includes('SUSPENSA')) return 'suspensa'
  if (s.includes('INAPTA')) return 'inapta'
  return String(raw).toLowerCase()
}

function parseSocios(qsa) {
  if (!Array.isArray(qsa)) return []
  return qsa.slice(0, 3).map((s) => ({
    nome: s.nome_socio || s.nome || '',
    qualificacao: s.qualificacao_socio || s.qual || '',
  })).filter((s) => s.nome)
}

function cleanName(name) {
  // Remove common prefixes that won't match razão social
  return name
    .replace(/^(Dr\.|Dra\.|Prof\.|Clínica|Consultório|Espaço|Studio|Salão)\s+/i, '')
    .replace(/\s+(BH|SP|RJ|BSB)$/i, '')
    .trim()
    .slice(0, 50)
}

function pickBestMatch(results, name, city) {
  const normName = normalizeKey(cleanName(name))
  const normCity = normalizeKey(city || '')

  let best = null
  let bestScore = 0

  for (const r of results.slice(0, 10)) {
    const razao = normalizeKey(r.razao_social || r.nome || '')
    const municipio = normalizeKey(r.municipio || r.municipio_empresa || '')
    let score = 0

    // Name similarity: count matching words
    const nameWords = normName.split(' ').filter((w) => w.length >= 3)
    const matches = nameWords.filter((w) => razao.includes(w)).length
    score += (matches / Math.max(nameWords.length, 1)) * 60

    // City match bonus
    if (normCity && municipio && (municipio.includes(normCity) || normCity.includes(municipio))) score += 30

    // Only accept if at least 40% name overlap
    if (score >= 40 && score > bestScore) {
      bestScore = score
      best = r
    }
  }

  return best
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
