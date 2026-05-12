import { createId, leadFingerprint, normalizeKey } from './store.js'
import { searchCnpjByName } from './cnpj.js'
import { readStore, writeStore } from './store.js'

// Mock representativo do que o Google Maps retornaria — cobre múltiplos nichos e cidades
// Inclui mix de: clínicas, profissionais individuais (Dr./Dra.), negócios com e sem site
const sampleBusinesses = [
  // ── ODONTOLOGIA · BELO HORIZONTE ──────────────────────────────────────────
  { name: 'Dr. Carlos Moura Implantodontia',   category: 'Implantodontista',       city: 'Belo Horizonte', phone: '5531991110001', rating: 4.9, reviews: 187, website: '',                          instagram: '@drcarlosmoura',    address: 'Savassi, Belo Horizonte' },
  { name: 'Dra. Ana Lima Ortodontia',          category: 'Ortodontista',           city: 'Belo Horizonte', phone: '5531991110002', rating: 4.8, reviews: 134, website: '',                          instagram: '@draanalima',       address: 'Funcionários, Belo Horizonte' },
  { name: 'Clínica São Miguel',                category: 'Clínica odontológica',   city: 'Belo Horizonte', phone: '5531991110003', rating: 4.7, reviews: 82,  website: '',                          instagram: '@clinicasaomiguel', address: 'Savassi, Belo Horizonte' },
  { name: 'Odonto Prime BH',                  category: 'Dentista',               city: 'Belo Horizonte', phone: '5531991110004', rating: 4.9, reviews: 144, website: '',                          instagram: '@odontoprimebh',    address: 'Funcionários, Belo Horizonte' },
  { name: 'Implante Center Minas',             category: 'Implantodontia',         city: 'Belo Horizonte', phone: '5531991110005', rating: 4.6, reviews: 58,  website: 'https://implantecenter.com', instagram: '',                address: 'Centro, Belo Horizonte' },
  { name: 'Dr. Rodrigo Faria Endodontia',      category: 'Endodontista',           city: 'Belo Horizonte', phone: '5531991110006', rating: 4.7, reviews: 61,  website: '',                          instagram: '@drrodrigofaria',   address: 'Lourdes, Belo Horizonte' },
  { name: 'Consultório Dra. Priscila Souza',   category: 'Dentista',               city: 'Belo Horizonte', phone: '5531991110007', rating: 4.5, reviews: 38,  website: '',                          instagram: '@drapriscila',      address: 'Buritis, Belo Horizonte' },
  { name: 'OrthoSmile Clínica Ortodôntica',    category: 'Clínica odontológica',   city: 'Belo Horizonte', phone: '5531991110008', rating: 4.8, reviews: 210, website: 'https://orthosmile.com.br', instagram: '@orthosmile',       address: 'Savassi, Belo Horizonte' },
  { name: 'Dr. Henrique Batista Odontologia',  category: 'Clínica odontológica',   city: 'Belo Horizonte', phone: '5531991110009', rating: 4.4, reviews: 29,  website: '',                          instagram: '',                  address: 'Pampulha, Belo Horizonte' },
  { name: 'Espaço Odonto Savassi',             category: 'Consultório odontológico',city:'Belo Horizonte', phone: '5531991110010', rating: 4.6, reviews: 74,  website: '',                          instagram: '@espacoodonto',     address: 'Savassi, Belo Horizonte' },
  { name: 'Dra. Fernanda Rocha Odontopediatria',category:'Odontopediatria',        city: 'Belo Horizonte', phone: '5531991110011', rating: 4.9, reviews: 103, website: '',                          instagram: '@drafernandarodha', address: 'Buritis, Belo Horizonte' },
  { name: 'Clínica Sorriso Perfeito',          category: 'Clínica odontológica',   city: 'Belo Horizonte', phone: '5531991110012', rating: 4.3, reviews: 47,  website: 'https://sorrisoperfeito.com',instagram: '@sorrisoperfeito',  address: 'Santa Efigênia, Belo Horizonte' },

  // ── ODONTOLOGIA · SÃO PAULO ───────────────────────────────────────────────
  { name: 'Dr. Paulo Mendes Implantes',        category: 'Implantodontista',       city: 'São Paulo',      phone: '5511991110013', rating: 4.8, reviews: 156, website: '',                          instagram: '@drpaulomendes',    address: 'Moema, São Paulo' },
  { name: 'Dra. Camila Torres Ortodontia',     category: 'Ortodontista',           city: 'São Paulo',      phone: '5511991110014', rating: 4.7, reviews: 89,  website: '',                          instagram: '@dracamilatorres',  address: 'Pinheiros, São Paulo' },
  { name: 'Clínica Oral Design SP',            category: 'Clínica odontológica',   city: 'São Paulo',      phone: '5511991110015', rating: 4.6, reviews: 112, website: 'https://oraldesign.com.br', instagram: '@oraldesign',       address: 'Moema, São Paulo' },
  { name: 'Consultório Dr. Felipe Alves',      category: 'Dentista',               city: 'São Paulo',      phone: '5511991110016', rating: 4.5, reviews: 43,  website: '',                          instagram: '@drfelipealves',    address: 'Vila Mariana, São Paulo' },

  // ── ESTÉTICA · BELEZA ─────────────────────────────────────────────────────
  { name: 'Studio Bella Savassi',              category: 'Salão de beleza',         city: 'Belo Horizonte', phone: '5531991110017', rating: 4.8, reviews: 178, website: '',                          instagram: '@studiobella',      address: 'Savassi, Belo Horizonte' },
  { name: 'Espaço Harmony Estética',           category: 'Clínica de estética',     city: 'Belo Horizonte', phone: '5531991110018', rating: 4.7, reviews: 93,  website: '',                          instagram: '@harmonyestetica',  address: 'Lourdes, Belo Horizonte' },
  { name: 'Barbearia Kings BH',                category: 'Barbearia',               city: 'Belo Horizonte', phone: '5531991110019', rating: 4.9, reviews: 241, website: '',                          instagram: '@kingsbarberbh',    address: 'Funcionários, Belo Horizonte' },
  { name: 'Clínica Dra. Renata Harmonia',      category: 'Harmonização facial',     city: 'São Paulo',      phone: '5511991110020', rating: 4.9, reviews: 302, website: 'https://harmoniaface.com', instagram: '@drarenataharmon', address: 'Moema, São Paulo' },
  { name: 'Nail Studio SP',                    category: 'Nail designer',           city: 'São Paulo',      phone: '5511991110021', rating: 4.6, reviews: 67,  website: '',                          instagram: '@nailstudiosp',     address: 'Pinheiros, São Paulo' },
  { name: 'Espaço Depil Laser BH',             category: 'Depilação a laser',       city: 'Belo Horizonte', phone: '5531991110022', rating: 4.5, reviews: 54,  website: '',                          instagram: '@depillaserbh',     address: 'Buritis, Belo Horizonte' },

  // ── SAÚDE · CLÍNICAS MÉDICAS ──────────────────────────────────────────────
  { name: 'Clínica Vida Plena BH',             category: 'Clínica médica',          city: 'Belo Horizonte', phone: '5531991110023', rating: 4.6, reviews: 128, website: '',                          instagram: '@vidaplaenabh',     address: 'Sion, Belo Horizonte' },
  { name: 'Dr. Marcelo Pinto Cardiologista',   category: 'Cardiologista',           city: 'Belo Horizonte', phone: '5531991110024', rating: 4.8, reviews: 71,  website: '',                          instagram: '',                  address: 'Savassi, Belo Horizonte' },
  { name: 'Fisio Movimento SP',                category: 'Fisioterapia',            city: 'São Paulo',      phone: '5511991110025', rating: 4.7, reviews: 88,  website: '',                          instagram: '@fisiomovimento',   address: 'Vila Mariana, São Paulo' },
  { name: 'Dra. Juliana Melo Nutrição',        category: 'Nutricionista',           city: 'São Paulo',      phone: '5511991110026', rating: 4.5, reviews: 45,  website: '',                          instagram: '@drajulianamelo',   address: 'Moema, São Paulo' },
  { name: 'Psicóloga Dra. Beatriz Lima',       category: 'Psicólogo',              city: 'Belo Horizonte', phone: '5531991110027', rating: 4.9, reviews: 56,  website: '',                          instagram: '@drabeaatrizlima',  address: 'Funcionários, Belo Horizonte' },

  // ── ACADEMIA · FITNESS ────────────────────────────────────────────────────
  { name: 'CrossFit Savassi',                  category: 'CrossFit',               city: 'Belo Horizonte', phone: '5531991110028', rating: 4.8, reviews: 143, website: 'https://crossfitsavassi.com',instagram: '@crossfitsavassi', address: 'Savassi, Belo Horizonte' },
  { name: 'Studio Pilates Lourdes',            category: 'Pilates',                city: 'Belo Horizonte', phone: '5531991110029', rating: 4.9, reviews: 97,  website: '',                          instagram: '@studiopilates',    address: 'Lourdes, Belo Horizonte' },
  { name: 'Academia Iron SP',                  category: 'Academia de ginástica',  city: 'São Paulo',      phone: '5511991110030', rating: 4.4, reviews: 201, website: '',                          instagram: '@ironacademia',     address: 'Santana, São Paulo' },
  { name: 'Personal Trainer Marcos Vieira',    category: 'Personal trainer',       city: 'Belo Horizonte', phone: '5531991110031', rating: 5.0, reviews: 32,  website: '',                          instagram: '@marcosvieiraft',   address: 'Buritis, Belo Horizonte' },

  // ── RESTAURANTES ──────────────────────────────────────────────────────────
  { name: 'Restaurante Dona Cota',             category: 'Restaurante',            city: 'Belo Horizonte', phone: '5531991110032', rating: 4.7, reviews: 318, website: '',                          instagram: '@donacotabh',       address: 'Centro, Belo Horizonte' },
  { name: 'Hamburgueria Black Bull',           category: 'Hamburgueria',           city: 'Belo Horizonte', phone: '5531991110033', rating: 4.6, reviews: 222, website: '',                          instagram: '@blackbullbh',      address: 'Savassi, Belo Horizonte' },
  { name: 'Pizzaria Napoli CWB',               category: 'Pizzaria',               city: 'Curitiba',       phone: '5541991110034', rating: 4.8, reviews: 156, website: '',                          instagram: '@napolipizzacwb',   address: 'Batel, Curitiba' },
  { name: 'Bar do Zé Batel',                   category: 'Bar',                    city: 'Curitiba',       phone: '5541991110035', rating: 4.5, reviews: 88,  website: '',                          instagram: '@bardoze',          address: 'Batel, Curitiba' },
  { name: 'Lanchonete Pão Quente SP',          category: 'Lanchonete',             city: 'São Paulo',      phone: '5511991110036', rating: 4.3, reviews: 67,  website: '',                          instagram: '',                  address: 'Santana, São Paulo' },

  // ── PET SHOP ──────────────────────────────────────────────────────────────
  { name: 'PetCare Savassi',                   category: 'Pet shop',               city: 'Belo Horizonte', phone: '5531991110037', rating: 4.8, reviews: 134, website: '',                          instagram: '@petcaresavassi',   address: 'Savassi, Belo Horizonte' },
  { name: 'Clínica Vet Dr. Bruno Alves',       category: 'Clínica veterinária',    city: 'Belo Horizonte', phone: '5531991110038', rating: 4.9, reviews: 88,  website: '',                          instagram: '@vetdrbruno',       address: 'Buritis, Belo Horizonte' },
  { name: 'Banho e Tosa Mimosos SP',           category: 'Banho e tosa',           city: 'São Paulo',      phone: '5511991110039', rating: 4.5, reviews: 43,  website: '',                          instagram: '@mimosossp',        address: 'Moema, São Paulo' },

  // ── MECÂNICA ──────────────────────────────────────────────────────────────
  { name: 'Auto Center Ribeiro BH',            category: 'Mecânica automotiva',    city: 'Belo Horizonte', phone: '5531991110040', rating: 4.6, reviews: 172, website: '',                          instagram: '@autocenterbh',     address: 'Contagem, Belo Horizonte' },
  { name: 'Oficina do Mota CWB',               category: 'Oficina mecânica',       city: 'Curitiba',       phone: '5541991110041', rating: 4.7, reviews: 91,  website: '',                          instagram: '',                  address: 'Portão, Curitiba' },

  // ── IMOBILIÁRIA ───────────────────────────────────────────────────────────
  { name: 'Viver Imóveis BH',                  category: 'Imobiliária',            city: 'Belo Horizonte', phone: '5531991110042', rating: 4.5, reviews: 63,  website: 'https://viverimoveis.com', instagram: '@viverimoveis',     address: 'Savassi, Belo Horizonte' },
  { name: 'Corretor Paulo Ramos',              category: 'Corretor de imóveis',    city: 'São Paulo',      phone: '5511991110043', rating: 4.8, reviews: 39,  website: '',                          instagram: '@pauloramoscorretor',address: 'Moema, São Paulo' },

  // ── ADVOCACIA ─────────────────────────────────────────────────────────────
  { name: 'Escritório Carvalho & Associados',  category: 'Escritório de advocacia', city: 'Belo Horizonte', phone: '5531991110044', rating: 4.6, reviews: 48,  website: '',                         instagram: '',                  address: 'Funcionários, Belo Horizonte' },
  { name: 'Dra. Michele Ferreira Advocacia',   category: 'Advogado',               city: 'São Paulo',      phone: '5511991110045', rating: 4.7, reviews: 31,  website: '',                          instagram: '@dramicheleferreira',address: 'Pinheiros, São Paulo' },

  // ── EDUCAÇÃO ──────────────────────────────────────────────────────────────
  { name: 'Colégio Aprender Mais',             category: 'Escola particular',      city: 'Belo Horizonte', phone: '5531991110046', rating: 4.8, reviews: 126, website: 'https://aprendermais.com', instagram: '@aprendermais',    address: 'Buritis, Belo Horizonte' },
  { name: 'Instituto de Idiomas Speak Up SP',  category: 'Escola de idiomas',      city: 'São Paulo',      phone: '5511991110047', rating: 4.5, reviews: 72,  website: '',                          instagram: '@speakupsp',        address: 'Santana, São Paulo' },
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
    terms: ['dentista', 'clínica odontológica', 'consultório odontológico', 'ortodontista', 'implantodontia', 'odontopediatria', 'endodontista', 'cirurgião dentista'],
    recommendation: 'Odontologia tende a funcionar bem para landing pages porque confiança local, Google Maps e WhatsApp influenciam a decisão do paciente.',
  },
  {
    match: ['estetica', 'estética', 'beleza', 'salao', 'salão', 'cabelereiro', 'cabeleireiro'],
    terms: ['salão de beleza', 'clínica de estética', 'barbearia', 'harmonização facial', 'depilação a laser', 'nail designer', 'spa urbano'],
    recommendation: 'Beleza e estética respondem bem a agendamento digital, prova social e captação pelo WhatsApp.',
  },
  {
    match: ['saude', 'saúde', 'clinica', 'clínica', 'medico', 'médico', 'fisioterapia', 'psicolog'],
    terms: ['clínica médica', 'consultório médico', 'fisioterapia', 'psicólogo', 'nutricionista', 'cardiologista', 'dermatologista', 'ginecologista'],
    recommendation: 'Serviços de saúde precisam transmitir confiança e reduzir atrito entre pesquisa e agendamento.',
  },
  {
    match: ['educacao', 'educação', 'escola', 'curso', 'colegio', 'colégio', 'idioma', 'ingles', 'inglês'],
    terms: ['escola particular', 'curso profissionalizante', 'escola de idiomas', 'reforço escolar', 'curso técnico', 'creche', 'pré-escola'],
    recommendation: 'Educação funciona melhor quando a abordagem fala de captação local e organização de matrículas.',
  },
  {
    match: ['restaurante', 'bar', 'comida', 'delivery', 'lanchonete', 'pizzaria', 'hamburguer', 'hamburgueria'],
    terms: ['restaurante', 'pizzaria', 'hamburgueria', 'lanchonete', 'bar', 'delivery de comida', 'café'],
    recommendation: 'Alimentação exige filtro mais cuidadoso para evitar leads de baixo ticket ou sem fit para o produto.',
  },
  {
    match: ['academia', 'fitness', 'personal', 'crossfit', 'pilates', 'musculacao', 'musculação'],
    terms: ['academia de ginástica', 'crossfit', 'pilates', 'personal trainer', 'musculação', 'studio fitness'],
    recommendation: 'Academias e estúdios fitness têm alta dependência de captação local e renovação de alunos.',
  },
  {
    match: ['advocacia', 'advogado', 'juridico', 'jurídico', 'escritorio juridico'],
    terms: ['escritório de advocacia', 'advogado', 'consultório jurídico', 'assessoria jurídica'],
    recommendation: 'Escritórios de advocacia precisam de credibilidade digital e captação de clientes qualificados.',
  },
  {
    match: ['contabilidade', 'contador', 'contabil', 'contábil', 'contabilista'],
    terms: ['escritório de contabilidade', 'contador', 'contabilidade empresarial', 'assessoria contábil'],
    recommendation: 'Contabilidade tem ciclo de vendas mais longo; abordagem consultiva funciona melhor.',
  },
  {
    match: ['imovel', 'imóvel', 'imobiliaria', 'imobiliária', 'corretor', 'aluguel', 'venda imovel'],
    terms: ['imobiliária', 'corretor de imóveis', 'administradora de imóveis', 'construtora'],
    recommendation: 'Imobiliárias dependem fortemente de presença digital local e captação de leads qualificados.',
  },
  {
    match: ['mecanica', 'mecânica', 'auto', 'automovel', 'automóvel', 'carro', 'oficina'],
    terms: ['mecânica automotiva', 'oficina mecânica', 'borracharia', 'funilaria', 'troca de óleo', 'auto center'],
    recommendation: 'Oficinas dependem de reputação local e captação via Google Maps — ótimo fit para landing page.',
  },
  {
    match: ['otica', 'ótica', 'oculos', 'óculos', 'oftalmologista'],
    terms: ['ótica', 'óculos', 'oftalmologista', 'lentes de contato', 'clínica oftalmológica'],
    recommendation: 'Óticas têm ticket médio alto e clientes recorrentes — boa oportunidade para captação estruturada.',
  },
  {
    match: ['farmacia', 'farmácia', 'drogaria', 'manipulacao', 'manipulação'],
    terms: ['farmácia', 'drogaria', 'farmácia de manipulação', 'farmácia popular'],
    recommendation: 'Farmácias independentes competem com redes e podem se beneficiar de presença digital local.',
  },
  {
    match: ['petshop', 'pet shop', 'veterinario', 'veterinário', 'animal', 'canil'],
    terms: ['pet shop', 'clínica veterinária', 'banho e tosa', 'veterinário', 'canil', 'adestramento'],
    recommendation: 'Pet shops e clínicas veterinárias têm clientes fiéis e WhatsApp como canal principal.',
  },
  {
    match: ['arquitetura', 'arquiteto', 'engenharia', 'engenheiro', 'construcao', 'construção', 'obra'],
    terms: ['arquiteto', 'escritório de arquitetura', 'engenheiro civil', 'construtora', 'reforma e construção'],
    recommendation: 'Profissionais de construção e arquitetura dependem de portfólio e captação por indicação.',
  },
  {
    match: ['fotografia', 'fotografo', 'fotógrafo', 'video', 'vídeo', 'producao audiovisual'],
    terms: ['fotógrafo profissional', 'estúdio fotográfico', 'produtora audiovisual', 'videomaker'],
    recommendation: 'Fotógrafos e produtoras dependem fortemente de portfólio online e captação por redes sociais.',
  },
  {
    match: ['hotel', 'pousada', 'hostel', 'hospedagem', 'turismo'],
    terms: ['hotel', 'pousada', 'hostel', 'resort', 'agência de turismo'],
    recommendation: 'Hospedagem tem alta dependência de presença digital e avaliações para converter visitantes.',
  },
  {
    match: ['marketing', 'agencia', 'agência', 'publicidade', 'social media', 'trafego', 'tráfego'],
    terms: ['agência de marketing digital', 'agência de publicidade', 'gestão de redes sociais', 'tráfego pago'],
    recommendation: 'Agências de marketing são clientes sofisticados — abordagem deve focar em diferencial técnico.',
  },
]

