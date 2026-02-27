const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Session middleware
app.use(session({
  secret: 'solat-tracker-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(express.json());
app.use(express.static('public'));

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Dynamic prayer template (time will be replaced from API)
const prayerTemplate = [
  { id: 'subuh', name: 'Subuh' },
  { id: 'dzuhur', name: 'Dzuhur' },
  { id: 'ashar', name: 'Ashar' },
  { id: 'maghrib', name: 'Maghrib' },
  { id: 'isya', name: "Isya'" }
];

// Helper: get current date string (YYYY-MM-DD) in WIB timezone
function getCurrentDate() {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wibTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  return wibTime.toISOString().split('T')[0];
}

// Helper: initialize or reset session if new day
function ensureSessionForToday(req) {
  const today = getCurrentDate();
  
  if (!req.session.prayerData || req.session.date !== today) {
    req.session.prayerData = {};
    req.session.date = today;
  }
}

// Get prayer status (dynamic from Aladhan)
app.get('/api/prayers', async (req, res) => {
  ensureSessionForToday(req);

  const { latitude, longitude } = req.query;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude dan longitude diperlukan.' });
  }

  try {
    const today = req.session.date;
    const [year, month, day] = today.split('-');
    const formatted = `${day}-${month}-${year}`;

    const url = `https://api.aladhan.com/v1/timings/${formatted}?latitude=${latitude}&longitude=${longitude}&method=2&school=1&language=id`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data?.data?.timings) {
      return res.status(500).json({ error: 'Gagal mengambil jadwal dari API.' });
    }

    const timings = data.data.timings;

    const prayersWithStatus = prayerTemplate.map(prayer => {
      let timeMap = {
        subuh: timings.Fajr,
        dzuhur: timings.Dhuhr,
        ashar: timings.Asr,
        maghrib: timings.Maghrib,
        isya: timings.Isha
      };

      return {
        ...prayer,
        time: timeMap[prayer.id],
        completed: req.session.prayerData[prayer.id] || null
      };
    });

    res.json({
      date: today,
      prayers: prayersWithStatus
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// Mark prayer as completed
app.post('/api/prayers/:id/complete', (req, res) => {
  ensureSessionForToday(req);
  
  const prayerId = req.params.id;
  const prayer = prayers.find(p => p.id === prayerId);
  
  if (!prayer) {
    return res.status(404).json({ error: 'Prayer not found' });
  }
  
  // If already completed, lock
  if (req.session.prayerData[prayerId]) {
    return res.status(403).json({ error: 'Prayer sudah ditandai, tidak bisa diubah.' });
  }
  const timestamp = new Date().toISOString();
  req.session.prayerData[prayerId] = timestamp;
  
  res.json({
    success: true,
    prayer: prayer.name,
    completedAt: timestamp
  });
});

// Unmark prayer (DISABLED, NO UNCHECK)
// app.post('/api/prayers/:id/uncomplete', (req, res) => {
//   res.status(403).json({error: 'Tidak bisa batal. Sudah selesai.'});
// }); 

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✨ Solat Checker running on http://127.0.0.1:${PORT}`);
  console.log(`   Public access via Cloudflare Tunnel`);
});
