#!/usr/bin/env node
// Discord Özel — yalnızca Discord'un trafiğini engel aşarak taşıyan yerel proxy + başlatıcı.
//
// Nasıl çalışır:
//   1. 127.0.0.1 üzerinde küçük bir HTTP proxy açar (sadece bu bilgisayardan erişilebilir).
//   2. Alan adlarını ISS DNS'i yerine DNS-over-HTTPS (Cloudflare / Google) ile çözer -> DNS zehirlemesi aşılır.
//   3. TLS ClientHello paketini parçalayarak gönderir -> SNI tabanlı DPI engeli aşılır.
//   4. Discord'u yalnızca bu proxy'yi kullanacak şekilde başlatır. Sistem ayarlarına, sürücülere,
//      diğer programlara ve genel ağ trafiğine dokunulmaz. Yönetici izni gerekmez.
//
// Kullanım: node discord-ozel.js [--web] [--kur] [--sadece-proxy] [--port N] [--ptb|--canary] [--ayrintili]

'use strict';
const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const args = process.argv.slice(2);
const has = (...names) => names.some(n => args.includes(n));
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const PORT = Number(argVal('--port', 8881));
const VERBOSE = has('--ayrintili', '--verbose');
const FRAG_DELAY_MS = Number(argVal('--gecikme', 10));
const FLAVOR = has('--canary') ? 'DiscordCanary' : has('--ptb') ? 'DiscordPTB' : 'Discord';
const PROXY_URL = `http://127.0.0.1:${PORT}`;
const PING_PATH = '/__discord_ozel_ping';

const log = (...m) => console.log(new Date().toLocaleTimeString('tr-TR'), ...m);
const vlog = (...m) => VERBOSE && log(...m);

// ---------------------------------------------------------------------------
// DNS-over-HTTPS çözücü (IP adresine doğrudan bağlanır, sertifika IP üzerinden doğrulanır)
// ---------------------------------------------------------------------------
const DOH_SERVERS = [
  { host: '1.1.1.1', path: '/dns-query' },
  { host: '8.8.8.8', path: '/resolve' },
  { host: '1.0.0.1', path: '/dns-query' },
  { host: '8.8.4.4', path: '/resolve' },
];
const dnsCache = new Map(); // ad -> { ips, expires }
const dnsPending = new Map(); // ad -> Promise

function dohQuery(server, name) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      host: server.host,
      path: `${server.path}?name=${encodeURIComponent(name)}&type=A`,
      headers: { accept: 'application/dns-json' },
      timeout: 4000,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => (body += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const answers = (j.Answer || []).filter(a => a.type === 1);
          if (!answers.length) return reject(new Error(`${name} için A kaydı yok`));
          const ttl = Math.max(60, Math.min(...answers.map(a => a.TTL || 300)));
          resolve({ ips: answers.map(a => a.data), ttl });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('DoH zaman aşımı')));
    req.on('error', reject);
  });
}

async function resolveHost(name) {
  if (net.isIP(name)) return [name];
  const cached = dnsCache.get(name);
  if (cached && cached.expires > Date.now()) return cached.ips;
  if (dnsPending.has(name)) return dnsPending.get(name);

  const p = (async () => {
    let lastErr;
    for (const server of DOH_SERVERS) {
      try {
        const { ips, ttl } = await dohQuery(server, name);
        dnsCache.set(name, { ips, expires: Date.now() + ttl * 1000 });
        vlog(`DNS ${name} -> ${ips.join(', ')} (${server.host})`);
        return ips;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  })().finally(() => dnsPending.delete(name));
  dnsPending.set(name, p);
  return p;
}

function connectAny(ips, port) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = err => {
      if (i >= ips.length) return reject(err || new Error('bağlanılamadı'));
      const ip = ips[i++];
      const sock = net.connect({ host: ip, port, timeout: 6000 });
      const fail = e => { sock.destroy(); next(e); };
      sock.once('timeout', () => fail(new Error(`${ip}:${port} zaman aşımı`)));
      sock.once('error', fail);
      sock.once('connect', () => {
        sock.removeAllListeners('timeout');
        sock.removeAllListeners('error');
        sock.setTimeout(0);
        sock.setNoDelay(true);
        resolve(sock);
      });
    };
    next();
  });
}

