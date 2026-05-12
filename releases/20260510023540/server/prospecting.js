import { createId, leadFingerprint, normalizeKey } from './store.js'

const sampleBusinesses = [
  { name: 'Clínica São Miguel', category: 'Clínica odontológica', city: 'Belo Horizonte', phone: '5531995531183', rating: 4.7, reviews: 82, website: '', instagram: '@clinicasaomiguel', address: 'Savassi, Belo Horizonte' },
  { name: 'Sabor Mineiro Açougue', category: 'Açougue', city: 'Contagem', phone: '5531995531183', rating: 4.5, reviews: 43, website: '', instagram: '' },
  { name: 'Colégio Aprender Mais', category: 'Escola', city: 'Betim', phone: '5531995531183', rating: 4.8, reviews: 126, website: 'https://example.com', instagram: '@aprendermais' },
  { name: 'Bella Forma Estética', category: 'Clínica de estética', city: 'Nova Lima', phone: '5531995531183', rating: 4.9, reviews: 64, website: '', instagram: '@bellaforma' },
  { name: 'Odonto Prime BH', category: 'Dentista', city: 'Belo Horizonte', phone: '5531995531183', rating: 4.9, reviews: 144, website: '', instagram: '@odontoprimebh', address: 'Funcionários, Belo Horizonte' },
  { name: 'Implante Center Minas', category: 'Implantodontia', city: 'Belo Horizonte', phone: '5531995531183', rating: 4.6, reviews: 58, website: 'https://example.com/implante', instagram: '', address: 'Centro, Belo Horizonte' },
]

const presets = {
  'sem-site': {
    label: 'Empresas sem site',
    intent: 'Encontrar empresas locais com telefone e sem site próprio para vender landing page de conversão.',
    product: 'Landing Pages',
    pains: ['sem site', 'presença digital fraca', 'captação por WhatsApp'],
  },
  premium: {
    label: 'Negócios locais premium',
    intent: 'Encontrar negócios locais com ticket mais alto, boa reputação e oportunidade de captação.',
    product: 'Landing Pages',
    pains: ['site fraco', 'alta concorrência', 'captação local'],
  },
  whatsapp: {
    label: 'Serviços com WhatsApp manual',
    intent: 'Encontrar empresas que dependem de WhatsApp e podem precisar de automação ou triagem.',
    product: 'DoctorChatbot',
    pains: ['atendimento manual', 'triagem lenta', 'perda de contatos'],
  },
  google: {
    label: 'Bom Google e presença fraca',
    intent: 'Encontrar empresas com boas avaliações, mas presença digital pouco estruturada.',
    product: 'Landing Pages',
    pains: ['boa reputação', 'site ausente ou fraco', 'conversão baixa'],
  },
}

const segmentExpansions = [
  {
    match: ['odontologia', 'dentista', 'odonto', 'dental'],
    terms: ['dentista', 'clínica odontológica', 'consultório odontológico', 'ortodontista', 'implantodontia', 'clareamento dental', 'odontopediatria', 'endodontia'],
    recommendation: 'Odontologia tende a funcionar bem para landing pages porque confiança local, Google Maps e WhatsApp influenciam a decisão do paciente.',
  },
  {
    match: ['estetica', 'estética', 'beleza'],
    terms: ['clínica de estética', 'harmonização facial', 'depilação a laser', 'limpeza de pele', 'esteticista', 'spa urbano'],
    recommendation: 'Estética costuma responder bem a ofertas visuais, prova social e agendamento rápido pelo WhatsApp.',
  },
  {
    match: ['saude', 'saúde', 'clinica', 'clínica', 'medico', 'médico'],
    terms: ['clínica médica', 'consultório médico', 'fisioterapia', 'psicólogo', 'nutricionista', 'clínica de saúde'],
    recommendation: 'Serviços de saúde precisam transmitir confiança e reduzir atrito entre pesquisa e agendamento.',
  },
  {
    match: ['educacao', 'educação', 'escola', 'curso'],
    terms: ['escola particular', 'curso profissionalizante', 'escola de idiomas', 'reforço escolar', 'curso técnico'],
    recommendation: 'Educação funciona melhor quando a abordagem fala de captação local e organização de matrículas.',
  },
  {
    match: ['restaurante', 'bar', 'comida', 'delivery'],
    terms: ['restaurante', 'pizzaria', 'hamburgueria', 'bar', 'delivery'],
    recommendation: 'Alimentação exige filtro mais cuidadoso para evitar leads de baixo ticket ou sem fit para o produto.',
  },
]

const defaultTerms = ['empresa local', 'prestador de serviço', 'serviços profissionais', 'negócio local']

