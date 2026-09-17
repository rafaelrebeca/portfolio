CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  fire_expenses REAL
);

-- Initial admin user (username: admin, password: admin)
INSERT OR IGNORE INTO users (id, username, password_hash, role)
VALUES (1, 'admin', '$2b$12$4Pwb0vnEsbsuL8wKGioGouxU8c0pGXzw1xP3v2CHdm1ZnbPB7mla2', 'admin');

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'broker', 'other')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS asset_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);
INSERT INTO asset_type ("id","type","label") VALUES(1,'stock','Stock');
INSERT INTO asset_type ("id","type","label") VALUES(2,'bond','Bond');
INSERT INTO asset_type ("id","type","label") VALUES(3,'etf','ETF');
INSERT INTO asset_type ("id","type","label") VALUES(4,'cfd','CFD');
INSERT INTO asset_type ("id","type","label") VALUES(5,'commodity','Commodity');
INSERT INTO asset_type ("id","type","label") VALUES(6,'crypto','Crypto');

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  symbol TEXT,
  type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  price REAL,
  coin TEXT,
  dividend_yield REAL
);

CREATE TABLE IF NOT EXISTS personal_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT,
  type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  price REAL,
  coin TEXT,
  dividend_yield REAL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('loan', 'interest_account', 'bank_account', 'asset_account')),
  balance REAL,
  interest_rate REAL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  coin TEXT,
  finish_date TEXT
);

CREATE TABLE IF NOT EXISTS account_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  purchase_price REAL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  personal_asset_id INTEGER REFERENCES personal_assets(id) ON DELETE CASCADE,
  UNIQUE (account_id, asset_id, personal_asset_id)
);

CREATE TABLE IF NOT EXISTS dividend_payment_months (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  month_paid INTEGER NOT NULL CHECK (month_paid BETWEEN 1 AND 12),
  UNIQUE (asset_id, month_paid)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  goal_name TEXT NOT NULL,
  value REAL NOT NULL,
  coin TEXT NOT NULL,
  sub1 REAL,
  sub2 REAL,
  sub3 REAL,
  order_by INTEGER,
  end_date TEXT
);

CREATE TABLE IF NOT EXISTS goal_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE ON UPDATE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS currency (
  coin TEXT PRIMARY KEY,
  value REAL NOT NULL
);
INSERT OR IGNORE INTO currency (coin, value) VALUES ('USD', 1.0), ('EUR', 0.8639);

CREATE TABLE IF NOT EXISTS update_story (
  what TEXT PRIMARY KEY,
  "when" TEXT NOT NULL
);
INSERT INTO update_story ("what","when") VALUES('CURRENCY','20260101000000');

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TRIGGER IF NOT EXISTS trg_assets_updated AFTER UPDATE OF name, symbol, type, price, coin ON assets
FOR EACH ROW BEGIN
  UPDATE assets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_p_assets_updated AFTER UPDATE OF name, symbol, type, price, coin ON personal_assets
FOR EACH ROW BEGIN
  UPDATE personal_assets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated AFTER UPDATE OF provider_id, name, type, balance, interest_rate ON accounts
FOR EACH ROW BEGIN
  UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
