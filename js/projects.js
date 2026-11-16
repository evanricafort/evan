/*
 * Projects & Toolkits list for the homepage.
 *
 * To add a tool: drop one entry in the array below. Order here is the order
 * on the page, so moving an entry moves the card.
 *
 * `name` and `description` are inserted as HTML, so escape a literal & as
 * &amp;. `href` is the link, `label` the text shown for it.
 */
window.PROJECTS = [
    { name: "Lazymap",
      description: "NMAP Equipped Network Penetration Testing Tool",
      href: "https://github.com/evanricafort/lazymap",
      label: "https://github.com/evanricafort/lazymap" },
    { name: "SegIt",
      description: "Automated Network Segmentation Testing Kit",
      href: "https://github.com/evanricafort/segit",
      label: "https://github.com/evanricafort/segit" },
    { name: "SPF Record Detector",
      description: "Validate email security configurations and analyze SPF records",
      href: "/tools/spfrecordchecker",
      label: "https://evanricafort.com/tools/spfrecordchecker" },
    { name: "SSL Certificate Analyzer",
      description: "Analyze weak hash, expiry, wildcards and issuer",
      href: "/tools/weaksslcerts",
      label: "https://evanricafort.com/tools/weaksslcerts" },
    { name: "Weak SSL Cipher Analyzer",
      description: "Analyze weak SSL Cipher/Protocols from nmap scan result.",
      href: "/tools/weaksslciphers",
      label: "https://evanricafort.com/tools/weaksslciphers" },
    { name: "SSH Security Analyzer",
      description: "Analyze SSH configurations or nmap scans for cryptographic risks.",
      href: "/tools/sshsecurity",
      label: "https://evanricafort.com/tools/sshsecurity" },
    { name: "JS SourceMap Unmapper",
      description: "Recover original sources from a .map file, then scan them for secrets and endpoints.",
      href: "/tools/sourcemapunmapper",
      label: "https://evanricafort.com/tools/sourcemapunmapper" },
    { name: "JWT Auditor",
      description: "JWT Security Testing Tool",
      href: "/tools/jwtauditor",
      label: "https://evanricafort.com/tools/jwtauditor" },
    { name: "Google / Gemini API Key Checker",
      description: "Test a leaked API key against Gemini and Google services.",
      href: "/tools/googleapikeychecker",
      label: "https://evanricafort.com/tools/googleapikeychecker" },
    { name: "Wayback (Web Archive)",
      description: "Web archive URL fetcher.",
      href: "/tools/webarchive",
      label: "https://evanricafort.com/tools/webarchive" },
    { name: "Nmap Result Parser",
      description: "NMAP sorting tool for version disclosure.",
      href: "/tools/nmapresultparser",
      label: "https://evanricafort.com/tools/nmapresultparser" },
    { name: "NMAP Sorting Kit",
      description: "NMAP result sorting kit.",
      href: "/tools/nmapsortingkit",
      label: "https://evanricafort.com/tools/nmapsortingkit" },
    { name: "COOP / Tabnabbing PoC",
      description: "Demonstrates a missing Cross-Origin-Opener-Policy by keeping an opener handle and navigating the opened window",
      href: "/tools/coop",
      label: "https://evanricafort.com/tools/coop" },
    { name: "Proofreader &amp; Analyzer",
      description: "Check grammar, spelling, punctuation and style with two independent engines.",
      href: "/tools/proofreader",
      label: "https://evanricafort.com/tools/proofreader" },
    { name: "SourceMap Radar",
      description: "Chrome and Edge extension that scans every page you visit for exposed JavaScript and CSS source maps",
      href: "/tools/sourcemapradar",
      label: "https://evanricafort.com/tools/sourcemapradar" },
    { name: "Asgard Magic Importer",
      description: "Browser extension that drops a drafted finding into every field of the report form in one click",
      href: "/tools/asgardmagicimporter",
      label: "https://evanricafort.com/tools/asgardmagicimporter" },
    { name: "PH Mobile Number Generator",
      description: "Python script that generates random Philippine mobile numbers across Globe, TM, Smart, TNT and DITO prefixes, for test data",
      href: "/tools/phmobilenumbergenerator",
      label: "https://evanricafort.com/tools/phmobilenumbergenerator" },
];
