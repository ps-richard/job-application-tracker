// Servidor local: serve o app e faz a ponte entre o botão "Buscar referência
// salarial" e o Claude Code CLI (usa a mesma sessão/assinatura já logada nesta
// máquina, via `claude -p`, com WebSearch e saída em JSON estruturado).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 8934;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');

function readData(cb) {
  fs.readFile(DATA_FILE, 'utf8', (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') { cb(null, []); return; }
      cb(err); return;
    }
    try { cb(null, JSON.parse(content)); }
    catch (e) { cb(new Error('data.json está corrompido: ' + e.message)); }
  });
}

function writeData(data, cb) {
  fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8', cb);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const SALARY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    min: { type: 'number' },
    max: { type: 'number' },
    confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    comentario: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['min', 'max', 'confidence'],
});

function buscarSalario(empresa, cargo, cb) {
  const prompt = `Busque o SALÁRIO FIXO MENSAL estimado (em R$) para o cargo "${cargo || 'não informado'}" na empresa "${empresa || 'não informada'}", no Brasil. Use fontes como Glassdoor, Levels.fyi, LinkedIn Salary e Google.

IMPORTANTE sobre a conversão: muitas fontes (especialmente Levels.fyi) reportam remuneração TOTAL ANUAL (CTC/TC, incluindo bônus/equity/PLR), não o salário fixo mensal. Se só encontrar valores anuais, converta para mensal dividindo por 12 e deixe isso claro no campo "comentario".

Responda estritamente no formato JSON pedido:
- "min" e "max": salário FIXO MENSAL em R$ (nunca anual, e excluindo bônus/PLR/equity quando possível separar).
- "confidence": grau de confiança (alta/média/baixa) considerando a quantidade/qualidade das fontes E se foi necessário converter de anual para mensal (conversões são menos confiáveis).
- "comentario": nota breve (1-2 frases) citando o valor TOTAL ANUAL original encontrado (se aplicável), se houve conversão, e ressalvas (ex: "inclui bônus", "poucas fontes", "baseado em cargo similar").`;

  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--json-schema', SALARY_SCHEMA,
    '--allowedTools', 'WebSearch',
    '--permission-mode', 'bypassPermissions',
  ];

  execFile('claude', args, { timeout: 150000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
    if (err) { cb(err); return; }
    try {
      const parsed = JSON.parse(stdout);
      if (parsed.structured_output) { cb(null, parsed.structured_output); return; }
      if (parsed.result) { cb(null, JSON.parse(parsed.result)); return; }
      cb(new Error('Resposta inesperada do Claude Code.'));
    } catch (e) {
      cb(new Error('Não consegui interpretar a resposta do Claude Code.'));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/dados') {
    readData((err, data) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); return; }
      res.end(JSON.stringify(data));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/dados') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body || '[]'); } catch (e) { payload = null; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!Array.isArray(payload)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Payload inválido: esperado uma lista de processos.' }));
        return;
      }
      writeData(payload, (err) => {
        if (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); return; }
        res.end(JSON.stringify({ ok: true }));
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/buscar-salario') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }
      buscarSalario(payload.empresa, payload.cargo, (err, data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message || String(err) }));
          return;
        }
        res.end(JSON.stringify(data));
      });
    });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT, path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(filePath, (err, content) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Candidaturas rodando em http://localhost:${PORT}`);
});
