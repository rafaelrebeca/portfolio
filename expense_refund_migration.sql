-- Run once on a database that already has the expenses table with CHECK (amount >= 0).
-- This rebuild preserves every expense row while removing that constraint.
BEGIN TRANSACTION;

CREATE TABLE expenses_with_refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  subcategory_id INTEGER REFERENCES expense_subcategories(id) ON DELETE CASCADE,
  expense_month TEXT NOT NULL CHECK (expense_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(expense_month, 6, 2) BETWEEN '01' AND '12'),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO expenses_with_refunds (id, user_id, category_id, subcategory_id, expense_month, amount, currency, created_at, updated_at)
SELECT id, user_id, category_id, subcategory_id, expense_month, amount, currency, created_at, updated_at
FROM expenses;

DROP TABLE expenses;
ALTER TABLE expenses_with_refunds RENAME TO expenses;

CREATE UNIQUE INDEX idx_expenses_monthly_bucket
  ON expenses(user_id, category_id, COALESCE(subcategory_id, 0), expense_month);
CREATE INDEX idx_expenses_user_month ON expenses(user_id, expense_month);

COMMIT;
