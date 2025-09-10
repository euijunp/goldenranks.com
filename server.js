const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3001;

const PAYPAL_WEBHOOK_ID = '0W109354GY895094X';

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

function checkDataConsistency(callback) {
  db.get(`SELECT COUNT(*) AS count FROM leaderboard WHERE amount != CAST(ROUND(amount) AS INTEGER)`, (err, row) => {
    if (err) {
      console.error('Error checking data consistency:', err);
      databaseError = err;
      isDatabaseReady = false;
      if (callback) callback(err);
      return;
    }
    if (row.count > 0) {
      console.log(`Found ${row.count} records with non-integer amounts. Fixing...`);
      db.run(`UPDATE leaderboard SET amount = CAST(ROUND(amount) AS INTEGER) WHERE amount != CAST(ROUND(amount) AS INTEGER)`, (updateErr) => {
        if (updateErr) {
          console.error('Error fixing non-integer amounts:', updateErr);
          databaseError = updateErr;
          isDatabaseReady = false;
        } else {
          console.log('Data consistency fixed successfully');
          isDatabaseReady = true;
        }
        if (callback) callback(updateErr);
      });
    } else {
      isDatabaseReady = true;
      if (callback) callback(null);
    }
  });
}


const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    databaseError = err;
    isDatabaseReady = false;
  } else {
    console.log('Connected to the database');
    db.serialize(() => {
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
              name TEXT NOT NULL,
              amount INTEGER NOT NULL,
              transaction_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              verified BOOLEAN DEFAULT FALSE,
              paypal_transaction_id TEXT
            )`, (createErr) => {
              if (createErr) {
                console.error('Error creating table:', createErr);
                databaseError = createErr;
              } else {
                isDatabaseReady = true;
                console.log('Leaderboard table created successfully');
              }
            });
          } else {
            console.log('Leaderboard table already exists. Checking schema...');
            db.all('PRAGMA table_info(leaderboard)', (infoErr, columns) => {
                if(infoErr) {
                    console.error('Error getting table info:', infoErr);
                    databaseError = infoErr;
                    isDatabaseReady = false;
                    return;
                }

                const afterMigration = () => {
                    const tasks = [];
                    const hasVerified = columns.some(col => col.name === 'verified');
                    const hasPaypalId = columns.some(col => col.name === 'paypal_transaction_id');

                    if (!hasVerified) {
                        tasks.push(new Promise((resolve, reject) => {
                            db.run('ALTER TABLE leaderboard ADD COLUMN verified BOOLEAN DEFAULT FALSE', (alterErr) => {
                                if (alterErr) return reject(alterErr);
                                console.log('Added verified column');
                                resolve();
                            });
                        }));
                    }
                    if (!hasPaypalId) {
                        tasks.push(new Promise((resolve, reject) => {
                            db.run('ALTER TABLE leaderboard ADD COLUMN paypal_transaction_id TEXT', (alterErr) => {
                                if (alterErr) return reject(alterErr);
                                console.log('Added paypal_transaction_id column');
                                resolve();
                            });
                        }));
                    }

                    Promise.all(tasks).then(() => {
                        console.log('Schema verification complete. Checking data consistency...');
                        checkDataConsistency((consistencyErr) => {
                            if (!consistencyErr) {
                                console.log('Database is ready.');
                            }
                        });
                    }).catch(migrationErr => {
                        console.error('Error during schema migration:', migrationErr);
                        databaseError = migrationErr;
                    });
                };
                
                const amountColumn = columns.find(col => col.name === 'amount');
                if (amountColumn && amountColumn.type !== 'INTEGER') {
                    console.log('Amount column type is not INTEGER. Migrating...');
                    db.exec(`
                        CREATE TABLE leaderboard_backup AS SELECT * FROM leaderboard;
                        DROP TABLE leaderboard;
                        CREATE TABLE leaderboard (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            amount INTEGER NOT NULL,
                            transaction_id TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            verified BOOLEAN DEFAULT FALSE,
                            paypal_transaction_id TEXT
                        );
                        INSERT INTO leaderboard (id, name, amount, transaction_id, created_at)
                        SELECT id, name, CAST(ROUND(amount) AS INTEGER), transaction_id, created_at FROM leaderboard_backup;
                        DROP TABLE leaderboard_backup;
                    `, (execErr) => {
                        if (execErr) {
                            console.error('Failed to migrate amount column type:', execErr);
                            databaseError = execErr;
                        } else {
                            console.log('Amount column migrated to INTEGER successfully.');
                            afterMigration();
                        }
                    });
                } else {
                    afterMigration();
                }
            });
          }
        });
    });
  }
});

app.get('/api/status', (req, res) => {
  if (databaseError) {
    console.error('Database error:', databaseError);
    return res.status(500).json({ status: 'error', message: 'Database connection failed', error: databaseError.message });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({ status: 'maintenance', message: 'Database is initializing' });
  }
  res.json({ status: 'ok', message: 'Server is ready' });
});

paypal.configure({
  'mode': 'sandbox',
  'client_id': 'AZ4L109sFRic_gBGPoiTkEHNCOSC8Jx3t1w-hVjKUdX8-vdmATo5YfPKUMLXQ0YZuo39aTQJM4KZIjeL',
  'client_secret': 'EJ5aAASM0zji23dCWV8T9z-sSSK6tDV7tOQrwrIfApVQEZDBg9eyn2gqBHXleUyRYhVzT8OamRgOdfjh'
});

app.use(cors({ origin: 'https://goldenranks.com', credentials: true }));

app.post('/api/webhook/paypal', bodyParser.raw({ type: 'application/json' }), (req, res) => {
    const webhookEvent = JSON.parse(req.body.toString());
    const headers = req.headers;

    paypal.notification.webhookEvent.verify(headers, webhookEvent, PAYPAL_WEBHOOK_ID, function (error, response) {
        if (error) {
            console.error('Webhook verification failed:', error.response || error);
            res.status(400).send('Webhook verification failed.');
            return;
        }
        
        if (response.verification_status === 'SUCCESS') {
            const event = webhookEvent.resource;
            if (webhookEvent.event_type === 'PAYMENT.SALE.COMPLETED') {
                const transactionId = event.id;
                
                const fullInvoiceNumber = event.invoice_number;
                if (!fullInvoiceNumber || !fullInvoiceNumber.includes('__')) {
                    console.error('Webhook Error: Invalid invoice_number format.');
                    return res.status(400).send('Invalid invoice_number format.');
                }
                const name = fullInvoiceNumber.split('__')[0];
                
                const sql = `UPDATE leaderboard SET verified = TRUE WHERE paypal_transaction_id = ? AND verified = FALSE AND name = ?`;
                const params = [transactionId, name];

                db.run(sql, params, function(err) {
                    if (err) {
                        console.error('DB Error on webhook processing (UPDATE):', err);
                    } else if (this.changes === 0) {
                        console.warn(`Webhook received for transaction ${transactionId}, but no matching unverified entry was found.`);
                    } else {
                        console.log(`Leaderboard entry updated to VERIFIED for transaction: ${transactionId}`);
                    }
                });
            }
            res.status(200).send('Webhook received and processed.');
        } else {
            console.error('Webhook verification status not SUCCESS.');
            res.status(400).send('Webhook verification status not SUCCESS.');
        }
    });
});

app.use(bodyParser.json());

app.get('/api/leaderboard', (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });

  const sql = `
    SELECT
      name,
      SUM(amount) as amount,
      MAX(created_at) as created_at,
      MIN(verified) as verified,
      MAX(paypal_transaction_id) as paypal_transaction_id
    FROM leaderboard
    WHERE verified = TRUE
    GROUP BY name
    ORDER BY amount DESC, created_at DESC
    LIMIT 24;
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Database query failed', details: err.message });
    }
    console.log(`Fetched and aggregated ${rows.length} leaderboard entries`);
    res.json(rows);
  });
});