export function buildProspectingPreview({ prompt = '', preset = '', product = '', region = '', quantity = 40, criteria = {} }, store, user) {
  const selectedPreset = presets[preset] || null
  const parsed = parsePrompt(prompt)
  const targetProduct = product || selectedPreset?.product || parsed.product || 'Landing Pages'
  const targetRegion = region || parsed.region || 'Belo Horizonte'
  const targetAudience = parsed.audience || selectedPreset?.label || 'negócios locais'
  const expansion = findExpansion(`${prompt} ${targetAudience}`)
  const baseTerms = expansion?.terms || expandGenericAudience(targetAudience)
  const keywords = [...new Set(baseTerms.map((term) => `${term} em ${targetRegion}`))].slice(0, 10)
  const desiredQuantity = clamp(Number(quantity) || 40, 10, 120)
  const alreadySeen = countSeenLeads(store, keywords)
  const apiCalls = Math.min(keywords.length, Math.ceil(desiredQuantity / 8))
  const usefulMin = Math.max(3, Math.round(desiredQuantity * 0.22))
  const usefulMax = Math.max(usefulMin + 4, Math.round(desiredQuantity * 0.55))

  return {
    id: createId('preview'),
    createdBy: user.id,
    prompt,
    preset,
    strategy: {
      product: targetProduct,
      audience: targetAudience,
      region: targetRegion,
      objective: selectedPreset?.intent || `Encontrar ${targetAudience} em ${targetRegion} com sinais comerciais para ${targetProduct}.`,
      pains: selectedPreset?.pains || inferPains(targetProduct, criteria),
      keywords,
      priorityCriteria: [
        'Telefone ou WhatsApp disponível',
        'Categoria compatível com o público desejado',
        'Boa reputação ou volume mínimo de avaliações',
        'Ausência de site ou site com baixa conversão',
        'Empresa sem conversa ativa com outro vendedor',
      ],
      discardCriteria: [
        'Sem contato utilizável',
        'Fora da região',
        'Categoria distante da intenção',
        'Duplicado já conhecido',
        'Lead ativo com outro vendedor',
      ],
      quantity: desiredQuantity,
      estimatedUsefulRange: `${usefulMin} a ${usefulMax}`,
      estimatedApiCalls: apiCalls,
      repetitionRisk: alreadySeen > 12 ? 'alto' : alreadySeen > 4 ? 'médio' : 'baixo',
      alreadySeen,
      cachePolicy: 'Reusar resultados por keyword/região antes de chamar a API novamente.',
      recommendation: expansion?.recommendation || 'Comece com uma busca moderada, aprove leads manualmente e ajuste as keywords com base na qualidade dos resultados.',
    },
  }
}

export async function runProspectingSearch({ preview, store }) {
  const startedAt = new Date().toISOString()
  const keywords = preview.strategy.keywords.slice(0, Math.ceil(preview.strategy.quantity / 8))
  const rawResults = []
  const cacheHits = []
  let apiCalls = 0

  for (const keyword of keywords) {
    const cacheKey = buildCacheKey(keyword)
    const cached = store.searchCache[cacheKey]
    if (cached?.results?.length) {
      cacheHits.push(keyword)
      rawResults.push(...cached.results.map((lead) => ({ ...lead, fromCache: true, sourceKeyword: keyword })))
      continue
    }

    const results = await searchKeyword(keyword, preview.strategy)
    apiCalls += process.env.GOOGLE_MAPS_API_KEY ? 1 : 0
    store.searchCache[cacheKey] = {
      keyword,
      savedAt: new Date().toISOString(),
      results,
    }
    rawResults.push(...results.map((lead) => ({ ...lead, fromCache: false, sourceKeyword: keyword })))
  }

  const analyzed = analyzeResults(rawResults, preview, store)
  const run = {
    id: createId('run'),
    preview,
    createdBy: preview.createdBy,
    campaignId: null,
    status: 'completed',
    startedAt,
    finishedAt: new Date().toISOString(),
    stats: {
      keywords: keywords.length,
      apiCalls,
      cacheHits: cacheHits.length,
      rawFound: rawResults.length,
      uniqueFound: analyzed.uniqueFound,
      recommended: analyzed.leads.filter((lead) => lead.classification === 'recommended').length,
      medium: analyzed.leads.filter((lead) => lead.classification === 'medium').length,
      discarded: analyzed.leads.filter((lead) => lead.classification === 'discarded').length,
      duplicated: analyzed.leads.filter((lead) => lead.classification === 'duplicate').length,
      alreadyActive: analyzed.leads.filter((lead) => lead.classification === 'already-active').length,
    },
    leads: analyzed.leads.map((lead) => lead.id),
    summary: buildRunSummary(analyzed.leads, preview, cacheHits),
  }

  store.searchRuns.push(run)
  return { run, leads: analyzed.leads }
}

