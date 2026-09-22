/* SourceMap Radar - credential scanner.
 *
 * Ported verbatim from the JS SourceMap Unmapper at /tools/sourcemapunmapper/
 * so both tools agree on what counts as a secret. The unmapper is a single
 * self-contained page by design (it has to work offline and from file://),
 * which is why this is a copy rather than a shared import. Change one, change
 * the other - the rule list and the gate below are meant to stay identical.
 *
 * Loaded into the MV3 service worker with importScripts(), so it exports by
 * assigning to self rather than with ES module syntax.
 */

/* Values that ship verbatim in vendor documentation and tutorials.
   They match the real formats perfectly - that is the whole problem -
   so they have to be excluded by value rather than by shape.

   Stored as truncated prefixes on purpose. A suppression list only needs
   enough of the value to identify it, and keeping whole sample keys in
   source puts complete (if public) credentials in the repo for no benefit
   - GitHub push protection rejects them, and rightly so. */
const DOC_SAMPLE_PREFIXES = [
    'akiaiosfodnn7example',
    'akiai44qh8dhbexample',
    'wjalrxutnfemi/k7mdeng/bpxrficy',
    'pk_test_tyoomqauvded',
    'sk_test_4ec39hqlyjw',
    'aizasydagmwka4jsxz-hjgw7isln',
    '00000000-0000-0000-0000-000000000000',
    'ffffffffffffffffffffffffffffffff',
    '0123456789abcdef0123456789abcdef'
];

function isDocSample(low) {
    for (let i = 0; i < DOC_SAMPLE_PREFIXES.length; i++) {
        if (low.indexOf(DOC_SAMPLE_PREFIXES[i]) === 0) return true;
    }
    return false;
}

/* Substrings that mark a value as a stand-in rather than a live key.
   Kept to words that only ever show up in filler: anything that can
   legitimately appear inside a real credential belongs in the
   whole-value check below instead, not here. A sequence like 123456789
   looks like filler but is also the middle of a real Discord snowflake
   or Telegram bot id, so matching it as a substring silently drops
   genuine findings. */
const PLACEHOLDER_HINTS = [
    'placeholder', 'changeme', 'change_me', 'yourkey', 'your_key', 'your-key',
    'yourapi', 'your_api', 'your_token', 'your-token', 'dummy', 'redacted',
    'notset', 'not_set', 'nosecret', 'lorem ', 'qwerty', 'asdfgh',
    'foobar', 'testtest', 'password123', 'secretsecret', 'replace_me',
    'replaceme', 'insert_key', 'insertkey'
];

/* Filler that only counts when it is the entire value. */
const FILLER_VALUE_RE = new RegExp(
    '^(?:' +
        '(.)\\1+' +                                   // aaaa, 0000, xxxx
        '|(?:0?123456789|abcdef|0123456789)+[0-9a-f]*' +
        '|(?:deadbeef)+' +
        '|(?:example|sample|test|fake|mock|todo|fixme|secret|apikey|token)' +
          '[_-]?(?:key|token|secret|value|here|123)?' +
    ')$', 'i'
);

/* Template interpolation and environment lookups are references to a
   secret, not the secret. These are the single largest false-positive
   source in minified bundles that inline their config shape. */