app.post('/api/create-payment', (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });
  const { name, amount } = req.body;
  if (!name || name.length > 64) return res.status(400).json({ error: 'Invalid name' });
  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt < 1 || amountInt > 1000000) return res.status(400).json({ error: 'Invalid amount' });
  
  const uniqueInvoiceNumber = `${name}__${Date.now()}`;

  const create_payment_json = {
    "intent": "sale",
    "payer": { "payment_method": "paypal" },
    "redirect_urls": {
      "return_url": "https://goldenranks.com/",
      "cancel_url": "https://goldenranks.com/"
    },
    "transactions": [{
      "amount": { "currency": "USD", "total": amountInt.toString() },
      "description": `Leaderboard entry for ${name}`,
      "invoice_number": uniqueInvoiceNumber
    }]
  };

  paypal.payment.create(create_payment_json, function (error, payment) {
    if (error) {
      console.error('PayPal API Error:', error);
      return res.status(500).json({ error: 'Payment creation failed' });
    } else {
      res.json({ approvalUrl: payment.links.find(link => link.rel === 'approval_url').href });
    }
  });
});

app.get('/api/execute-payment', (req, res) => {
    if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });
    const { paymentId, PayerID, amount } = req.query;
    
    const execute_payment_json = {
        "payer_id": PayerID,
        "transactions": [{ "amount": { "currency": "USD", "total": amount.toString() } }]
    };

    paypal.payment.execute(paymentId, execute_payment_json, function (error, payment) {
        if (error) {
            console.error('PayPal Execute Error:', error.response || error);
            return res.status(500).json({ error: 'Payment execution failed' });
        } else {
            try {
                const fullInvoiceNumber = payment.transactions[0].invoice_number;
                if (!fullInvoiceNumber || !fullInvoiceNumber.includes('__')) {
                    throw new Error('Invalid invoice_number format in payment execution response.');
                }
                const name = fullInvoiceNumber.split('__')[0];
                const paidAmount = payment.transactions[0].amount.total;
                const transactionId = payment.transactions[0].related_resources[0].sale.id;

                const sql = `INSERT INTO leaderboard (name, amount, paypal_transaction_id, verified) VALUES (?, ?, ?, FALSE)`;
                const params = [name, paidAmount, transactionId];

                db.run(sql, params, function(insertErr) {
                    if (insertErr) {
                        console.error('DB Error on execute-payment (INSERT):', insertErr);
                        return res.json({ success: true, message: 'Payment executed, but DB entry failed. Webhook will reconcile.' });
                    }
                    console.log(`Leaderboard PENDING entry created for user: ${name}, transaction: ${transactionId}`);
                    res.json({ success: true });
                });
            } catch (e) {
                console.error('Error processing successful payment:', e);
                res.status(500).json({ error: 'Payment processed but failed to record. Please contact support.' });
            }
        }
    });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database path: ${dbPath}`);
  fixDatabasePermissions();
});