export function generateApproach(lead, product = lead.product) {
  const cityPart = lead.city ? ` em ${lead.city}` : ''
  const sitePart = lead.website
    ? 'vi que vocês já têm presença digital, mas dá para deixar a captação mais direta'
    : 'não encontrei um site próprio para captar contatos de forma mais profissional'

  return `Oi, tudo bem? Aqui é da Codexy. Encontrei a ${lead.name}${cityPart} pelo Google e ${sitePart}. A gente ajuda empresas como a de vocês com ${product || 'presença digital'} para transformar visitas do Google e Instagram em pedidos pelo WhatsApp. Posso te mandar uma ideia rápida de como isso ficaria para a ${lead.name}?`
}

export function generateFollowUp(lead, step = 1) {
  const options = [
    'Passando só para complementar: a ideia não é trocar o WhatsApp de vocês, é criar um caminho mais claro para o cliente entender a oferta e chamar com mais confiança. Faz sentido eu te mostrar um exemplo?',
    `Vi que muitos clientes pesquisam antes de chamar no WhatsApp. Uma presença bem organizada pode ajudar a passar mais confiança e aumentar os contatos. Quer que eu te mande um modelo aplicado ao nicho de ${lead.category}?`,
    `Última mensagem para não te incomodar: se melhorar a captação digital for prioridade depois, posso montar um diagnóstico rápido da ${lead.name} sem custo. Posso deixar isso separado para você?`,
  ]

  return options[Math.min(step - 1, options.length - 1)]
}

function parsePrompt(prompt) {
  const normalized = normalizeKey(prompt)
  const product = normalized.includes('chatbot') || normalized.includes('whatsapp') ? 'DoctorChatbot' : normalized.includes('treinamento') ? 'LearnHub' : normalized.includes('site') || normalized.includes('landing') ? 'Landing Pages' : ''
  const regionMatch = prompt.match(/\b(?:em|na|no|para)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ\s-]{2,})(?:$|,|\.|;)/)
  const region = regionMatch?.[1]?.trim() || ''
  const audience = prompt
    .replace(/quero|vender|prospectar|para|em|no|na|landing page|chatbot|site|whatsapp/gi, ' ')
    .replace(region, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { product, region, audience }
}

function findExpansion(text) {
  const normalized = normalizeKey(text)
  return segmentExpansions.find((item) => item.match.some((term) => normalized.includes(normalizeKey(term))))
}

function expandGenericAudience(audience) {
  const words = normalizeKey(audience).split(' ').filter((word) => word.length > 3)
  return [...new Set([...words, audience, ...defaultTerms])].filter(Boolean).slice(0, 8)
}

function inferPains(product, criteria) {
  if (product === 'DoctorChatbot') return ['atendimento manual', 'perda de contatos', 'triagem repetitiva']
  if (criteria?.site === 'weak') return ['site fraco', 'baixa conversão', 'pouca clareza comercial']
  return ['sem site', 'presença digital fraca', 'captação por WhatsApp']
}

async function searchKeyword(keyword, strategy) {
  if (process.env.GOOGLE_MAPS_API_KEY) return searchGooglePlaces(keyword, strategy)
  const key = normalizeKey(keyword)
  return sampleBusinesses
    .filter((business) => key.split(' ').some((part) => normalizeKey(`${business.name} ${business.category} ${business.city}`).includes(part)))
    .concat(sampleBusinesses)
    .slice(0, 8)
    .map((business, index) => ({
      ...business,
      id: `mock_${normalizeKey(keyword).replace(/\s+/g, '_')}_${index}`,
      placeId: `mock_${normalizeKey(business.name).replace(/\s+/g, '_')}`,
      source: 'mock',
    }))
}