// ---------------------------------------------------------------------------
// TLS ClientHello parçalama
// ---------------------------------------------------------------------------
// İlk TLS kaydını SNI'nin ortasından ikiye böler (iki ayrı TLS kaydı) ve ayrı TCP
// paketleri olarak gönderir. Sunucu bunu sorunsuz birleştirir; DPI ise alan adını göremez.
function fragmentClientHello(buf, hostname) {
  if (buf.length < 6 || buf[0] !== 0x16) return [buf]; // TLS handshake değil
  const recLen = buf.readUInt16BE(3);
  const recEnd = Math.min(5 + recLen, buf.length);
  const body = buf.subarray(5, recEnd);
  const rest = buf.subarray(recEnd);

  let cut = 1;
  const sniPos = hostname ? body.indexOf(Buffer.from(hostname, 'latin1')) : -1;
  if (sniPos > 0) cut = sniPos + Math.max(1, Math.floor(hostname.length / 2));
  if (cut >= body.length) cut = 1;

  const hdr = buf.subarray(0, 3); // içerik tipi + sürüm
  const record = b => Buffer.concat([hdr, Buffer.from([b.length >> 8, b.length & 0xff]), b]);
  const r1 = record(body.subarray(0, cut));
  const r2 = record(body.subarray(cut));
  // İlk kaydı da ayrıca iki TCP segmentine bölerek gönder
  return [r1.subarray(0, 3), r1.subarray(3), Buffer.concat([r2, rest])];
}

async function writeChunks(sock, chunks) {
  for (let i = 0; i < chunks.length; i++) {
    sock.write(chunks[i]);
    if (i < chunks.length - 1 && FRAG_DELAY_MS > 0) await new Promise(r => setTimeout(r, FRAG_DELAY_MS));
  }
}

// ---------------------------------------------------------------------------
// HTTP proxy
// ---------------------------------------------------------------------------
async function handleConnect(req, client, head) {
  const sep = req.url.lastIndexOf(':');
  const host = (sep > 0 ? req.url.slice(0, sep) : req.url).replace(/^\[|\]$/g, '');
  const port = Number(req.url.slice(sep + 1)) || 443;
  client.on('error', () => {});
  let upstream;
  try {
    upstream = await connectAny(await resolveHost(host), port);
  } catch (e) {
    log(`HATA ${host}:${port} -> ${e.message}`);
    client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    return;
  }
  vlog(`CONNECT ${host}:${port}`);
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

  const start = async first => {
    client.pause();
    await writeChunks(upstream, fragmentClientHello(first, host));
    client.pipe(upstream);
    upstream.pipe(client);
    client.resume();
  };
  if (head && head.length) start(head);
  else client.once('data', start);
}

function handlePlainHttp(req, res) {
  if (req.url === PING_PATH) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('discord-ozel');
  }
  let target;
  try {
    target = new URL(req.url);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  // Düz HTTP'de Host başlığı DPI tarafından engelleniyor; Discord'un tüm adresleri HTTPS destekler.
  if ((req.method === 'GET' || req.method === 'HEAD') && target.protocol === 'http:') {
    target.protocol = 'https:';
    res.writeHead(301, { location: target.href });
    return res.end();
  }
  const port = Number(target.port) || 80;
  resolveHost(target.hostname)
    .then(ips => {
      const up = http.request({
        host: ips[0], port, method: req.method,
        path: target.pathname + target.search,
        headers: { ...req.headers, host: target.host },
      }, upRes => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
      });
      up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(up);
    })
    .catch(e => {
      log(`HATA ${target.hostname} -> ${e.message}`);
      res.writeHead(502);
      res.end();
    });
}

function startProxy() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handlePlainHttp);
    server.on('connect', handleConnect);
    server.on('clientError', (e, sock) => sock.destroy());
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function isOurProxyRunning() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: PING_PATH, timeout: 1500 }, res => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => resolve(b === 'discord-ozel'));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Discord / tarayıcı başlatma
// ---------------------------------------------------------------------------
const run = (file, argv) => new Promise(resolve => execFile(file, argv, { windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout)));

