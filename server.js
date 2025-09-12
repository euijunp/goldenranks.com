const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
const sqlite3 = require('sqlite3').verbose();
const path =require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = 3001;

// --- SECURITY-ENHANCEMENT: Environment variable checks ---
if (!process.env.SESSION_SECRET || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.error('FATAL ERROR: Required environment variables (SESSION_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) are not defined in the .env file.');
  process.exit(1);
}

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '0W109354GY895094X';

const DB_DIR = '/var/lib/goldenranks';
const dbPath = '/var/lib/goldenranks/goldenranks.db';
console.log('Using database at:', dbPath);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log('Created database directory:', DB_DIR);
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
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            verified BOOLEAN DEFAULT FALSE,
                            paypal_transaction_id TEXT
                        );
                        INSERT INTO leaderboard (id, name, amount, created_at, verified, paypal_transaction_id)
                        SELECT id, name, CAST(ROUND(amount) AS INTEGER), created_at, verified, paypal_transaction_id FROM leaderboard_backup;
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

app.use(helmet());
app.use(cors({ origin: 'https://goldenranks.com', credentials: true }));

// --- [BUG FIX] ---
// The PayPal webhook route is placed BEFORE the global bodyParser.json().
// This ensures that the webhook gets the raw request body it needs for verification,
// before any other middleware parses it as JSON.
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
// --- [END OF BUG FIX] ---

// This will now parse JSON for all other routes that come after it.
app.use(bodyParser.json());

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    httpOnly: true,
    secure: isProduction,
    maxAge: 60 * 60 * 1000
  }
}));

const rateLimitStore = {};
const apiRateLimiter = (req, res, next) => {
  const key = req.sessionID || req.ip;
  const now = Date.now();
  const limit = 60;
  const windowMs = 60 * 60 * 1000;

  if (!rateLimitStore[key] || now > rateLimitStore[key].resetTime) {
    rateLimitStore[key] = {
      count: 1,
      resetTime: now + windowMs,
    };
  } else {
    rateLimitStore[key].count++;
  }

  if (rateLimitStore[key].count > limit) {
    return res.status(429).send('You have exceeded the request limit. Please wait for an hour before trying again.');
  }

  next();
};

