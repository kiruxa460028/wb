const https = require('https');
https.get('https://api.ipify.org', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('Outgoing IP:', d));
});