export interface NmapService {
  ip: string;
  port: string;
  state: string;
  service: string;
  version: string;
  scripts: string[];
}

export interface ProcessedResults {
  matched: NmapService[];
  unmatched: NmapService[];
}

/**
 * Split a search string into terms, treating "quoted phrases" as single terms.
 * e.g. `smb "port:445"` -> ["smb", "port:445"]
 */
export const parseSearchString = (searchString: string): string[] =>
  (searchString.match(/"[^"]+"|[^\s"]+/g) || []).map((term) =>
    term.replace(/"/g, "").trim()
  );

/**
 * True when a service carries any version information, either on the service
 * banner itself or inside one of its NSE script lines.
 */
export const hasVersionInfo = (service: NmapService): boolean => {
  if (
    (service.version && service.version.trim() !== "") ||
    (service.service && service.service.toLowerCase().includes("version"))
  ) {
    return true;
  }

  return service.scripts.some(
    (script) =>
      script.toLowerCase().includes("version:") ||
      script.toLowerCase().includes("version =") ||
      script.match(/vers?\.?:?\s*\d+/) !== null
  );
};

/**
 * A service matches when EVERY search term matches. Terms support:
 *   - `port:<n>`  exact port match
 *   - `version:`  service has version information
 *   - anything else: case-insensitive substring over service/version/state/port/scripts
 */
export const matchesSearch = (
  service: NmapService,
  searchTerms: string[]
): boolean => {
  const searchableText = [
    service.service,
    service.version,
    service.state,
    service.port,
    ...service.scripts.map((script) => {
      const parts = script.split(":");
      return parts.length > 1
        ? `${parts[0].trim()} ${parts.slice(1).join(":").trim()}`
        : script;
    }),
  ]
    .join(" ")
    .toLowerCase();

  return searchTerms.every((term) => {
    if (term.toLowerCase().startsWith("port:")) {
      const portNumber = term.split(":")[1];
      return service.port === portNumber;
    }

    if (term.toLowerCase() === "version:") {
      return hasVersionInfo(service);
    }

    return searchableText.includes(term.toLowerCase());
  });
};

/**
 * Parse raw `nmap` console output into services, split by whether they match
 * the search string.
 */
export const processNmapResults = (
  nmapResults: string,
  searchString: string
): ProcessedResults => {
  if (!nmapResults || !searchString) {
    throw new Error("Please provide both Nmap results and search string");
  }

  const searchTerms = parseSearchString(searchString);
  const matched: NmapService[] = [];
  const unmatched: NmapService[] = [];

  let currentService: Partial<NmapService> = {};
  let currentScripts: string[] = [];
  let inScriptBlock = false;

  const flush = () => {
    if (currentService.ip && currentService.port) {
      const service = { ...currentService, scripts: currentScripts } as NmapService;
      if (matchesSearch(service, searchTerms)) {
        matched.push(service);
      } else {
        unmatched.push(service);
      }
    }
  };

  const lines = nmapResults.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      inScriptBlock = false;
      continue;
    }

    const hostMatch = line.match(
      /^Nmap scan report for ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/
    );
    if (hostMatch) {
      flush();
      currentService = { ip: hostMatch[1] };
      currentScripts = [];
      inScriptBlock = false;
      continue;
    }

    const portMatch = line.match(/^(\d+)\/(\w+)\s+(\w+)\s+(.+)/);
    if (portMatch && currentService.ip) {
      flush();

      currentService = {
        ...currentService,
        port: portMatch[1],
        state: portMatch[3],
        service: portMatch[4] || "",
        version: "",
      };

      if (currentService.service) {
        const versionMatch = currentService.service.match(/version\s+([^,]+)/i);
        if (versionMatch) {
          currentService.version = versionMatch[1];
        }
      }

      currentScripts = [];
      inScriptBlock = false;
      continue;
    }

    if (line.startsWith("|")) {
      const scriptLine = line.replace(/^\|[_]?\s*/, "").trim();
      if (scriptLine) {
        if (scriptLine.includes(":")) {
          currentScripts.push(scriptLine);
          inScriptBlock = true;
        } else if (inScriptBlock) {
          currentScripts[currentScripts.length - 1] += " " + scriptLine;
        }
      }
      continue;
    }
  }

  flush();

  return { matched, unmatched };
};

/**
 * Render the version summary for a set of services, one `ip:port - service (version)`
 * line each. Services without version information are skipped.
 */
export const formatVersionResults = (services: NmapService[]): string => {
  const withVersions = services.filter(hasVersionInfo);

  if (withVersions.length === 0) {
    return "No services with version information found.";
  }

  return withVersions
    .map((service) => {
      let version = service.version;

      if (!version || version.trim() === "") {
        const versionMatch = service.service.match(/version ([^,]+)/i);
        if (versionMatch) {
          version = versionMatch[1];
        } else if (service.service.toLowerCase().includes("version")) {
          version = service.service;
        } else {
          const scriptVersion = service.scripts.find(
            (script) =>
              script.toLowerCase().includes("version:") ||
              script.toLowerCase().includes("version =") ||
              script.match(/vers?\.?:?\s*\d+/)
          );
          if (scriptVersion) {
            version = scriptVersion;
          }
        }
      }

      return `${service.ip}:${service.port} - ${service.service}${
        version ? ` (${version})` : ""
      }`;
    })
    .join("\n");
};

/**
 * The "Extract Versions" helper. Runs entirely locally: it settles after a short
 * delay and hands back the `"version:"` search term, which the version-detection
 * branch of `matchesSearch` then resolves against every parsed service.
 */
export const aiExtractVersions = (_nmapResults: string): Promise<string> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('"version:"');
    }, 1500);
  });
