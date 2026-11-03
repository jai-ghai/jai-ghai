// Builds on-brand stats cards from the GitHub API. Run in CI with GITHUB_TOKEN.
// `node scripts/stats.mjs <outDir> --mock` renders sample numbers for a visual check.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir = "dist", flag] = process.argv.slice(2);
const user = process.env.GITHUB_REPOSITORY_OWNER || "jai-ghai";
const token = process.env.GITHUB_TOKEN;
const SANS = "Geist, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', 'Cascadia Mono', Consolas, monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => new Intl.NumberFormat("en-IN").format(n);

async function load() {
  if (flag === "--mock") {
    return { repos: 14, stars: 23, followers: 41, contributions: 1286, langs: [["Python", 6], ["TypeScript", 4], ["JavaScript", 2], ["Java", 1]] };
  }
  const gh = (url, body) =>
    fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "profile-stats", Accept: "application/vnd.github+json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json();
    });

  const q = `query($login:String!){user(login:$login){followers{totalCount}
    contributionsCollection{contributionCalendar{totalContributions}}
    repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100){totalCount nodes{stargazerCount primaryLanguage{name}}}}}`;
  const { data } = await gh("https://api.github.com/graphql", { query: q, variables: { login: user } });
  const u = data.user;
  const langs = new Map();
  let stars = 0;
  for (const r of u.repositories.nodes) {
    stars += r.stargazerCount;
    if (r.primaryLanguage) langs.set(r.primaryLanguage.name, (langs.get(r.primaryLanguage.name) || 0) + 1);
  }
  return {
    repos: u.repositories.totalCount,
    stars,
    followers: u.followers.totalCount,
    contributions: u.contributionsCollection.contributionCalendar.totalContributions,
    langs: [...langs].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

const themes = {
  dark: { bg: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A2540"/><stop offset="1" stop-color="#1A3A5C"/></linearGradient>`, fill: "url(#bg)", border: null, ink: "#FFFFFF", muted: "#FFFFFF", mutedOp: 0.68, line: "#FFFFFF", lineOp: 0.14, track: "#FFFFFF", trackOp: 0.1, bar: "#A9C5E0", accent: "#F9C642", label: "#F9C642" },
  light: { bg: "", fill: "#F5F5F5", border: "#0A2540", ink: "#0A2540", muted: "#333333", mutedOp: 0.8, line: "#0A2540", lineOp: 0.14, track: "#0A2540", trackOp: 0.08, bar: "#1A3A5C", accent: "#F9C642", label: "#7A5800" },
};

function card(t, d) {
  const W = 1280, H = 304;
  const stats = [["Public repos", d.repos], ["Stars earned", d.stars], ["Followers", d.followers], ["Contributions, last year", d.contributions]];
  const colW = (W - 112) / 4;
  const statSvg = stats
    .map(([k, v], i) => {
      const x = 56 + i * colW;
      return `<text x="${x}" y="144" font-family="${MONO}" font-size="44" font-weight="600" fill="${t.ink}">${num(v)}</text><text x="${x}" y="172" font-family="${MONO}" font-size="13" letter-spacing="1.5" fill="${t.muted}" fill-opacity="${t.mutedOp}">${esc(k.toUpperCase())}</text>`;
    })
    .join("");
  const total = d.langs.reduce((s, [, n]) => s + n, 0);
  const rows = total
    ? d.langs
        .map(([name, n], i) => {
          const pct = Math.round((n / total) * 100);
          const x = 56 + i * ((W - 112) / d.langs.length);
          const bw = (W - 112) / d.langs.length - 24;
          return `<text x="${x}" y="256" font-family="${SANS}" font-size="15" font-weight="500" fill="${t.ink}">${esc(name)}</text><text x="${x + bw}" y="256" text-anchor="end" font-family="${MONO}" font-size="14" fill="${t.muted}" fill-opacity="${t.mutedOp}">${pct}%</text><rect x="${x}" y="268" width="${bw}" height="6" rx="3" fill="${t.track}" fill-opacity="${t.trackOp}"/><rect x="${x}" y="268" width="${Math.max(6, (bw * pct) / 100)}" height="6" rx="3" fill="${i === 0 ? t.accent : t.bar}"/>`;
        })
        .join("")
    : `<text x="56" y="258" font-family="${SANS}" font-size="15" fill="${t.muted}" fill-opacity="${t.mutedOp}">No public repositories yet.</text>`;
  const table = `${stats.map(([k, v]) => `${k}: ${num(v)}`).join(". ")}. Languages: ${d.langs.map(([n, c]) => `${n} ${c}`).join(", ") || "none"}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
  <title id="t">GitHub activity</title>
  <desc id="d">${esc(table)}</desc>
  <defs>${t.bg}</defs>
  <rect width="${W}" height="${H}" rx="28" fill="${t.fill}"/>
  ${t.border ? `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="27.5" fill="none" stroke="${t.border}" stroke-opacity="0.12"/>` : ""}
  <rect x="56" y="40" width="40" height="5" rx="2.5" fill="${t.accent}"/>
  <text x="56" y="76" font-family="${SANS}" font-size="22" font-weight="700" fill="${t.ink}">GitHub activity</text>
  ${statSvg}
  <line x1="56" y1="200" x2="${W - 56}" y2="200" stroke="${t.line}" stroke-opacity="${t.lineOp}"/>
  <text x="56" y="230" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${t.label}">TOP LANGUAGES, BY REPOSITORY</text>
  ${rows}
</svg>
`;
}

const data = await load();
mkdirSync(outDir, { recursive: true });
for (const [name, t] of Object.entries(themes)) writeFileSync(join(outDir, `stats-${name}.svg`), card(t, data));
console.log("stats written", data);
