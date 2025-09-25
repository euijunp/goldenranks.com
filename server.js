const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3001;

if (!process.env.SESSION_SECRET || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.error('FATAL ERROR: Required environment variables are not defined in .env file.');
  process.exit(1);
}

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

const DB_DIR = '/var/lib/goldenranks';
const dbPath = path.join(DB_DIR, 'goldenranks.db');
console.log('Database path:', dbPath);

let isDatabaseReady = false;
let databaseError = null;

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    databaseError = err;
    isDatabaseReady = false;
    return;
  }
  console.log('Connected to the database.');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified BOOLEAN DEFAULT FALSE,
      paypal_transaction_id TEXT
    );
  `, (err) => {
    if (err) {
      console.error("Database table creation failed:", err.message);
      databaseError = err;
      isDatabaseReady = false;
      return;
    }
    console.log("Database schema checked/initialized.");
    isDatabaseReady = true;
    console.log("Database is ready.");
  });
});

app.use(helmet());
app.use(cors({ origin: 'https://goldenranks.com', credentials: true }));
app.use(bodyParser.json());
app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, secure: isProduction, maxAge: 60 * 60 * 1000 }
}));

const rateLimitStore = {};
const apiRateLimiter = (req, res, next) => {
    const key = req.sessionID || req.ip;
    const now = Date.now();
    const limit = 60;
    const windowMs = 60 * 60 * 1000;
    if (!rateLimitStore[key] || now > rateLimitStore[key].resetTime) {
        rateLimitStore[key] = { count: 1, resetTime: now + windowMs };
    } else {
        rateLimitStore[key].count++;
    }
    if (rateLimitStore[key].count > limit) {
        return res.status(429).send('You have exceeded the request limit.');
    }
    next();
};

let paypalAuthToken = { token: null, expiresAt: 0 };
async function getPayPalAccessToken() {
  if (paypalAuthToken.token && Date.now() < paypalAuthToken.expiresAt) {
    return paypalAuthToken.token;
  }
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  try {
    const response = await axios.post(`${PAYPAL_API_BASE}/v1/oauth2/token`, 'grant_type=client_credentials', {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token, expires_in } = response.data;
    paypalAuthToken = { token: access_token, expiresAt: Date.now() + (expires_in - 300) * 1000 };
    console.log('New PayPal Access Token generated.');
    return access_token;
  } catch (error) {
    console.error('Failed to get PayPal access token:', error.response ? error.response.data : error.message);
    throw new Error('Failed to get PayPal access token');
  }
}

app.get('/api/status', (req, res) => {
  if (databaseError) return res.status(500).json({ status: 'error', message: 'Database connection failed' });
  if (!isDatabaseReady) return res.status(503).json({ status: 'maintenance', message: 'Database is initializing' });
  res.json({ status: 'ok', message: 'Server is ready' });
});

app.get('/api/leaderboard', (req, res) => {
    if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });
    const sql = `
        WITH RankedEntries AS (
        SELECT name, amount, created_at, verified, paypal_transaction_id,
                ROW_NUMBER() OVER(PARTITION BY name ORDER BY created_at DESC) as rn
        FROM leaderboard WHERE verified = TRUE
        ), AggregatedData AS (
        SELECT name, SUM(amount) as total_amount
        FROM leaderboard WHERE verified = TRUE GROUP BY name
        )
        SELECT ad.name, ad.total_amount as amount, re.created_at, re.verified, re.paypal_transaction_id
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
        res.json(rows);
    });
});

app.get('/api/leaderboard/summary', (req, res) => {
    if (!isDatabaseReady) return res.status(503).json({ error: 'Database is initializing' });
    const sql = `
        WITH AggregatedData AS (
        SELECT SUM(amount) as total_amount
        FROM leaderboard WHERE verified = TRUE GROUP BY name ORDER BY total_amount DESC
        )
        SELECT COUNT(*) as userCount, SUM(total_amount) as totalAmount
        FROM (SELECT * FROM AggregatedData LIMIT -1 OFFSET 24);
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

app.post('/api/orders', async (req, res) => {
    const { name, amount } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 64) {
        return res.status(400).json({ error: 'Invalid name.' });
    }
    const amountInt = parseInt(amount, 10);
    if (isNaN(amountInt) || amountInt < 1 || amountInt > 1000000) {
        return res.status(400).json({ error: 'Invalid amount.' });
    }
    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9 _-]/g, "");
    
    try {
        const accessToken = await getPayPalAccessToken();
        const payload = {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: { currency_code: 'USD', value: amountInt.toString() },
                description: `Leaderboard entry for ${sanitizedName}`
            }]
        };
        const response = await axios.post(`${PAYPAL_API_BASE}/v2/checkout/orders`, payload, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
        
        res.json({ id: response.data.id });
    } catch (error) {
        console.error('PayPal order creation failed:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Could not create payment order.' });
    }
});

app.post('/api/orders/:orderID/capture', async (req, res) => {
    const { orderID } = req.params;
    const { name } = req.body; // Get name from the request body sent by the frontend

    if (!name) {
        return res.status(400).json({ error: 'User name is required.' });
    }

    try {
        const accessToken = await getPayPalAccessToken();
        const response = await axios.post(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {}, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });

        const capture = response.data.purchase_units[0].payments.captures[0];
        const transactionId = capture.id;
        const paidAmount = Math.floor(parseFloat(capture.amount.value));

        const sql = `INSERT INTO leaderboard (name, amount, paypal_transaction_id, verified) VALUES (?, ?, ?, ?)`;
        db.run(sql, [name, paidAmount, transactionId, true], function(err) {
            if (err) {
                console.error('DB Error on capture:', err);
                return res.status(500).json({ error: 'DB save failed.' });
            }
            console.log(`Payment successful and saved to DB: ${name}, transaction: ${transactionId}`);
            res.status(201).json({ message: 'Payment processed successfully.' });
        });
    } catch (error) {
        console.error('PayPal capture failed:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Could not complete payment.' });
    }
});

const distPath = path.join(__dirname, '..', 'goldenranks', 'dist');
app.use(express.static(distPath));

app.get(/^.*/, (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('React build not found.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});