async function searchGooglePlaces(keyword, strategy) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword)}&language=pt-BR&key=${process.env.GOOGLE_MAPS_API_KEY}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Google Places falhou com status ${response.status}`)

  const data = await response.json()
  return (data.results || []).slice(0, 12).map((place) => ({
    id: place.place_id,
    placeId: place.place_id,
    name: place.name,
    category: place.types?.[0] || strategy.audience,
    city: strategy.region,
    phone: '',
    rating: place.rating || null,
    reviews: place.user_ratings_total || 0,
    website: '',
    instagram: '',
    address: place.formatted_address,
    source: 'google_places',
  }))
}

function analyzeResults(results, preview, store) {
  const seenInRun = new Map()
  const leads = []

  for (const result of results) {
    const fingerprint = leadFingerprint(result)
    if (seenInRun.has(fingerprint)) continue
    seenInRun.set(fingerprint, true)

    const existing = store.leadPool.find((lead) => lead.fingerprint === fingerprint)
    const activeAssignment = existing
      ? store.assignments.find((assignment) => assignment.leadId === existing.id && assignment.status === 'active')
      : null
    const scored = scoreLead({ ...result, fingerprint }, preview.strategy, Boolean(activeAssignment), Boolean(existing))
    const lead = existing || {
      id: createId('lead'),
      firstSeenAt: new Date().toISOString(),
      campaignIds: [],
      sourceKeywords: [],
      foundByIds: [],
    }

    Object.assign(lead, {
      ...lead,
      ...result,
      id: lead.id,
      placeId: result.placeId || result.place_id || lead.placeId || null,
      fingerprint,
      product: preview.strategy.product,
      opportunity: preview.strategy.pains[0],
      pain: scored.pain,
      score: scored.score,
      scoreReasons: scored.reasons,
      scoreWarnings: scored.warnings,
      classification: scored.classification,
      agentAdvice: scored.agentAdvice,
      status: lead.status || 'available',
      availability: activeAssignment ? 'active' : lead.availability || 'available',
      sourceKeywords: [...new Set([...(lead.sourceKeywords || []), result.sourceKeyword].filter(Boolean))],
      foundByIds: [...new Set([...(lead.foundByIds || []), preview.createdBy].filter(Boolean))],
      lastSeenAt: new Date().toISOString(),
      fromCache: result.fromCache,
    })

    if (!existing) store.leadPool.push(lead)
    leads.push(lead)
  }

  return { leads, uniqueFound: leads.length }
}

function scoreLead(lead, strategy, alreadyActive, alreadyKnown) {
  let score = 45
  const reasons = []
  const warnings = []

  if (lead.phone) addScore(12, 'Tem telefone/WhatsApp para abordagem direta.')
  else warnings.push('Sem telefone identificado no resultado inicial.')

  if (!lead.website) addScore(18, 'Não possui site identificado.')
  else addScore(4, 'Possui site, mas ainda pode ter oportunidade de conversão.')

  if ((lead.rating || 0) >= 4.5) addScore(10, 'Boa reputação no Google.')
  if ((lead.reviews || 0) >= 40) addScore(9, 'Volume relevante de avaliações.')

  const categoryText = normalizeKey(`${lead.name} ${lead.category}`)
  const audienceWords = normalizeKey(strategy.audience).split(' ').filter((word) => word.length > 3)
  if (audienceWords.some((word) => categoryText.includes(word))) addScore(8, 'Categoria compatível com a intenção da prospecção.')
  else warnings.push('Categoria precisa ser revisada manualmente.')

  if (alreadyKnown) warnings.push('Lead já estava na Base Geral; dados foram reaproveitados.')
  if (alreadyActive) warnings.push('Lead possui conversa ativa com outro vendedor.')

  const classification = alreadyActive
    ? 'already-active'
    : score >= 78
      ? 'recommended'
      : score >= 58
        ? 'medium'
        : warnings.includes('Sem telefone identificado no resultado inicial.')
          ? 'discarded'
          : 'medium'

  const pain = !lead.website
    ? 'Depende do Google/Instagram, mas não tem uma página própria clara para converter interessados.'
    : 'Tem presença digital, mas pode melhorar clareza, prova e conversão para WhatsApp.'

  return {
    score: Math.min(score, 98),
    reasons,
    warnings,
    classification,
    pain,
    agentAdvice: buildAdvice(lead, strategy, classification),
  }

  function addScore(points, reason) {
    score += points
    reasons.push(reason)
  }
}

function buildAdvice(lead, strategy, classification) {
  if (classification === 'already-active') return 'Não abordar agora: existe conversa ativa com outro vendedor.'
  if (classification === 'discarded') return 'Baixa prioridade. Só aprove se encontrar contato válido manualmente.'
  return `Boa abordagem: conectar ${strategy.product} com a dor de captação local e WhatsApp. Use o gancho de ${lead.reviews || 0} avaliações e presença digital ${lead.website ? 'melhorável' : 'ausente'}.`
}

function buildRunSummary(leads, preview, cacheHits) {
  const recommended = leads.filter((lead) => lead.classification === 'recommended').length
  const medium = leads.filter((lead) => lead.classification === 'medium').length
  const active = leads.filter((lead) => lead.classification === 'already-active').length
  return `Busca concluída para ${preview.strategy.audience}. ${recommended} recomendados, ${medium} médios e ${active} já ativos. ${cacheHits.length ? 'Parte dos dados veio de cache para reduzir custo.' : 'Nenhum cache reaproveitado nesta execução.'}`
}

function buildCacheKey(keyword) {
  return normalizeKey(keyword).replace(/\s+/g, '|')
}

function countSeenLeads(store, keywords) {
  const terms = keywords.map(normalizeKey)
  return store.leadPool.filter((lead) =>
    (lead.sourceKeywords || []).some((keyword) => terms.includes(normalizeKey(keyword))),
  ).length
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