const defaultTerms = ['empresa local', 'prestador de serviço', 'serviços profissionais', 'negócio local']

const scaleToQuantity = { moderada: 40, grande: 80, ampla: 120 }

// Quantos bairros cobrir por escala — mais bairros = mais leads únicos no Google Maps
const scaleToNeighborhoodCount = { moderada: 4, grande: 8, ampla: 14 }

// Quantos termos do segmento usar nas buscas por bairro
const scaleToTermsPerNeighborhood = { moderada: 2, grande: 3, ampla: 5 }

const regionNeighborhoods = {
  'belo horizonte': ['Savassi', 'Funcionários', 'Lourdes', 'Buritis', 'Pampulha', 'Santa Efigênia', 'Sion', 'Barreiro', 'Venda Nova', 'Contagem', 'Betim', 'Nova Lima', 'Ibirité', 'Ribeirão das Neves'],
  'são paulo': ['Moema', 'Vila Mariana', 'Pinheiros', 'Santana', 'Tatuapé', 'Lapa', 'Santo André', 'Osasco', 'Guarulhos', 'Itaquera', 'São Bernardo', 'Mauá', 'Diadema', 'Carapicuíba'],
  'rio de janeiro': ['Barra da Tijuca', 'Botafogo', 'Tijuca', 'Copacabana', 'Ipanema', 'Méier', 'Campo Grande', 'Niterói', 'Madureira', 'Jacarepaguá', 'Nova Iguaçu', 'Belford Roxo', 'São Gonçalo', 'Duque de Caxias'],
  'curitiba': ['Batel', 'Água Verde', 'Portão', 'Boa Vista', 'Pinhais', 'São José dos Pinhais', 'Colombo', 'Campo Largo', 'Fazenda Rio Grande', 'Almirante Tamandaré', 'Araucária', 'Piraquara', 'Quatro Barras', 'Campina Grande do Sul'],
  'fortaleza': ['Meireles', 'Aldeota', 'Fátima', 'Messejana', 'Maraponga', 'Montese', 'Caucaia', 'Maracanaú', 'Eusébio', 'Aquiraz'],
  'salvador': ['Barra', 'Pituba', 'Itaigara', 'Brotas', 'Liberdade', 'Lauro de Freitas', 'Camaçari', 'Feira de Santana'],
  'recife': ['Boa Viagem', 'Casa Forte', 'Graças', 'Aflitos', 'Olinda', 'Caruaru', 'Paulista', 'Jaboatão'],
  'porto alegre': ['Moinhos de Vento', 'Bela Vista', 'Menino Deus', 'Canoas', 'Novo Hamburgo', 'São Leopoldo', 'Gravataí', 'Alvorada'],
  'manaus': ['Adrianópolis', 'Chapada', 'Nossa Senhora das Graças', 'Aleixo', 'Ponta Negra', 'Flores'],
  'brasilia': ['Asa Norte', 'Asa Sul', 'Taguatinga', 'Ceilândia', 'Sobradinho', 'Gama', 'Samambaia', 'Águas Claras'],
}

