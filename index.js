const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok', service: 'adskeeper-agent' }));
  } else {
    res.end(JSON.stringify({ service: 'adskeeper-agent', version: '0.1.0' }));
  }
});

server.listen(PORT, () => console.log(`adskeeper-agent running on port ${PORT}`));
