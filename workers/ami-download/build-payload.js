/* Builds the encrypted payload embedded in index.html.
   Holds the file listing + contents (for the browser) and the Drive URL, so
   neither is present in the page until the passphrase decrypts them.
   No separate artifact is committed to the repo. */
const fs=require('fs'), path=require('path'), zlib=require('zlib'), crypto=require('crypto');

const SRC=process.argv[2], PAGE=process.argv[3], PASS=process.argv[4];
const DRIVE_ID='1YwhqqvKENlQ48LcLujcNrIPoFCXLzCa7';
/* uc?export=download is the form that actually downloads; /view opens a viewer. */
const DRIVE='https://drive.google.com/uc?export=download&id='+DRIVE_ID;

const DESC={
  'manifest.json':'MV3 manifest — permissions, content script registration, icons',
  'parser.js'    :'Turns the copied finding into ordered sections; handles repeated Request/Response headings',
  'content.js'   :'Asgard automation — form fill, Evidence loop, Type=Text, floating button, live progress',
  'popup.html'   :'Toolbar popup markup and styling',
  'popup.js'     :'Popup logic and the progress-driven loader',
  'README.md'    :'Field mapping, Evidence rules, and the reasoning behind each fix',
  'icon16.png'   :'Toolbar icon 16px', 'icon32.png':'Toolbar icon 32px',
  'icon48.png'   :'Extension icon 48px','icon128.png':'Store/management icon 128px',
};
const LANG={'.js':'js','.json':'json','.html':'html','.md':'md','.png':'png','.css':'css'};

const names=fs.readdirSync(SRC).filter(n=>fs.statSync(path.join(SRC,n)).isFile()).sort((a,b)=>{
  const w=n=>n==='manifest.json'?0:n==='README.md'?9:/\.png$/.test(n)?8:1;
  return w(a)-w(b)||a.localeCompare(b);
});
const files=names.map(n=>{
  const buf=fs.readFileSync(path.join(SRC,n));
  const ext=path.extname(n).toLowerCase();
  const binary=ext==='.png';
  return {name:n,size:buf.length,type:LANG[ext]||'txt',desc:DESC[n]||'',
          binary,text:binary?'':buf.toString('utf8')};
});

/* Brand strings are redacted in the markup and filled in only after unlock,
   so the page gives away no client name before the passphrase. */
const vc={brand:'VikingCloud',host:'portal.vikingcloud.com'};
/* Optional 5th arg: the deployed broker worker. When set, the page asks it for
   a fresh single-use URL per download and never touches Drive directly. */
const WORKER=process.argv[5]||'';
const payload=Buffer.from(JSON.stringify(
  {drive:DRIVE,worker:WORKER,zipName:'asgard-magic-importer.zip',vc,files}),'utf8');
const gz=zlib.gzipSync(payload,{level:9});

const ITER=250000;
const salt=crypto.randomBytes(16), iv=crypto.randomBytes(12);
const key=crypto.pbkdf2Sync(PASS,salt,ITER,32,'sha256');
const c=crypto.createCipheriv('aes-256-gcm',key,iv);
const blob=Buffer.concat([Buffer.from('AMI2','ascii'),salt,iv,
  c.update(gz),c.final(),c.getAuthTag()]);
const b64=blob.toString('base64');

/* round-trip */
const rk=crypto.pbkdf2Sync(PASS,blob.subarray(4,20),ITER,32,'sha256');
const dc=crypto.createDecipheriv('aes-256-gcm',rk,blob.subarray(20,32));
dc.setAuthTag(blob.subarray(blob.length-16));
const back=zlib.gunzipSync(Buffer.concat([dc.update(blob.subarray(32,blob.length-16)),dc.final()]));
if(!back.equals(payload)) { console.error('ROUND-TRIP FAILED'); process.exit(1); }
let rejected=false;
try{ const wk=crypto.pbkdf2Sync('nope',blob.subarray(4,20),ITER,32,'sha256');
     const wd=crypto.createDecipheriv('aes-256-gcm',wk,blob.subarray(20,32));
     wd.setAuthTag(blob.subarray(blob.length-16));
     Buffer.concat([wd.update(blob.subarray(32,blob.length-16)),wd.final()]);
}catch{ rejected=true; }
if(!rejected){ console.error('WRONG PASSWORD ACCEPTED'); process.exit(1); }

/* splice into the page */
let html=fs.readFileSync(PAGE,'utf8');
const re=/(<script id="pkg" type="text\/plain">)[\s\S]*?(<\/script>)/;
if(!re.test(html)){ console.error('no <script id="pkg"> block in the page'); process.exit(1); }
html=html.replace(re,(m,a,b)=>a+b64+b);
fs.writeFileSync(PAGE,html);

console.log('files listed      :',files.length);
files.forEach(f=>console.log('   ',f.name.padEnd(16),String(f.size).padStart(6),'B ',f.binary?'(binary)':''));
console.log('payload json      :',payload.length,'B');
console.log('gzipped           :',gz.length,'B');
console.log('encrypted+base64  :',b64.length,'chars');
console.log('round-trip        : OK');
console.log('wrong passphrase  : rejected by the GCM tag');
const bare=html.replace(/<script id="pkg" type="text\/plain">[\s\S]*?<\/script>/,'');
console.log('drive url in page :',/drive\.google\.com/.test(bare)?'LEAKED':'no (encrypted)');
console.log('phrase in page    :',new RegExp(PASS,'i').test(bare)?'LEAKED':'no');
console.log('brand in page     :',/vikingcloud/i.test(bare)?'LEAKED':'no (encrypted)');