function getNeighborhoods(region) {
  const normalized = normalizeKey(region)
  for (const [key, neighborhoods] of Object.entries(regionNeighborhoods)) {
    if (normalized.includes(normalizeKey(key))) return neighborhoods
  }
  return []
}

export function buildProspectingPreview({ prompt = '', preset = '', presets: selectedPresetIds = [], product = '', region = '', quantity, scale = 'grande', criteria = {} }, store, user) {
  const resolvedQuantity = quantity ?? scaleToQuantity[scale] ?? 80
  const presetIds = selectedPresetIds.length ? selectedPresetIds : (preset ? [preset] : [])
  const activePresets = presetIds.map((id) => presets[id]).filter(Boolean)
  const parsed = parsePrompt(prompt)
  const targetProduct = product !== undefined && product !== null ? product : (activePresets[0]?.product || parsed.product || '')
  const targetRegion = region || parsed.region || 'Belo Horizonte'
  const targetAudience = (parsed.audience && parsed.audience.length > 2 ? parsed.audience : null) || activePresets.map((p) => p.label).join(', ') || 'negócios locais'
  const expansion = findExpansion(prompt)
  const isGenericSearch = !expansion
  const baseTerms = expansion?.terms || expandGenericAudience(targetAudience)
  const desiredQuantity = clamp(Number(resolvedQuantity) || 80, 10, 200)

  // keywords geradas como um profissional buscaria no Google Maps:
  // 1. todos os termos do segmento na cidade
  // 2. termos × bairros (cobertura geográfica ampla)
  // 3. variações sem "em" para capturar resultados distintos
  const allNeighborhoods = getNeighborhoods(targetRegion)
  const nbCount = scaleToNeighborhoodCount[scale] || 8
  const termsPerNb = scaleToTermsPerNeighborhood[scale] || 3
  const activeNeighborhoods = allNeighborhoods.slice(0, nbCount)

  const cityKeywords = baseTerms.flatMap((term) => [
    `${term} em ${targetRegion}`,
    `${term} ${targetRegion}`,
  ])

  const neighborhoodKeywords = activeNeighborhoods.flatMap((nb) =>
    baseTerms.slice(0, termsPerNb).map((term) => `${term} em ${nb}`),
  )

  const keywords = [...new Set([...cityKeywords, ...neighborhoodKeywords])]

  const alreadySeen = countSeenLeads(store, keywords)
  const apiCalls = keywords.length
  // estimativa real: ~12 resultados por chamada no Google Maps, ~40% únicos após dedup
  // desses únicos, ~35-65% passam nos critérios de qualidade
  const estimatedRaw = apiCalls * 12
  const estimatedUnique = Math.round(estimatedRaw * 0.4)
  const usefulMin = Math.max(5, Math.round(estimatedUnique * 0.35))
  const usefulMax = Math.max(usefulMin + 10, Math.round(estimatedUnique * 0.65))

  const mergedPains = [
    ...(activePresets.length ? activePresets.flatMap((p) => p.pains) : []),
    ...parsed.pains,
    ...(activePresets.length === 0 && parsed.pains.length === 0 ? inferPains(targetProduct, criteria) : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i)

  const isProductless = !targetProduct
  const objective = isProductless
    ? prompt || `Mapear ${targetAudience} em ${targetRegion} identificando problemas e oportunidades sem oferta definida.`
    : activePresets.length
      ? activePresets.map((p) => p.intent).join(' ')
      : prompt || `Encontrar ${targetAudience} em ${targetRegion} com sinais comerciais para ${targetProduct}.`

  return {
    id: createId('preview'),
    createdBy: user.id,
    prompt,
    presets: presetIds,
    strategy: {
      product: targetProduct,
      audience: targetAudience,
      region: targetRegion,
      objective,
      pains: mergedPains,
      keywords,
      isGenericSearch,
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
  const keywords = preview.strategy.keywords  // usa todas as keywords aprovadas no preview
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

  // Enriquecimento CNPJ assíncrono — fire-and-forget, falhas são silenciosas
  const leadsToEnrich = analyzed.leads.filter((l) => !l.cnpj && l.availability === 'pending_approval')
  if (leadsToEnrich.length > 0) {
    enrichLeadsInBackground(leadsToEnrich).catch(() => {})
  }

  return { run, leads: analyzed.leads }
}

async function enrichLeadsInBackground(leads) {
  for (const lead of leads) {
    try {
      const cnpjData = await searchCnpjByName(lead.name, lead.city)
      if (!cnpjData) continue
      // Re-read store to get latest state before writing
      const store = await readStore()
      const storedLead = store.leadPool.find((l) => l.id === lead.id)
      if (!storedLead || storedLead.cnpj) continue
      storedLead.cnpj = cnpjData.cnpj
      storedLead.cnpjRazaoSocial = cnpjData.razaoSocial
      storedLead.cnpjPorte = cnpjData.porte
      storedLead.cnpjCapitalSocial = cnpjData.capitalSocial
      storedLead.cnpjDataAbertura = cnpjData.dataAbertura
      storedLead.cnpjSituacao = cnpjData.situacao
      storedLead.cnpjCnae = cnpjData.cnae
      storedLead.cnpjSocios = cnpjData.socios || []
      if (cnpjData.email && !storedLead.email) storedLead.email = cnpjData.email
      await writeStore(store)
      // Small delay to avoid hammering the API
      await new Promise((r) => setTimeout(r, 800))
    } catch {
      // silent
    }
  }
}

export function generateApproach(lead, product = lead.product) {
  const cityPart = lead.city ? ` em ${lead.city}` : ''
  const sitePart = lead.website
    ? 'vi que vocês já têm presença digital, mas dá para deixar a captação mais direta'
    : 'não encontrei um site próprio para captar contatos de forma mais profissional'

  if (!product) {
    return `Oi, tudo bem? Aqui é da Codexy. Encontrei a ${lead.name}${cityPart} pelo Google e ${sitePart}. Faço um diagnóstico rápido de presença digital para empresas do setor de ${lead.category} e queria entender como vocês captam clientes hoje. Posso te fazer duas perguntas rápidas?`
  }

  return `Oi, tudo bem? Aqui é da Codexy. Encontrei a ${lead.name}${cityPart} pelo Google e ${sitePart}. A gente ajuda empresas como a de vocês com ${product} para transformar visitas do Google e Instagram em pedidos pelo WhatsApp. Posso te mandar uma ideia rápida de como isso ficaria para a ${lead.name}?`
}

export function generateFollowUp(lead, step = 1) {
  const options = [
    'Passando só para complementar: a ideia não é trocar o WhatsApp de vocês, é criar um caminho mais claro para o cliente entender a oferta e chamar com mais confiança. Faz sentido eu te mostrar um exemplo?',
    `Vi que muitos clientes pesquisam antes de chamar no WhatsApp. Uma presença bem organizada pode ajudar a passar mais confiança e aumentar os contatos. Quer que eu te mande um modelo aplicado ao nicho de ${lead.category}?`,
    `Última mensagem para não te incomodar: se melhorar a captação digital for prioridade depois, posso montar um diagnóstico rápido da ${lead.name} sem custo. Posso deixar isso separado para você?`,
  ]

  return options[Math.min(step - 1, options.length - 1)]
}

const regionAliases = {
  'bh': 'Belo Horizonte', 'sp': 'São Paulo', 'rj': 'Rio de Janeiro',
  'cwb': 'Curitiba', 'poa': 'Porto Alegre', 'ssa': 'Salvador',
  'rec': 'Recife', 'for': 'Fortaleza', 'bsb': 'Brasília',
}

function parsePrompt(prompt) {
  const normalized = normalizeKey(prompt)

  // produto: detecta pela intenção, não pela presença de palavras genéricas
  const product = (normalized.includes('chatbot') || (normalized.includes('automacao') && normalized.includes('whatsapp')))
    ? 'DoctorChatbot'
    : normalized.includes('treinamento')
      ? 'LearnHub'
      : (normalized.includes('landing') || (normalized.includes('site') && normalized.includes('vender')))
        ? 'Landing Pages'
        : ''

  // região: captura após "em", "no" ou "na" antes de palavras de intenção
  const regionMatch = prompt.match(/\b(?:em|no|na)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇa-záàâãéêíóôõúç\s]{1,30}?)(?=\s+(?:que|com|sem|para|os|as|e\s)|[,.]|$)/)
  const rawRegion = regionMatch?.[1]?.trim() || ''
  const region = regionAliases[normalizeKey(rawRegion)] || rawRegion

  // nicho/público: extrai o tipo de negócio com word boundaries reais
  const intentWords = ['quero', 'vender', 'prospectar', 'encontrar', 'buscar', 'oferecer', 'ajudar',
    'podemos', 'entender', 'ligar', 'diagnosticar', 'pensar', 'ligar', 'captar',
    'landing', 'page', 'chatbot', 'site', 'whatsapp', 'automacao', 'automação',
    'treinamento', 'digital', 'dores', 'presença', 'captacao', 'captação']

  let audience = prompt
  for (const word of intentWords) {
    audience = audience.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ')
  }
  audience = audience
    .replace(rawRegion ? new RegExp(`\\b(?:em|no|na)\\s+${rawRegion}\\b`, 'gi') : /(?!)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(para|de|do|da|em|no|na|e|,)\s*/i, '')
    .trim()

  // dores: frases inteiras com contexto, não palavras soltas
  const pains = []
  if (/sem\s+site|n[aã]o\s+tem\s+site|n[aã]o\s+têm\s+site/.test(prompt)) pains.push('sem site')
  if (/s[oó]\s+instagram|apenas\s+instagram/.test(normalized)) pains.push('só instagram')
  if (/atendimento\s+manual|s[oó]\s+whatsapp/.test(normalized)) pains.push('atendimento manual no WhatsApp')
  if (/google.*fraca|fraca.*google|pouca.*presenca/.test(normalized)) pains.push('boa presença no Google, site fraco')

  return { product, region, audience, pains }
}

function findExpansion(text) {
  const normalized = normalizeKey(text)
  return segmentExpansions.find((item) => item.match.some((term) => normalized.includes(normalizeKey(term))))
}

function expandGenericAudience(audience) {
  // palavras que não descrevem um tipo de negócio buscável no Google Maps
  const nonBusinessWords = new Set([
    'para', 'com', 'que', 'nos', 'nas', 'dos', 'das', 'pelo', 'pela', 'nesse', 'neste',
    'locais', 'local', 'empresa', 'empresas', 'negocio', 'negocios',
    'digitais', 'digital', 'dores', 'presas', 'nao', 'tem', 'teem',
    'eles', 'elas', 'como', 'ajudar', 'identificar', 'problemas', 'leads',
    'quero', 'vender', 'prospectar', 'encontrar', 'buscar', 'oferecer',
    'podemos', 'entender', 'ligar', 'diagnosticar', 'pensar', 'captar',
    'landing', 'page', 'chatbot', 'site', 'whatsapp', 'automacao',
    'treinamento', 'presenca', 'captacao', 'produto', 'definido',
    'setor', 'nesses', 'pesquisa', 'precisa', 'pesquisar', 'apenas',
    'belo', 'horizonte', 'paulo', 'janeiro', 'curitiba', 'brasilia',
    'fortaleza', 'salvador', 'recife', 'porto', 'alegre', 'manaus',
  ])
  const words = normalizeKey(audience).split(' ')
    .filter((word) => word.length > 4 && !/^\d+$/.test(word) && !nonBusinessWords.has(word))
  if (!words.length) return defaultTerms
  return [...new Set([...words.slice(0, 2), ...defaultTerms])].filter(Boolean).slice(0, 8)
}

function inferPains(product, criteria) {
  if (product === 'DoctorChatbot') return ['atendimento manual', 'perda de contatos', 'triagem repetitiva']
  if (criteria?.site === 'weak') return ['site fraco', 'baixa conversão', 'pouca clareza comercial']
  return ['sem site', 'presença digital fraca', 'captação por WhatsApp']
}

async function searchKeyword(keyword, strategy) {
  if (process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY) return searchGooglePlaces(keyword, strategy)

  const cityStopwords = new Set(['belo', 'horizonte', 'paulo', 'janeiro', 'curitiba', 'fortaleza', 'salvador', 'recife', 'brasilia', 'manaus', 'porto', 'alegre'])
  const regionStopwords = new Set(['savassi', 'funcionarios', 'lourdes', 'buritis', 'pampulha', 'moema', 'pinheiros', 'santana', 'batel', 'meireles', 'barra', 'tijuca', 'botafogo'])

  // separa a keyword da localização (pode ser "termo em Bairro" ou "termo Cidade")
  const hasEm = keyword.includes(' em ')
  const searchPart = hasEm ? keyword.split(' em ')[0] : keyword.split(' ').slice(0, -1).join(' ')
  const locationPart = hasEm ? keyword.split(' em ')[1] : keyword.split(' ').slice(-1)[0]
  const isNeighborhoodSearch = locationPart && regionStopwords.has(normalizeKey(locationPart))

  const keyParts = normalizeKey(searchPart).split(' ')
    .filter((p) => p.length >= 3 && !cityStopwords.has(p) && !regionStopwords.has(p))

  const regionNorm = normalizeKey(strategy.region)

  const matched = sampleBusinesses.filter((business) => {
    const businessText = normalizeKey(`${business.name} ${business.category}`)
    const businessCity = normalizeKey(business.city)
    const cityMatch = regionNorm.split(' ').some((part) => part.length > 3 && businessCity.includes(part)) || businessCity === regionNorm
    const categoryMatch = keyParts.length === 0 || keyParts.some((part) => businessText.includes(part))
    return cityMatch && categoryMatch
  })

  // para buscas por bairro, simula que cada bairro tem um subconjunto diferente de negócios
  // isso replica o comportamento real do Google Maps (resultados distintos por localização)
  const results = isNeighborhoodSearch
    ? shuffleWithSeed(matched, normalizeKey(locationPart)).slice(0, 6)
    : matched.slice(0, 10)

  return results.map((business) => ({
    ...business,
    id: `mock_${normalizeKey(business.name).replace(/\s+/g, '_')}`,
    placeId: `mock_${normalizeKey(business.name).replace(/\s+/g, '_')}`,
    source: 'mock',
  }))
}

function shuffleWithSeed(arr, seed) {
  // embaralha deterministicamente pelo nome do bairro — mesmo bairro sempre devolve mesma lista
  const hash = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return [...arr].sort((a, b) => {
    const ha = (normalizeKey(a.name).charCodeAt(0) + hash) % 97
    const hb = (normalizeKey(b.name).charCodeAt(0) + hash) % 97
    return ha - hb
  })
}

// cache em memória por place_id — evita chamadas duplicadas de Details entre keywords
const placeDetailsCache = new Map()

const googlePlaceTypeMap = {
  dentist: 'Dentista', doctor: 'Médico', hospital: 'Hospital', physiotherapist: 'Fisioterapia',
  health: 'Clínica de saúde', pharmacy: 'Farmácia', veterinary_care: 'Clínica veterinária',
  beauty_salon: 'Salão de beleza', hair_care: 'Cabeleireiro', spa: 'Spa', gym: 'Academia',
  restaurant: 'Restaurante', food: 'Alimentação', bar: 'Bar', cafe: 'Café',
  meal_delivery: 'Delivery', bakery: 'Padaria', meal_takeaway: 'Delivery',
  lawyer: 'Advogado', accounting: 'Contabilidade',
  real_estate_agency: 'Imobiliária', lodging: 'Hotel', school: 'Escola',
  car_repair: 'Mecânica automotiva', pet_store: 'Pet shop',
  clothing_store: 'Loja de roupas', store: 'Loja', supermarket: 'Supermercado',
  insurance_agency: 'Seguradora', travel_agency: 'Agência de viagens',
}

async function fetchPlaceDetails(placeId, apiKey) {
  if (placeDetailsCache.has(placeId)) return placeDetailsCache.get(placeId)
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,international_phone_number,website&language=pt-BR&key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const details = {
      phone: (data.result?.international_phone_number || data.result?.formatted_phone_number || '')
        .replace(/[\s\-\(\)\+]/g, '').replace(/^55/, '55'),
      website: data.result?.website || '',
    }
    placeDetailsCache.set(placeId, details)
    return details
  } catch {
    return null
  }
}

