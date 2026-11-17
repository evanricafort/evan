/*
 * Badges & certificates for the homepage.
 *
 * To add one: drop an entry in the array below. Order here is the order on
 * the page.
 *
 * `issuer` and `detail` are inserted as HTML, so escape a literal & as
 * &amp;. `detail` is whatever sits between the issuer and the link -- it
 * ends with "Certificate ID." or "Badge ID." on most, and on the TCM one it
 * is just the course name.
 */
window.BADGES = [
    { issuer: "Cyber Security and Privacy Foundation Pte Ltd",
      detail: "Certified Whitehat Hacker v1 (CWHH) - Certificate ID.",
      href: "https://www.udemy.com/certificate/UC-SD45SNW8/",
      label: "UC-SD45SNW8" },
    { issuer: "Ben Sadeghipour (@NahamSec)",
      detail: "Intro to Bug Bounty Hunting and Web Application Hacking - Certificate ID.",
      href: "https://www.ude.my/UC-d8e7bc7d-d3eb-4646-9a06-3c09d1bbf5f5/",
      label: "UC-d8e7bc7d-d3eb-4646-9a06-3c09d1bbf5f5" },
    { issuer: "TCM Security Inc.",
      detail: "Practical Ethical Hacking - The Complete Course",
      href: "https://evanricafort.com/certificates/PEHTCCCertificate.pdf",
      label: "PEH - The Complete Course" },
    { issuer: "The SecOps Group",
      detail: "Certified AppSec Practitioner (CAP) - Certificate ID.",
      href: "https://evanricafort.com/certificates/EvandneDylRicafort-CertifiedAppSecPractitioner(CAP).pdf",
      label: "8860312" },
    { issuer: "The SecOps Group",
      detail: "Certified Network Security Practitioner (CNSP) - Certificate ID.",
      href: "https://evanricafort.com/certificates/EvandneDylRicafort-CertifiedNetworkSecurityPractitioner.pdf",
      label: "8907719" },
    { issuer: "PentesterLab",
      detail: "PentesterLab's Introduction Badge - Badge ID.",
      href: "https://pentesterlab.com/profile/evanricafort",
      label: "PTLN9552" },
    { issuer: "PentesterLab",
      detail: "PentesterLab's Essential Badge - Badge ID.",
      href: "https://pentesterlab.com/profile/evanricafort",
      label: "PTLE2521" },
];
