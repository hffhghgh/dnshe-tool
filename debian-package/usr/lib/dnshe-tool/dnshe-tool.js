#!/usr/bin/env node

"use strict";

const { Command } = require("commander");
const readline = require("node:readline/promises");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const program = new Command();

const VERSION = "1.0.0";
const BASE = "https://api005.dnshe.com/index.php?m=domain_hub";

const CONFIG_DIR = path.join(os.homedir(), ".config", "dnshe-tool");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), {
    mode: 0o600
  });
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function getConfig() {
  return loadConfig();
}

async function prompt(question) {
  return (await rl.question(question)).trim();
}

async function credentials() {
  const config = getConfig();

  const apiKey = process.env.DNSHE_API_KEY || config.apiKey;
  const apiSecret = process.env.DNSHE_API_SECRET || config.apiSecret;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Not logged in. Run: dnshe-tool auth login"
    );
  }

  return {
    "X-API-Key": apiKey,
    "X-API-Secret": apiSecret
  };
}

function parseData(value) {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("--data must contain valid JSON");
  }
}

async function api(endpoint, action, options = {}) {
  const {
    method = "GET",
    params = {},
    body,
    auth = true,
    headers = {}
  } = options;

  const url = new URL(BASE);
  url.searchParams.set("endpoint", endpoint);

  if (action) url.searchParams.set("action", action);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const requestHeaders = { ...headers };

  if (auth) {
    Object.assign(requestHeaders, await credentials());
  }

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = text;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  console.log(
    typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2)
  );

  return result;
}

function addDataOption(command) {
  return command.option("--data <json>", "JSON request body");
}

// ROOT
program
  .name("dnshe-tool")
  .description("DNSHE Domain Hub API CLI")
  .version(VERSION, "-v, --version");

// AUTH
const auth = program.command("auth").description("Authentication");

auth.command("login")
  .description("Login and save DNSHE API credentials")
  .action(async () => {
    const apiKey =
      process.env.DNSHE_API_KEY ||
      await prompt("DNSHE API Key: ");

    const apiSecret =
      process.env.DNSHE_API_SECRET ||
      await prompt("DNSHE API Secret: ");

    const ddnsToken =
      process.env.DNSHE_DDNS_TOKEN ||
      await prompt("DNSHE DDNS Token (optional): ");

    if (!apiKey || !apiSecret) {
      throw new Error("API key and secret are required.");
    }

    saveConfig({ apiKey, apiSecret, ddnsToken });

    console.log("DNSHE credentials saved.");
  });

auth.command("status")
  .description("Show local authentication status")
  .action(() => {
    const config = getConfig();

    console.log("DNSHE Authentication");
    console.log("API Key:", process.env.DNSHE_API_KEY || config.apiKey ? "Configured" : "Missing");
    console.log("API Secret:", process.env.DNSHE_API_SECRET || config.apiSecret ? "Configured" : "Missing");
    console.log("DDNS Token:", process.env.DNSHE_DDNS_TOKEN || config.ddnsToken ? "Configured" : "Missing");
  });

auth.command("logout")
  .description("Remove saved credentials")
  .action(() => {
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch {}

    console.log("Logged out. Saved credentials removed.");
  });

// DOMAINS
const domains = program.command("domains").description("Manage subdomains");

domains.command("list")
  .description("List subdomains")
  .option("--search <value>")
  .option("--rootdomain <value>")
  .option("--status <value>")
  .option("--sort-by <value>")
  .option("--sort-dir <value>")
  .option("--per-page <number>")
  .option("--cursor-id <number>")
  .option("--fields <value>")
  .action(async (o) => {
    await api("subdomains", "list", {
      params: {
        search: o.search,
        rootdomain: o.rootdomain,
        status: o.status,
        sort_by: o.sortBy,
        sort_dir: o.sortDir,
        per_page: o.perPage,
        cursor_id: o.cursorId,
        fields: o.fields
      }
    });
  });

domains.command("create")
  .description("Register a subdomain")
  .option("--subdomain <name>")
  .option("--domain <domain>")
  .action(async (o) => {
    const subdomain = o.subdomain || await prompt("Subdomain: ");
    const domain = o.domain || await prompt("Root domain: ");

    await api("subdomains", "create", {
      method: "POST",
      body: { subdomain, domain }
    });
  });

domains.command("get")
  .description("Get subdomain details and DNS records")
  .requiredOption("--id <id>")
  .action(async (o) => {
    await api("subdomains", "get", {
      params: { subdomain_id: o.id }
    });
  });

domains.command("renew")
  .description("Renew a subdomain")
  .requiredOption("--id <id>")
  .action(async (o) => {
    await api("subdomains", "renew", {
      method: "POST",
      body: { subdomain_id: o.id }
    });
  });