async function searchGooglePlaces(keyword, strategy) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword)}&language=pt-BR&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Google Places falhou com status ${response.status}`)

  const data = await response.json()
  const places = (data.results || []).slice(0, 15)

  // busca detalhes em paralelo — usa cache para não repetir chamadas do mesmo place_id
  const detailed = await Promise.all(places.map(async (place) => {
    const details = await fetchPlaceDetails(place.place_id, apiKey)
    const rawType = place.types?.find((t) => googlePlaceTypeMap[t]) || place.types?.[0] || ''
    const category = googlePlaceTypeMap[rawType] || rawType.replace(/_/g, ' ') || strategy.audience
    return {
      id: place.place_id,
      placeId: place.place_id,
      name: place.name,
      category,
      city: strategy.region,
      phone: details?.phone || '',
      rating: place.rating || null,
      reviews: place.user_ratings_total || 0,
      website: details?.website || '',
      instagram: '',
      address: place.formatted_address || '',
      source: 'google_places',
    }
  }))

  return detailed
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
      status: lead.status || 'pending_approval',
      availability: activeAssignment ? 'active' : existing ? (lead.availability || 'available') : 'pending_approval',
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

  // cidade — penalidade dura se a cidade não bate com a região alvo
  const leadCity = normalizeKey(lead.city || '')
  const targetRegion = normalizeKey(strategy.region || '')
  const cityMatch = targetRegion.split(' ').some((part) => part.length > 3 && leadCity.includes(part)) || leadCity === targetRegion
  if (!cityMatch) {
    score -= 30
    warnings.push(`Cidade "${lead.city}" não corresponde à região alvo "${strategy.region}".`)
  }

  // categoria — compara contra os termos reais de busca (keywords), não o audience extraído
  const categoryText = normalizeKey(`${lead.name} ${lead.category}`)
  let categoryMatch = false
  if (strategy.isGenericSearch) {
    // busca aberta: qualquer negócio local na cidade certa é válido
    categoryMatch = true
    addScore(5, 'Busca ampla — qualquer negócio local é candidato.')
  } else {
    const searchTermWords = (strategy.keywords || [])
      .flatMap((kw) => normalizeKey(kw.split(' em ')[0]).split(' '))
      .concat(normalizeKey(strategy.audience).split(' '))
      .filter((word) => word.length >= 3)
    categoryMatch = [...new Set(searchTermWords)].some((word) => categoryText.includes(word))
    if (categoryMatch) addScore(15, 'Categoria compatível com a intenção da prospecção.')
    else {
      score -= 25
      warnings.push(`Categoria "${lead.category}" não corresponde ao público alvo "${strategy.audience}".`)
    }
  }

  if (lead.phone) addScore(12, 'Tem telefone/WhatsApp para abordagem direta.')
  else warnings.push('Sem telefone identificado no resultado inicial.')

  if (!lead.website) addScore(15, 'Não possui site identificado — oportunidade clara.')
  else addScore(4, 'Possui site, mas ainda pode ter oportunidade de conversão.')

  if ((lead.rating || 0) >= 4.5) addScore(10, 'Boa reputação no Google.')
  if ((lead.reviews || 0) >= 40) addScore(9, 'Volume relevante de avaliações.')

  if (alreadyKnown) warnings.push('Lead já estava na Base Geral; dados foram reaproveitados.')
  if (alreadyActive) warnings.push('Lead possui conversa ativa com outro vendedor.')

  const hasCriticalWarning = !cityMatch || !categoryMatch || !lead.phone

  const classification = alreadyActive
    ? 'already-active'
    : (!cityMatch || !categoryMatch)
      ? 'discarded'
      : score >= 78
        ? 'recommended'
        : score >= 55
          ? 'medium'
          : hasCriticalWarning
            ? 'discarded'
            : 'medium'

  const pain = !lead.website
    ? 'Depende do Google/Instagram, mas não tem uma página própria clara para converter interessados.'
    : 'Tem presença digital, mas pode melhorar clareza, prova e conversão para WhatsApp.'

  return {
    score: Math.max(0, Math.min(score, 98)),
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