function findDiscordExe() {
  const base = path.join(process.env.LOCALAPPDATA || '', FLAVOR);
  if (!fs.existsSync(base)) return null;
  const versions = fs.readdirSync(base)
    .filter(d => /^app-\d+(\.\d+)*$/.test(d))
    .sort((a, b) => {
      const pa = a.slice(4).split('.').map(Number), pb = b.slice(4).split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      return 0;
    });
  for (const v of versions) {
    const exe = path.join(base, v, `${FLAVOR}.exe`);
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

async function isProcessRunning(imageName) {
  const out = await run('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH']);
  return out.toLowerCase().includes(imageName.toLowerCase());
}

function proxyEnv() {
  return {
    ...process.env,
    HTTP_PROXY: PROXY_URL, HTTPS_PROXY: PROXY_URL, ALL_PROXY: PROXY_URL,
    http_proxy: PROXY_URL, https_proxy: PROXY_URL, all_proxy: PROXY_URL,
    NO_PROXY: '', no_proxy: '',
  };
}

async function launchDiscord() {
  const exe = findDiscordExe();
  if (!exe) return false;
  const image = `${FLAVOR}.exe`;
  if (await isProcessRunning(image)) {
    // Zaten açık bir Discord varsa yeni pencere ona devredilir ve proxy kullanılmaz; kapatıp yeniden açıyoruz.
    log(`Açık olan ${FLAVOR} kapatılıyor (proxy ile yeniden açılacak)...`);
    await run('taskkill', ['/IM', image, '/F']);
    await new Promise(r => setTimeout(r, 1500));
  }
  log(`${FLAVOR} başlatılıyor: ${exe}`);
  spawn(exe, [`--proxy-server=${PROXY_URL}`, '--proxy-bypass-list=<-loopback>'], {
    detached: true, stdio: 'ignore', env: proxyEnv(), cwd: path.dirname(exe),
  }).unref();
  return true;
}

function findBrowser() {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];
  for (const p of pf) {
    candidates.push(path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    candidates.push(path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  return candidates.find(c => fs.existsSync(c)) || null;
}

function launchWeb() {
  const browser = findBrowser();
  if (!browser) {
    log('Edge veya Chrome bulunamadı.');
    return null;
  }
  // Ayrı bir profil klasörü: normal tarayıcınız ve sekmeleriniz etkilenmez.
  const profile = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'discord-ozel', 'tarayici-profili');
  fs.mkdirSync(profile, { recursive: true });
  log(`Discord web açılıyor: ${path.basename(browser)} (ayrı profil)`);
  return spawn(browser, [
    `--user-data-dir=${profile}`,
    `--proxy-server=${PROXY_URL}`,
    '--proxy-bypass-list=<-loopback>',
    '--no-first-run',
    '--no-default-browser-check',
    '--app=https://discord.com/app',
  ], { stdio: 'ignore' });
}

async function installDiscord() {
  const setup = path.join(os.tmpdir(), 'DiscordSetup.exe');
  const channel = FLAVOR === 'DiscordCanary' ? 'canary' : FLAVOR === 'DiscordPTB' ? 'ptb' : 'stable';
  const url = `https://discord.com/api/downloads/distributions/app/installers/latest?channel=${channel}&platform=win&arch=x64`;
  log('Discord kurulum dosyası indiriliyor...');
  const ok = await new Promise(resolve => {
    const p = spawn('curl.exe', ['-L', '--fail', '--proxy', PROXY_URL, '-o', setup, url], { stdio: 'inherit' });
    p.on('exit', code => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
  if (!ok) {
    log('İndirme başarısız.');
    return false;
  }
  log('Kurulum çalıştırılıyor...');
  await new Promise(resolve => {
    const p = spawn(setup, [], { stdio: 'ignore', env: proxyEnv() });
    p.on('exit', resolve);
    p.on('error', resolve);
  });
  // Kurulum Discord'u proxy'siz açar; launchDiscord onu kapatıp proxy ile yeniden açacak.
  await new Promise(r => setTimeout(r, 5000));
  return true;
}

// Discord kapandığında proxy'yi de kapat (güncelleme sırasında yeniden başlamasına tolerans tanınır).
function exitWhenGone(imageName) {
  let seen = false, missing = 0;
  const startedAt = Date.now();
  setInterval(async () => {
    if (await isProcessRunning(imageName)) {
      seen = true;
      missing = 0;
    } else if (seen || Date.now() - startedAt > 120000) {
      if (++missing >= 4) {
        log(`${imageName} kapandı, proxy kapatılıyor.`);
        process.exit(0);
      }
    }
  }, 5000);
}

// ---------------------------------------------------------------------------
async function main() {
  let server;
  try {
    server = await startProxy();
  } catch (e) {
    if (e.code === 'EADDRINUSE' && (await isOurProxyRunning())) {
      log(`Proxy zaten çalışıyor (${PROXY_URL}).`);
      if (has('--web')) launchWeb();
      else if (!(await launchDiscord())) log(`${FLAVOR} bulunamadı.`);
      return setTimeout(() => process.exit(0), 1000);
    }
    log(`Proxy başlatılamadı: ${e.message}. Başka bir port deneyin: --port 8882`);
    process.exitCode = 1;
    return;
  }
  log(`Proxy hazır: ${PROXY_URL} (sadece bu bilgisayar, sadece Discord)`);

  if (has('--sadece-proxy', '--proxy-only')) {
    log('Sadece proxy modu. Kapatmak için bu pencereyi kapatın veya Ctrl+C.');
    return;
  }

  if (has('--web')) {
    const child = launchWeb();
    if (!child) process.exit(1);
    child.on('exit', () => {
      log('Tarayıcı kapandı, proxy kapatılıyor.');
      server.close();
      process.exit(0);
    });
    return;
  }

  if (!findDiscordExe()) {
    if (has('--kur', '--install')) {
      if (!(await installDiscord())) process.exit(1);
    } else {
      log(`${FLAVOR} kurulu bulunamadı (${path.join(process.env.LOCALAPPDATA || '', FLAVOR)}).`);
      log('Kurmak için: "Discord Baslat.bat" --kur    |    Tarayıcıda açmak için: "Discord Baslat.bat" --web');
      process.exit(1);
    }
  }
  if (!(await launchDiscord())) {
    log(`${FLAVOR} başlatılamadı.`);
    process.exit(1);
  }
  log('Discord kapanınca bu pencere de kendiliğinden kapanır.');
  exitWhenGone(`${FLAVOR}.exe`);
}

main();
