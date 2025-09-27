require('dotenv').config();
const express = require('express');
const paypal = require('@paypal/checkout-server-sdk');

// 🚨 중요: 포트를 3002로 설정하여 GoldenRanks(3001)와 충돌 방지
const PORT = 3002;

const app = express();
app.use(express.json());

// --- PayPal SDK 설정 ---
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret); // 🚨 실제 운영 시 LiveEnvironment로 변경
const client = new paypal.core.PayPalHttpClient(environment);

// --- API 라우트 ---

// 1. 주문 생성 API
app.post('/api/create-order', async (req, res) => {
  const { amount } = req.body;
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: 'USD',
        value: amount.toString()
      }
    }]
  });

  try {
    const order = await client.execute(request);
    res.json({ id: order.result.id });
  } catch (err) {
    console.error("Failed to create order:", err);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

// 2. 결제 완료(캡처) API
app.post('/api/capture-order', async (req, res) => {
  const { orderID } = req.body;
  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const capture = await client.execute(request);
    // 여기서 결제 성공 시 DB 저장 등의 로직을 추가할 수 있습니다.
    console.log('Payment captured successfully:', capture.result);
    res.json(capture.result);
  } catch (err) {
    console.error("Failed to capture order:", err);
    res.status(500).json({ error: 'Failed to capture order.' });
  }
});


app.listen(PORT, () => {
  console.log(`MajorPick backend server running on http://localhost:${PORT}`);
});