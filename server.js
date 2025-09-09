const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3001;

const DB_DIR = '/var/lib/goldenranks';
const dbPath = '/var/lib/goldenranks/goldenranks.db';
console.log('Using database at:', dbPath);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log('Created database directory:', DB_DIR);
}

function fixDatabasePermissions() {
  try {
    fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    console.log('Database file permissions OK');
  } catch (err) {
    console.error('Database file permission error:', err);
    try {
      fs.chownSync(dbPath, 0, 0);
      fs.chmodSync(dbPath, 0o644);
      console.log('Database file permissions restored');
    } catch (fixErr) {
      console.error('Failed to fix database permissions:', fixErr);
    }
  }
}

let isDatabaseReady = false;
let databaseError = null;

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    databaseError = err;
    isDatabaseReady = false;
  } else {
    console.log('Connected to the database');
    db.serialize(() => {
      db.run(`DROP TABLE IF EXISTS leaderboard_backup; VACUUM;`, (err) => {
        if (err) {
          console.error('Critical error dropping backup table:', err);
          databaseError = err;
          isDatabaseReady = false;
        }
        db.get(`SELECT count(*) AS cnt FROM sqlite_master WHERE type='table' AND name='leaderboard'`, (err, row) => {
          if (err) {
            console.error('Error checking table:', err);
            databaseError = err;
            isDatabaseReady = false;
            return;
          }
          if (row.cnt === 0) {
            console.log('Creating leaderboard table...');
            db.run(`CREATE TABLE leaderboard (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              amount INTEGER NOT NULL,
              transaction_id TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
              if (err) {
                console.error('Error creating table:', err);
                databaseError = err;
                isDatabaseReady = false;
              } else {
                isDatabaseReady = true;
                console.log('Leaderboard table created successfully');
              }
            });
          } else {
            console.log('Leaderboard table already exists');
            db.all(`PRAGMA table_info(leaderboard)`, (err, columns) => {
              if (err) {
                console.error('Error getting table info:', err);
                databaseError = err;
                isDatabaseReady = false;
                return;
              }
              const amountColumn = columns.find(col => col.name === 'amount');
              const nameConstraint = columns.find(col => col.name === 'name' && col.pk === 1);
              if (amountColumn && amountColumn.type !== 'INTEGER') {
                console.log('Converting amount column to INTEGER...');
                db.run(`DROP TABLE IF EXISTS leaderboard_backup; VACUUM;`, (err) => {
                  if (err) {
                    console.error('Error dropping backup table:', err);
                    databaseError = err;
                    isDatabaseReady = false;
                    return;
                  }
                  db.run(`CREATE TABLE leaderboard_backup AS SELECT id, name, CAST(ROUND(amount) AS INTEGER) AS amount, transaction_id, created_at FROM leaderboard`, (err) => {
                    if (err) {
                      console.error('Error creating backup table:', err);
                      databaseError = err;
                      isDatabaseReady = false;
                      return;
                    }
                    db.run(`DROP TABLE leaderboard; VACUUM;`, (err) => {
                      if (err) {
                        console.error('Error dropping table:', err);
                        databaseError = err;
                        isDatabaseReady = false;
                        return;
                      }
                      db.run(`ALTER TABLE leaderboard_backup RENAME TO leaderboard`, (err) => {
                        if (err) {
                          console.error('Error renaming table:', err);
                          databaseError = err;
                          isDatabaseReady = false;
                          return;
                        }
                        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_name ON leaderboard(name)`, (err) => {
                          if (err) {
                            console.error('Error creating index:', err);
                            databaseError = err;
                            isDatabaseReady = false;
                          } else {
                            console.log('Amount column converted to INTEGER successfully');
                            checkDataConsistency();
                          }
                        });
                      });
                    });
                  });
                });
              } else {
                if (!nameConstraint) {
                  console.log('Adding UNIQUE constraint to name column...');
                  db.run(`DROP TABLE IF EXISTS leaderboard_backup; VACUUM;`, (err) => {
                    if (err) {
                      console.error('Error dropping backup table for unique constraint:', err);
                      databaseError = err;
                      isDatabaseReady = false;
                      return;
                    }
                    db.run(`CREATE TABLE leaderboard_backup AS SELECT id, name, amount, transaction_id, created_at FROM leaderboard GROUP BY name`, (err) => {
                      if (err) {
                        console.error('Error creating backup table for unique constraint:', err);
                        databaseError = err;
                        isDatabaseReady = false;
                        return;
                      }
                      db.run(`DROP TABLE leaderboard; VACUUM;`, (err) => {
                        if (err) {
                          console.error('Error dropping table for unique constraint:', err);
                          databaseError = err;
                          isDatabaseReady = false;
                          return;
                        }
                        db.run(`ALTER TABLE leaderboard_backup RENAME TO leaderboard`, (err) => {
                          if (err) {
                            console.error('Error renaming table for unique constraint:', err);
                            databaseError = err;
                            isDatabaseReady = false;
                            return;
                          }
                          db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_name ON leaderboard(name)`, (err) => {
                            if (err) {
                              console.error('Error creating unique index:', err);
                              databaseError = err;
                              isDatabaseReady = false;
                            } else {
                              console.log('UNIQUE constraint added to name column successfully');
                              checkDataConsistency();
                            }
                          });
                        });
                      });
                    });
                  });
                } else {
                  checkDataConsistency();
                }
              }
            });
          }
        });
      });
    });
  }
});

function checkDataConsistency() {
  db.get(`SELECT COUNT(*) AS count FROM leaderboard WHERE amount != CAST(ROUND(amount) AS INTEGER)`, (err, row) => {
    if (err) {
      console.error('Error checking data consistency:', err);
      databaseError = err;
      isDatabaseReady = false;
      return;
    }
    if (row.count > 0) {
      console.log(`Found ${row.count} records with non-integer amounts. Fixing...`);
      db.run(`UPDATE leaderboard SET amount = CAST(ROUND(amount) AS INTEGER) WHERE amount != CAST(ROUND(amount) AS INTEGER)`, (err) => {
        if (err) {
          console.error('Error fixing non-integer amounts:', err);
          databaseError = err;
          isDatabaseReady = false;
        } else {
          console.log('Data consistency fixed successfully');
          isDatabaseReady = true;
        }
      });
    } else {
      isDatabaseReady = true;
    }
  });
}

app.get('/api/status', (req, res) => {
  if (databaseError) {
    console.error('Database error:', databaseError);
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: databaseError.message
    });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({
      status: 'maintenance',
      message: 'Database is initializing'
    });
  }
  res.json({
    status: 'ok',
    message: 'Server is ready'
  });
});

paypal.configure({
  'mode': 'sandbox',
  'client_id': 'AZ4L109sFRic_gBGPoiTkEHNCOSC8Jx3t1w-hVjKUdX8-vdmATo5YfPKUMLXQ0YZuo39aTQJM4KjeL',
  'client_secret': 'EJ5aAASM0zji23dCWV8T9z-sSSK6tDV7tOQrwrIfApVQEZDBg9eyn2gqBHXleUyRYhVzT8OamRgOdfjh'
});

app.use(cors({
  origin: 'https://goldenranks.com',
  credentials: true
}));
app.use(bodyParser.json());

app.get('/api/leaderboard', (req, res) => {
  if (databaseError) {
    console.error('Database error when fetching leaderboard:', databaseError);
    return res.status(500).json({
      error: 'Database connection failed',
      details: databaseError.message
    });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({
      error: 'Database is initializing',
      details: 'Please try again in a few seconds'
    });
  }
  db.all(`SELECT name, CAST(ROUND(amount) AS INTEGER) AS amount, created_at FROM leaderboard ORDER BY amount DESC, created_at DESC LIMIT 24`, [], (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({
        error: 'Database query failed',
        details: err.message
      });
    }
    console.log(`Fetched ${rows.length} leaderboard entries`);
    res.json(rows);
  });
});

function checkDuplicateName(name, callback) {
  if (databaseError || !isDatabaseReady) {
    return callback(0);
  }
  db.get(`SELECT amount FROM leaderboard WHERE name = ?`, [name], (err, row) => {
    if (err) {
      console.error('Error checking duplicate name:', err);
      return callback(0);
    } else {
      callback(row ? row.amount : 0);
    }
  });
}

app.post('/api/create-payment', (req, res) => {
  if (databaseError) {
    console.error('Database error when creating payment:', databaseError);
    return res.status(500).json({
      error: 'Database connection failed',
      details: databaseError.message
    });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({
      error: 'Database is initializing',
      details: 'Please try again in a few seconds'
    });
  }
  const { name, amount } = req.body;
  if (!name || name.length > 64) {
    return res.status(400).json({
      error: 'Invalid name',
      details: 'Name must be between 1 and 64 characters'
    });
  }
  const amountInt = parseInt(amount);
  if (!amount || isNaN(amountInt) || amountInt < 1 || amountInt > 1000000 || amountInt.toString() !== amount.toString()) {
    return res.status(400).json({
      error: 'Invalid amount',
      details: 'Amount must be an integer between 1 and 1000000'
    });
  }
  const description = `Leaderboard entry for ${name.substring(0, 100)} ($${amountInt})`;
  const create_payment_json = {
    "intent": "sale",
    "payer": {
      "payment_method": "paypal"
    },
    "redirect_urls": {
      "return_url": "https://goldenranks.com/payment/success",
      "cancel_url": "https://goldenranks.com/payment/cancel"
    },
    "transactions": [{
      "item_list": {
        "items": [{
          "name": "GoldenRanks Entry",
          "sku": "001",
          "price": amountInt.toString(),
          "currency": "USD",
          "quantity": 1
        }]
      },
      "amount": {
        "currency": "USD",
        "total": amountInt.toString()
      },
      "description": description
    }]
  };
  paypal.payment.create(create_payment_json, function (error, payment) {
    if (error) {
      console.error('PayPal API Error:', error);
      return res.status(500).json({
        error: 'Payment creation failed',
        details: error.message
      });
    } else {
      const approvalUrl = payment.links.find(link => link.rel === 'approval_url').href;
      res.json({
        paymentId: payment.id,
        approvalUrl,
        name,
        amount: amountInt
      });
    }
  });
});

app.get('/api/execute-payment', (req, res) => {
  if (databaseError) {
    console.error('Database error when executing payment:', databaseError);
    return res.status(500).json({
      error: 'Database connection failed',
      details: databaseError.message
    });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({
      error: 'Database is initializing',
      details: 'Please try again in a few seconds'
    });
  }
  const { paymentId, payerId, name, amount } = req.query;
  if (!name || name.length > 64) {
    return res.status(400).json({
      error: 'Invalid name',
      details: 'Name must be between 1 and 64 characters'
    });
  }
  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt < 1 || amountInt.toString() !== amount.toString()) {
    return res.status(400).json({
      error: 'Invalid amount',
      details: 'Amount must be a positive integer'
    });
  }
  const execute_payment_json = {
    "payer_id": payerId,
    "transactions": [{
      "amount": {
        "currency": "USD",
        "total": amountInt.toString()
      }
    }]
  };
  paypal.payment.execute(paymentId, execute_payment_json, function (error, payment) {
    if (error) {
      console.error('PayPal Execute Error:', error);
      return res.status(500).json({
        error: 'Payment execution failed',
        details: error.message
      });
    } else {
      const transactionId = payment.id;
      checkDuplicateName(name, (existingAmount) => {
        let totalAmount;
        let sql, params;
        if (existingAmount > 0) {
          totalAmount = existingAmount + amountInt;
          sql = `UPDATE leaderboard SET amount = ?, transaction_id = ?, created_at = CURRENT_TIMESTAMP WHERE name = ?`;
          params = [totalAmount, transactionId, name];
        } else {
          totalAmount = amountInt;
          sql = `INSERT INTO leaderboard (name, amount, transaction_id) VALUES (?, ?, ?)`;
          params = [name, totalAmount, transactionId];
        }
        db.run(sql, params, function(err) {
          if (err) {
            console.error('DB Error:', err);
            return res.status(500).json({
              error: 'Database error',
              details: err.message
            });
          }
          console.log(`Successfully added user ${name} with amount ${totalAmount} to leaderboard`);
          res.json({
            success: true,
            transactionId,
            name,
            amount: totalAmount,
            timestamp: new Date().toISOString()
          });
        });
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database path: ${dbPath}`);
  fixDatabasePermissions();
  setTimeout(() => {
    if (!isDatabaseReady && !databaseError) {
      console.log('Database initialization taking longer than expected. Please check logs.');
      isDatabaseReady = true;
    }
  }, 5000);
});