const TEMPLATE_RE = /\$\{|\{\{|<%|%>|#\{|\$\(|%[sdv]\b|process\.env|import\.meta|os\.environ|getenv|Deno\.env/i;

/* A value that is entirely a path, a URL, a MIME type, a locale, a
   semver, a colour, a date or a bare identifier is not a credential. */
const NOT_A_SECRET_RE = new RegExp(
    '^(?:' +
        '(?:\\.{0,2}\\/|[A-Za-z]:\\\\)[^\\s]*' +                    // path
        '|[a-z]+\\/[a-z0-9.+-]+' +                                  // mime type
        '|[a-z]{2}([-_][A-Za-z]{2,4})?' +                           // locale
        '|v?\\d+(\\.\\d+){1,3}([-+][0-9A-Za-z.]+)?' +               // semver
        '|#[0-9A-Fa-f]{3,8}' +                                      // colour
        '|\\d{4}-\\d{2}-\\d{2}(T[0-9:.Z+-]*)?' +                    // date
        '|(?:true|false|null|undefined|none|nan|nil|void)' +
        '|[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)+' + // a.b.c ref
        '|[a-z]+(?:[A-Z][a-z]+)+' +                                 // camelCase word
        '|[a-z]+(?:[_-][a-z]+)+' +                                  // snake/kebab word
    ')$'
);

/* Shannon entropy in bits per character. Real keys are near-random and
   land above ~3.2; English words and config values sit well below. */
function shannonEntropy(s) {
    const freq = Object.create(null);
    let i;
    for (i = 0; i < s.length; i++) freq[s[i]] = (freq[s[i]] || 0) + 1;
    let bits = 0;
    for (const ch in freq) {
        const p = freq[ch] / s.length;
        bits -= p * (Math.log(p) / Math.LN2);
    }
    return bits;
}

/* How many character classes the value draws on. A 20-char run of one
   class is usually an identifier; a real token mixes at least two. */
function charClasses(s) {
    return (/[a-z]/.test(s) ? 1 : 0) + (/[A-Z]/.test(s) ? 1 : 0) +
           (/[0-9]/.test(s) ? 1 : 0) + (/[^A-Za-z0-9]/.test(s) ? 1 : 0);
}

function isPlaceholder(v) {
    const low = v.toLowerCase();
    if (FILLER_VALUE_RE.test(v)) return true;
    /* "example" and friends only disqualify a value when they are part
       of the credential itself. Checked against the last path segment
       so api.example.com in a connection string does not count. */
    for (let i = 0; i < PLACEHOLDER_HINTS.length; i++) {
        if (low.indexOf(PLACEHOLDER_HINTS[i]) !== -1) return true;
    }
    if (/(?:^|[^a-z])(?:example|sample|mysecret|testkey|faketoken)(?:[^a-z]|$)/.test(low)) return true;
    return false;
}

/* The gate every match passes through before it is reported. Each tier
   pays a different price: a fixed-prefix provider key only has to not
   be a documentation sample, while a bare keyword hit has to look
   random enough to plausibly be a key at all.

   `structural` marks rules whose match is conclusive from its shape but
   whose text legitimately contains arbitrary host or body content — a
   connection string carries a hostname, a service-account blob carries
   JSON. Running the value heuristics over those drops real findings
   (https://user:pass@api.example.com is a leak, not a placeholder), so
   they are checked only against known documentation samples. */
function passesGate(value, conf, structural) {
    if (!value) return false;
    if (isDocSample(value.toLowerCase())) return false;
    if (structural) return true;

    if (isPlaceholder(value)) return false;

    if (conf === 'high') return true;            // shape is already conclusive

    if (TEMPLATE_RE.test(value)) return false;
    if (NOT_A_SECRET_RE.test(value)) return false;

    if (conf === 'medium') {
        return value.length >= 8 && shannonEntropy(value) >= 3.0;
    }

    /* low: the keyword sweep. Demand real length, mixed character
       classes and high entropy, which is what separates
       secret: "hJ8sK2mQ9xZ4nR7v" from secret: "production". */
    return value.length >= 12 &&
           charClasses(value) >= 2 &&
           shannonEntropy(value) >= 3.2 &&
           !/^[a-z]+$/.test(value) &&
           !/^[0-9]+$/.test(value);
}

/* Keywords that name an actual credential. A quoted value assigned to
   one of these is reported at medium confidence. */
const KEYWORDS_STRONG = [
    'access_key', 'access_token', 'admin_pass', 'algolia_admin_key', 'algolia_api_key',
    'alias_pass', 'alicloud_access_key', 'amazon_secret_access_key', 'ansible_vault_password',
    'aos_key', 'api_key', 'api_key_secret', 'api_key_sid', 'api_secret', 'apikey', 'apisecret',
    'app_key', 'app_secret', 'appkey', 'appkeysecret', 'application_key', 'appsecret',
    'auth_token', 'authorizationtoken', 'authsecret', 'aws_access', 'aws_access_key_id',
    'aws_key', 'aws_secret', 'aws_secret_key', 'aws_token', 'awssecretkey', 'b2_app_key',
    'bintray_apikey', 'bintray_gpg_password', 'bintray_key', 'bintraykey', 'bluemix_api_key',
    'bluemix_pass', 'browserstack_access_key', 'bucket_password', 'bucketeer_aws_access_key_id',
    'bucketeer_aws_secret_access_key', 'built_branch_deploy_key', 'bx_password',
    'cache_s3_secret_key', 'cattle_access_key', 'cattle_secret_key', 'certificate_password',
    'ci_deploy_password', 'client_secret', 'client_zpk_secret_key', 'clojars_password',
    'cloud_api_key', 'cloud_watch_aws_access_key', 'cloudant_password', 'cloudflare_api_key',
    'cloudflare_auth_key', 'cloudinary_api_secret', 'codecov_token', 'connectionstring',
    'consumer_key', 'consumer_secret', 'credentials', 'cypress_record_key', 'database_password',
    'datadog_api_key', 'datadog_app_key', 'db_password', 'dbpasswd', 'dbpassword',
    'deploy_password', 'digitalocean_ssh_key_body', 'digitalocean_ssh_key_ids',
    'docker_hub_password', 'docker_key', 'docker_pass', 'docker_passwd', 'docker_password',
    'dockerhub_password', 'dockerhubpassword', 'droplet_travis_password', 'dynamoaccesskeyid',
    'dynamosecretaccesskey', 'elasticsearch_password', 'encryption_key', 'encryption_password',
    'facebook_secret', 'firebase_api_key', 'firebase_secret', 'flickr_api_key', 'gh_token',
    'git_token', 'github_key', 'github_token', 'gitlab_token', 'google_client_secret',
    'google_maps_api_key', 'gpg_key', 'grafana_api_key', 'heroku_api_key', 'hockeyapp_token',
    'jwt_secret', 'jwt_token', 'mail_password', 'mailchimp_api_key', 'mailgun_api_key',
    'mandrill_api_key', 'master_key', 'mysql_password', 'mysql_root_password', 'npm_token',
    'oauth_token', 'okta_client_secret', 'pagerduty_api_key', 'passwd', 'password',
    'paypal_client_secret', 'personal_access_token', 'pgpassword', 'private_key',
    'pypi_password', 'rabbitmq_password', 'redis_password', 'refresh_token',
    'rubygems_auth_token', 's3_access_key', 's3_secret_key', 'sauce_access_key',
    'secret_access_key', 'secret_key', 'secret_token', 'security_credentials',
    'sendgrid_api_key', 'sentry_auth_token', 'service_account_key', 'session_secret',
    'signing_key', 'slack_api_token', 'slack_token', 'snyk_token', 'sonar_token',
    'spotify_secret', 'ssh_key', 'sshpass', 'stripe_secret_key', 'surge_token',
    'telegram_token', 'twilio_auth_token', 'twilio_sid', 'twitter_consumer_secret',
    'vault_token', 'vip_github_deploy_key', 'yt_api_key', 'zendesk_api_token',
    'zopim_account_key'
];

/* Context keywords that occasionally sit next to a secret but usually
   hold ordinary config. Kept for coverage, reported at low confidence
   only, and the gate throws out nearly everything they produce. */
const KEYWORDS_WEAK = [
    'admin_user', 'amazonaws', 'apidocs', 'app_debug', 'app_id', 'app_log_level', 'appspot',
    'aws_bucket', 'cache_driver', 'cloudinary_name', 'config', 'database_schema_test',
    'db_server', 'db_username', 'dbuser', 'dotfiles', 'elastica_host', 'elastica_port',
    'conn.login', 'dot-files'
];

/* Assembled from the lists above rather than written as one unreadable
   literal, so a noisy keyword can be moved between tiers in one edit.
   Mirrors the classic secret-grep one-liner: <keyword><filler>
   <assignment><quoted value>. */
function keywordRule(words, flags) {
    const escaped = words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return new RegExp(
        '\\b(?:' + escaped.join('|') + ')[a-z0-9_ .\\-,]{0,25}' +
        '\\s{0,6}(?:=|>|:=|\\|\\|:|<=|=>|:)\\s{0,6}' +
        '[\'"`]([0-9A-Za-z\\-_=+/.~]{8,64})[\'"`]',
        flags
    );
}

const SECRET_RULES = [
    /* ── Cloud providers ───────────────────────────────────────── */
    { name: 'AWS access key id',      conf: 'high',   re: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g },
    { name: 'AWS secret access key',  conf: 'medium', re: /\b(?:aws_secret_access_key|aws_session_token)\b\s*[:=]\s*['"]([^'"]{16,})['"]/gi, group: 1 },
    { name: 'Google API key',         conf: 'high',   re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
    { name: 'Google OAuth client id', conf: 'high',   re: /\b[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com\b/g },
    { name: 'GCP service account',    conf: 'high', structural: true,   re: /"type"\s*:\s*"service_account"/g },
    { name: 'Azure storage key',      conf: 'high', structural: true,   re: /\bAccountKey\s*=\s*[0-9A-Za-z+/=]{60,}/g },
    { name: 'DigitalOcean token',     conf: 'high',   re: /\bdo[oprt]_v1_[0-9a-f]{64}\b/g },
    { name: 'Firebase database',      conf: 'medium', re: /\b[a-z0-9-]+\.firebaseio\.com\b/g },

    /* ── Source hosting and CI ─────────────────────────────────── */
    { name: 'GitHub token',           conf: 'high',   re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g },
    { name: 'GitHub fine-grained',    conf: 'high',   re: /\bgithub_pat_[0-9A-Za-z_]{50,}\b/g },
    { name: 'GitLab token',           conf: 'high',   re: /\bglpat-[0-9A-Za-z\-_]{20,}\b/g },
    { name: 'npm token',              conf: 'high',   re: /\bnpm_[0-9A-Za-z]{36}\b/g },
    { name: 'PyPI token',             conf: 'high',   re: /\bpypi-AgEIcHlwaS5vcmc[0-9A-Za-z\-_]{50,}\b/g },
    { name: 'Vault token',            conf: 'high',   re: /\bhv[sb]\.[0-9A-Za-z\-_]{24,}\b/g },

    /* ── Payments and commerce ─────────────────────────────────── */
    { name: 'Stripe live key',        conf: 'high',   re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g },
    { name: 'Stripe test key',        conf: 'medium', re: /\b(?:sk|rk|pk)_test_[0-9A-Za-z]{20,}\b/g },
    { name: 'Square token',           conf: 'high',   re: /\bsq0(?:atp|csp|idp)-[0-9A-Za-z\-_]{20,}\b/g },
    { name: 'Shopify token',          conf: 'high',   re: /\bshp(?:at|ca|pa|ss)_[0-9a-fA-F]{32}\b/g },
    { name: 'PayPal braintree',       conf: 'high',   re: /\baccess_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}\b/g },

    /* ── Messaging and mail ────────────────────────────────────── */
    { name: 'Slack token',            conf: 'high',   re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
    { name: 'Slack webhook',          conf: 'high', structural: true,   re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]+/g },
    { name: 'Discord bot token',      conf: 'medium', re: /\b[MNO][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g },
    { name: 'Discord webhook',        conf: 'high', structural: true,   re: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[0-9A-Za-z\-_]+/g },
    { name: 'Telegram bot token',     conf: 'high',   re: /\b[0-9]{8,10}:AA[0-9A-Za-z\-_]{33}\b/g },
    { name: 'SendGrid key',           conf: 'high',   re: /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}\b/g },
    { name: 'Mailgun key',            conf: 'high',   re: /\bkey-[0-9a-f]{32}\b/g },
    { name: 'Mailchimp key',          conf: 'high',   re: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g },
    { name: 'Postmark token',         conf: 'medium', re: /\bX-Postmark-Server-Token\s*[:=]\s*['"]?([0-9a-f-]{36})/gi, group: 1 },

    /* ── Telephony, monitoring, AI ─────────────────────────────── */
    { name: 'Twilio account sid',     conf: 'high',   re: /\bAC[0-9a-fA-F]{32}\b/g },
    { name: 'Twilio api key',         conf: 'high',   re: /\bSK[0-9a-fA-F]{32}\b/g },
    { name: 'Sentry DSN',             conf: 'high', structural: true,   re: /https:\/\/[0-9a-f]{32}@[0-9a-z.-]*sentry\.io\/[0-9]+/g },
    { name: 'New Relic key',          conf: 'high',   re: /\bNRAK-[0-9A-Z]{27}\b/g },
    { name: 'Datadog key',            conf: 'medium', re: /\b(?:dd_api_key|datadog_api_key)\b\s*[:=]\s*['"]([0-9a-f]{32})['"]/gi, group: 1 },
    { name: 'OpenAI key',             conf: 'high',   re: /\bsk-(?:proj-|svcacct-)?[0-9A-Za-z_-]{20,}\b/g },
    { name: 'Anthropic key',          conf: 'high',   re: /\bsk-ant-(?:api|admin)[0-9]{2}-[0-9A-Za-z\-_]{20,}\b/g },
    { name: 'HuggingFace token',      conf: 'high',   re: /\bhf_[0-9A-Za-z]{34,}\b/g },

    /* ── SaaS and misc ─────────────────────────────────────────── */
    { name: 'Atlassian token',        conf: 'high',   re: /\bATATT3[0-9A-Za-z\-_=]{20,}\b/g },
    { name: 'Figma token',            conf: 'high',   re: /\bfigd_[0-9A-Za-z\-_]{40,}\b/g },
    { name: 'Linear key',             conf: 'high',   re: /\blin_api_[0-9A-Za-z]{40,}\b/g },
    { name: 'Notion token',           conf: 'high',   re: /\b(?:secret_|ntn_)[0-9A-Za-z]{40,}\b/g },
    { name: 'Algolia admin key',      conf: 'medium', re: /\b(?:algolia[_-]?(?:admin|api)[_-]?key)\b\s*[:=]\s*['"]([0-9a-f]{32})['"]/gi, group: 1 },
    { name: 'Okta token',             conf: 'medium', re: /\b00[0-9A-Za-z\-_]{40}\b/g },

    /* ── Transport-level credentials ───────────────────────────── */
    { name: 'Private key block',      conf: 'high', structural: true,   re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
    { name: 'JWT',                    conf: 'high'  , re: /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/g },
    { name: 'Basic auth in URL',      conf: 'high', structural: true,   re: /\bhttps?:\/\/[^\/\s:@'"]+:[^\/\s:@'"]+@[^\s'"<>]+/g },
    { name: 'DB connection string',   conf: 'high', structural: true,   re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|ftp):\/\/[^\/\s:@'"]+:[^\/\s:@'"]+@[^\s'"<>]+/gi },
    { name: 'Authorization header',   conf: 'medium', re: /\b(?:authorization|proxy-authorization)\b\s*[:=]\s*['"](?:Basic|Bearer|Token)\s+([0-9A-Za-z+/=._-]{16,})['"]/gi, group: 1 },

    /* ── Keyword sweep, lowest precision, widest net ───────────── */
    { name: 'Named credential',       conf: 'medium', re: keywordRule(KEYWORDS_STRONG, 'gi'), group: 1 },
    { name: 'Config keyword',         conf: 'low',    re: keywordRule(KEYWORDS_WEAK, 'gi'),   group: 1 }
];

/* Scanning budget. A source map can carry tens of megabytes of original
 * source, and this runs inside a service worker that the browser is free to
 * kill. Cap the work so a single hostile or merely enormous map cannot wedge
 * the scan. */
const MAX_SOURCES_SCANNED = 250;
const MAX_BYTES_SCANNED = 4 * 1024 * 1024;
const MAX_LINE_LENGTH = 20000;
const MAX_FINDINGS = 200;

/* Runs every rule over one file's text. Mirrors the unmapper's scan loop:
 * highest-confidence rules run first, and a value already claimed on a line
 * is not restated by a later rule. */
function scanText(text, sourcePath, out, seen) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.length < MAX_FINDINGS; i++) {
    const line = lines[i].length > MAX_LINE_LENGTH ? lines[i].slice(0, MAX_LINE_LENGTH) : lines[i];
    for (const rule of SECRET_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        if (m[0].length === 0) { rule.re.lastIndex++; continue; }
        const raw = rule.group !== undefined ? m[rule.group]
                  : (m[1] !== undefined ? m[1] : m[0]);
        if (raw === undefined) continue;
        const value = raw.trim();
        if (!passesGate(value, rule.conf || "medium", rule.structural)) continue;
        const key = sourcePath + "|" + i + "|" + value;
        if (seen[key]) continue;
        seen[key] = true;
        out.push({
          rule: rule.name,
          conf: rule.conf || "medium",
          value: value.length > 200 ? value.slice(0, 200) + "…" : value,
          source: sourcePath,
          line: i + 1,
        });
        if (out.length >= MAX_FINDINGS) return;
      }
    }
  }
}

/* Scans the sourcesContent of a parsed source map. Returns findings plus a
 * per-confidence tally, and says whether the budget cut the scan short so the
 * UI never implies a clean result it did not actually establish. */
function scanSourceMap(json) {
  const sources = Array.isArray(json.sources) ? json.sources : [];
  const contents = Array.isArray(json.sourcesContent) ? json.sourcesContent : [];
  const out = [];
  const seen = Object.create(null);
  let bytes = 0;
  let scanned = 0;
  let truncated = false;

  for (let i = 0; i < contents.length; i++) {
    const text = contents[i];
    if (typeof text !== "string" || text.length === 0) continue;
    if (scanned >= MAX_SOURCES_SCANNED || bytes >= MAX_BYTES_SCANNED || out.length >= MAX_FINDINGS) {
      truncated = true;
      break;
    }
    bytes += text.length;
    scanned++;
    scanText(text, sources[i] || "source[" + i + "]", out, seen);
  }

  const byConf = { high: 0, medium: 0, low: 0 };
  for (const f of out) byConf[f.conf] = (byConf[f.conf] || 0) + 1;

  const rank = { high: 0, medium: 1, low: 2 };
  out.sort(function (a, b) {
    return (rank[a.conf] || 1) - (rank[b.conf] || 1) ||
           a.rule.localeCompare(b.rule) ||
           a.source.localeCompare(b.source) || a.line - b.line;
  });

  return { findings: out, byConf: byConf, scanned: scanned, truncated: truncated };
}

self.SecretScanner = {
  scanSourceMap: scanSourceMap,
  scanText: scanText,
  passesGate: passesGate,
  RULE_COUNT: SECRET_RULES.length,
};
