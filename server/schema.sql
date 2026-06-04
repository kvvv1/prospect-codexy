-- Codexy Prospect — MySQL schema
-- Run once: mysql -u root -p codexy_prospect < server/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Comercial',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  evolution_instance_name VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_pool (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(500),
  category VARCHAR(255),
  city VARCHAR(255),
  phone VARCHAR(100),
  website VARCHAR(500),
  instagram VARCHAR(500),
  address TEXT,
  place_id VARCHAR(255),
  source VARCHAR(100),
  product VARCHAR(255),
  opportunity VARCHAR(255),
  pain TEXT,
  score INT DEFAULT 50,
  classification VARCHAR(50),
  agent_advice TEXT,
  status VARCHAR(50) DEFAULT 'available',
  availability VARCHAR(50) DEFAULT 'available',
  fingerprint VARCHAR(500),
  first_seen_at DATETIME,
  last_seen_at DATETIME,
  last_contact_at DATETIME,
  last_owner_id VARCHAR(100),
  discarded_reason TEXT,
  cnpj VARCHAR(20),
  cnpj_razao_social VARCHAR(500),
  cnpj_porte VARCHAR(100),
  cnpj_capital_social BIGINT,
  cnpj_data_abertura VARCHAR(50),
  cnpj_situacao VARCHAR(100),
  cnpj_cnae VARCHAR(100),
  email VARCHAR(255),
  rating DECIMAL(3,1),
  reviews INT DEFAULT 0,
  source_keywords JSON,
  campaign_ids JSON,
  found_by_ids JSON,
  score_reasons JSON,
  score_warnings JSON,
  cnpj_socios JSON,
  from_cache TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(100) PRIMARY KEY,
  lead_id VARCHAR(100) NOT NULL,
  owner_id VARCHAR(100) NOT NULL,
  campaign_id VARCHAR(100),
  stage VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  temperature VARCHAR(50),
  approach TEXT,
  next_action TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  released_at DATETIME,
  history JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100),
  lead_id VARCHAR(100),
  assignment_id VARCHAR(100),
  number VARCHAR(50),
  text TEXT,
  status VARCHAR(50),
  provider_status VARCHAR(100),
  source VARCHAR(100),
  campaign_id VARCHAR(100),
  campaign_name VARCHAR(500),
  variant_index INT,
  created_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS follow_ups (
  id VARCHAR(100) PRIMARY KEY,
  lead_id VARCHAR(100),
  owner_id VARCHAR(100),
  assignment_id VARCHAR(100),
  step INT DEFAULT 1,
  text TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  due_at DATETIME,
  created_at DATETIME,
  completed_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100),
  type VARCHAR(100),
  lead_id VARCHAR(100),
  lead_name VARCHAR(500),
  text TEXT,
  at DATETIME,
  is_read TINYINT(1) DEFAULT 0,
  extra_data JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id VARCHAR(100) PRIMARY KEY,
  at DATETIME,
  type VARCHAR(100),
  user_id VARCHAR(100),
  lead_id VARCHAR(100),
  assignment_id VARCHAR(100),
  run_id VARCHAR(100),
  text TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(500),
  client VARCHAR(500),
  value DECIMAL(15,2),
  tool VARCHAR(255),
  assignee VARCHAR(255),
  stage VARCHAR(100),
  notes TEXT,
  due_date VARCHAR(50),
  created_at DATETIME,
  updated_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS search_runs (
  id VARCHAR(100) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(100) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trojan_campaigns (
  id VARCHAR(100) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS search_cache (
  cache_key VARCHAR(500) PRIMARY KEY,
  data JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_health_results (
  lead_id VARCHAR(100) PRIMARY KEY,
  status INT,
  response_ms INT,
  error TEXT,
  url VARCHAR(500),
  checked_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS config (
  key_name VARCHAR(100) PRIMARY KEY,
  value JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
