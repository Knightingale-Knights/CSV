// api/send-ndia-csv.js
// Env vars: POSTMARK_TOKEN, FROM_EMAIL, TO_EMAIL, API_KEY

const HEADERS = [
  'RegistrationNumber',
  'NDISNumber',
  'SupportsDeliveredFrom',
  'SupportsDeliveredTo',
  'SupportNumber',
  'ClaimReference',
  'Quantity',
  'Hours',
  'UnitPrice',
  'GSTCode',
  'AuthorisedBy',
  'ParticipantApproved',
  'InKindFundingProgram',
  'ClaimType',
  'CancellationReason',
  'ABN of Support Provider',
];

function esc(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(rows) {
  const lines = [HEADERS.map(esc).join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => esc(row[h])).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function todayAEST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  if (process.env.API_KEY && req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const rows = Array.isArray(body && body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No rows received' });
    }

    const csv = buildCsv(rows);
    const date = todayAEST();
    const filename = `ndia-claims-${date}.csv`;

    const pm = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN,
      },
      body: JSON.stringify({
        From: process.env.FROM_EMAIL,
        To: process.env.TO_EMAIL,
        Subject: `NDIA claims CSV ${date}`,
        TextBody: `NDIA claims CSV attached (${rows.length} rows).`,
        MessageStream: 'outbound',
        Attachments: [
          {
            Name: filename,
            Content: Buffer.from(csv, 'utf8').toString('base64'),
            ContentType: 'text/csv',
          },
        ],
      }),
    });

    const result = await pm.json();
    if (!pm.ok) {
      return res.status(502).json({ error: 'Postmark error', detail: result });
    }

    return res.status(200).json({ ok: true, rows: rows.length, messageId: result.MessageID });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