domains.command("delete")
  .description("Delete a subdomain")
  .requiredOption("--id <id>")
  .option("--yes", "Skip confirmation")
  .action(async (o) => {
    if (!o.yes) {
      const answer = await prompt(`Delete subdomain ${o.id}? (yes/no): `);
      if (answer.toLowerCase() !== "yes") return;
    }

    await api("subdomains", "delete", {
      method: "POST",
      body: { subdomain_id: o.id }
    });
  });

// DNS RECORDS
const dns = program.command("dns").description("Manage DNS records");

dns.command("list")
  .requiredOption("--id <id>")
  .action(async (o) => {
    await api("dns_records", "list", {
      params: { subdomain_id: o.id }
    });
  });

addDataOption(dns.command("create").description("Create DNS record"))
  .action(async (o) => {
    const body = parseData(o.data) || {
      subdomain_id: await prompt("Subdomain ID: "),
      type: await prompt("Record type (A/AAAA/CNAME/MX/TXT/NS/SRV/CAA): "),
      name: await prompt("Record name (@ for root): "),
      content: await prompt("Record content: ")
    };

    await api("dns_records", "create", {
      method: "POST",
      body
    });
  });

addDataOption(dns.command("update").description("Modify DNS record"))
  .action(async (o) => {
    const body = parseData(o.data) || {
      id: await prompt("Record ID: "),
      type: await prompt("Record type: "),
      content: await prompt("Record content: "),
      ttl: Number(await prompt("TTL: ") || 600)
    };

    await api("dns_records", "modify", {
      method: "POST",
      body
    });
  });

dns.command("delete")
  .description("Delete DNS record by ID or provider record ID")
  .option("--id <id>")
  .option("--record-id <id>")
  .option("--yes")
  .action(async (o) => {
    let body;

    if (o.id) body = { id: o.id };
    else if (o.recordId) body = { record_id: o.recordId };
    else throw new Error("Provide --id or --record-id");

    if (!o.yes) {
      const answer = await prompt("Delete this DNS record? (yes/no): ");
      if (answer.toLowerCase() !== "yes") return;
    }

    await api("dns_records", "delete", {
      method: "POST",
      body
    });
  });

// DDNS
const ddns = program.command("ddns").description("Dynamic DNS");

ddns.command("update")
  .description("Update dynamic IP")
  .option("--ip <address>")
  .action(async (o) => {
    const config = getConfig();
    const token = process.env.DNSHE_DDNS_TOKEN || config.ddnsToken;

    if (!token) throw new Error("Missing DNSHE DDNS token.");

    const headers = o.ip
      ? { "X-DDNS-Token": token }
      : { Authorization: `Bearer ${token}` };

    await api("ddns", "update", {
      method: "POST",
      auth: false,
      headers,
      body: o.ip ? { ip: o.ip } : undefined
    });
  });

// API KEYS
const keys = program.command("keys").description("Manage API keys");

keys.command("list").action(async () => {
  await api("keys", "list");
});

keys.command("create")
  .option("--name <name>")
  .option("--whitelist <ip>")
  .action(async (o) => {
    const body = {
      key_name: o.name || await prompt("Key name: "),
      ip_whitelist: o.whitelist || ""
    };

    await api("keys", "create", {
      method: "POST",
      body
    });
  });

for (const action of ["regenerate", "delete"]) {
  keys.command(action)
    .requiredOption("--id <id>")
    .option("--yes")
    .action(async (o) => {
      if (action === "delete" && !o.yes) {
        const answer = await prompt("Delete API key? (yes/no): ");
        if (answer.toLowerCase() !== "yes") return;
      }

      await api("keys", action, {
        method: "POST",
        body: { key_id: o.id }
      });
    });
}

// DOMAIN GIFTS
const gifts = program.command("domain-gifts").description("Domain gifts");

gifts.command("list").action(async () => {
  await api("gifts", "list");
});

gifts.command("initiate")
  .requiredOption("--id <id>")
  .action(async (o) => {
    await api("gifts", "initiate", {
      method: "POST",
      body: { subdomain_id: o.id }
    });
  });

gifts.command("accept")
  .option("--code <code>")
  .action(async (o) => {
    const code = o.code || await prompt("Gift code: ");

    await api("gifts", "accept", {
      method: "POST",
      body: { code }
    });
  });

gifts.command("cancel")
  .requiredOption("--id <id>")
  .action(async (o) => {
    await api("gifts", "cancel", {
      method: "POST",
      body: { gift_id: o.id }
    });
  });

// QUOTA
program.command("quota")
  .description("Show account quota")
  .action(async () => {
    await api("quota");
  });

// WHOIS (NO LOGIN)
program.command("whois")
  .description("Look up domain WHOIS information")
  .requiredOption("--domain <domain>")
  .action(async (o) => {
    await api("whois", null, {
      auth: false,
      params: { domain: o.domain }
    });
  });

// ERROR HANDLING
program.showHelpAfterError();
program.showSuggestionAfterError();

program.parseAsync(process.argv)
  .catch((error) => {
    console.error("\nDNSHE Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });

