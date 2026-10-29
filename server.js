const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API: Get all rooms
app.get('/api/rooms', (req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  res.json(data);
});

// API: Booking inquiry (simple)
app.post('/api/booking', (req, res) => {
  const { name, email, phone, checkin, checkout, room, message } = req.body;
  // In production: save to DB or send email
  console.log('Booking inquiry:', { name, email, phone, checkin, checkout, room });
  res.json({ success: true, message: 'Đã nhận yêu cầu. Banla sẽ liên hệ sớm.' });
});

app.listen(PORT, () => {
  console.log(`Banla server running at http://localhost:${PORT}`);
});
