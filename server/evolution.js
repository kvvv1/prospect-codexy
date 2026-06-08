function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_URL
  const apiKey = process.env.EVOLUTION_API_KEY

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API não configurada no ambiente do Prospect.')
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
  }
}

export async function sendWhatsAppText({ number, text, instanceName }) {
  const config = getEvolutionConfig()
  const cleanNumber = String(number || '').replace(/\D/g, '')
  const response = await fetch(`${config.baseUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({
      number: cleanNumber,
      text,
    }),
  })

  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    data = { raw: body }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}

export async function checkWhatsAppNumber({ number, instanceName }) {
  const config = getEvolutionConfig()
  const cleanNumber = String(number || '').replace(/\D/g, '')
  const response = await fetch(`${config.baseUrl}/chat/whatsappNumbers/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({ numbers: [cleanNumber] }),
  })

  const data = await response.json().catch(() => [])
  if (!response.ok) {
    throw new Error(data?.message || `Evolution number check falhou: ${response.status}`)
  }

  const checked = Array.isArray(data) ? data[0] : null
  return {
    number: cleanNumber,
    exists: Boolean(checked?.exists),
    jid: checked?.jid || null,
  }
}

export async function fetchInstances() {
  const config = getEvolutionConfig()
  const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
    headers: { apikey: config.apiKey },
  })
  if (!response.ok) throw new Error(`Evolution fetchInstances falhou: ${response.status}`)
  return response.json()
}

export async function ensureInstance(instanceName) {
  const instances = await fetchInstances()
  const existing = instances.find((instance) => instance.name === instanceName)
  if (existing) return existing

  const config = getEvolutionConfig()
  const response = await fetch(`${config.baseUrl}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || `Evolution create falhou: ${response.status}`)
  return data.instance || data
}

export async function connectInstance(instanceName) {
  await ensureInstance(instanceName)
  const config = getEvolutionConfig()
  const response = await fetch(`${config.baseUrl}/instance/connect/${instanceName}`, {
    headers: { apikey: config.apiKey },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || `Evolution connect falhou: ${response.status}`)
  return data
}

export async function getInstanceStatus(instanceName) {
  const instances = await fetchInstances()
  const instance = instances.find((item) => item.name === instanceName)
  if (!instance) return { connectionStatus: 'not-created', ownerJid: null, profileName: null }
  return {
    connectionStatus: instance.connectionStatus,
    ownerJid: instance.ownerJid,
    profileName: instance.profileName,
    profilePicUrl: instance.profilePicUrl,
    updatedAt: instance.updatedAt,
  }
}

export async function deleteInstance(instanceName) {
  const config = getEvolutionConfig()
  const response = await fetch(`${config.baseUrl}/instance/delete/${instanceName}`, {
    method: 'DELETE',
    headers: { apikey: config.apiKey },
  })
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.message || `Evolution delete falhou: ${response.status}`)
  }
  return true
}