app.get('/api/status', (req, res) => {
  if (databaseError) {
    console.error('Database error on status check:', databaseError);
    return res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
  if (!isDatabaseReady) {
    return res.status(503).json({ status: 'maintenance', message: 'Database is initializing' });
  }
  res.json({ status: 'ok', message: 'Server is ready' });
});

paypal.configure({
  'mode': isProduction ? 'live' : 'sandbox',
  'client_id': process.env.PAYPAL_CLIENT_ID,
  'client_secret': process.env.PAYPAL_CLIENT_SECRET
});

app.get('/api/leaderboard', (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });

  const sql = `
    WITH RankedEntries AS (
      SELECT
        name,
        amount,
        created_at,
        verified,
        paypal_transaction_id,
        ROW_NUMBER() OVER(PARTITION BY name ORDER BY created_at DESC) as rn
      FROM leaderboard
      WHERE verified = TRUE
    ),
    AggregatedData AS (
      SELECT
        name,
        SUM(amount) as total_amount
      FROM leaderboard
      WHERE verified = TRUE
      GROUP BY name
    )
    SELECT
      ad.name,
      ad.total_amount as amount,
      re.created_at,
      re.verified,
      re.paypal_transaction_id
    FROM AggregatedData ad
    JOIN RankedEntries re ON ad.name = re.name AND re.rn = 1
    ORDER BY amount DESC, re.created_at DESC
    LIMIT 24;
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'An error occurred while fetching the leaderboard.' });
    }
    console.log(`Fetched and aggregated ${rows.length} leaderboard entries`);
    res.json(rows);
  });
});

app.get('/api/leaderboard/summary', (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });

  const sql = `
    WITH AggregatedData AS (
      SELECT
        SUM(amount) as total_amount
      FROM leaderboard
      WHERE verified = TRUE
      GROUP BY name
      ORDER BY total_amount DESC
    )
    SELECT
      COUNT(*) as userCount,
      SUM(total_amount) as totalAmount
    FROM (
      SELECT * FROM AggregatedData LIMIT -1 OFFSET 24
    );
  `;

  db.get(sql, [], (err, row) => {
    if (err) {
      console.error('Database summary query error:', err);
      return res.status(500).json({ error: 'An error occurred while fetching the summary.' });
    }
    res.json(row || { userCount: 0, totalAmount: 0 });
  });
});

app.get('/api/db', apiRateLimiter, (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });

  const page = parseInt(req.query.page, 10) || 1;
  const name = req.query.name || '';
  if (page < 1) {
    return res.status(400).json({ error: 'Invalid page number.' });
  }

  const limit = 100;
  const offset = (page - 1) * limit;

  let sql = `SELECT id, name, amount, created_at, verified, paypal_transaction_id FROM leaderboard`;
  const params = [];

  if (name) {
    sql += ` WHERE name LIKE ?`;
    params.push(`%${name}%`);
  }

  sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Database full view query error:', err);
      return res.status(500).json({ error: 'An error occurred while fetching database content.' });
    }
    res.json(rows);
  });
});

app.post('/api/create-payment', apiRateLimiter, (req, res) => {
  if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });

  const { name, amount } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 64) {
    return res.status(400).json({ error: 'Invalid name provided.' });
  }
  const amountInt = parseInt(amount, 10);
  if (isNaN(amountInt) || amountInt < 1 || amountInt > 1000000) {
    return res.status(400).json({ error: 'Invalid amount provided.' });
  }

  const sanitizedName = name.trim().replace(/[^a-zA-Z0-9 _-]/g, "");
  const uniqueInvoiceNumber = `${sanitizedName}__${Date.now()}`;

  const create_payment_json = {
    "intent": "sale",
    "payer": { "payment_method": "paypal" },
    "redirect_urls": {
      "return_url": "https://goldenranks.com/",
      "cancel_url": "https://goldenranks.com/"
    },
    "transactions": [{
      "amount": { "currency": "USD", "total": amountInt.toString() },
      "description": `Leaderboard entry for ${sanitizedName}`,
      "invoice_number": uniqueInvoiceNumber
    }]
  };

  paypal.payment.create(create_payment_json, function (error, payment) {
    if (error) {
      console.error('PayPal API Error:', error);
      return res.status(500).json({ error: 'Payment creation failed.' });
    } else {
      const approvalUrl = payment.links.find(link => link.rel === 'approval_url');
      if (approvalUrl) {
        res.json({ approvalUrl: approvalUrl.href });
      } else {
        console.error('PayPal Error: No approval URL found.');
        return res.status(500).json({ error: 'Could not retrieve payment URL.' });
      }
    }
  });
});

app.get('/api/execute-payment', apiRateLimiter, (req, res) => {
    if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });
    const { paymentId, PayerID, amount } = req.query;

    if (!paymentId || !PayerID || !amount) {
        return res.status(400).json({ error: 'Missing required payment parameters.' });
    }

    const execute_payment_json = {
        "payer_id": PayerID,
        "transactions": [{ "amount": { "currency": "USD", "total": amount.toString() } }]
    };

    paypal.payment.execute(paymentId, execute_payment_json, function (error, payment) {
        if (error) {
            console.error('PayPal Execute Error:', error.response || error);
            return res.status(500).json({ error: 'Payment execution failed.' });
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

const distPath = path.join(__dirname, '..', 'goldenranks', 'dist');
app.use(express.static(distPath));

app.get(/^.*/, (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  console.log(`Serving index.html for path: ${req.path}`);
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error(`index.html not found at path: ${indexPath}`);
    res.status(404).send('React build not found. Please check the path in server.js');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database path: ${dbPath}`);
  console.log(`[DEBUG] Serving static files from absolute path: ${path.resolve(distPath)}`);
});