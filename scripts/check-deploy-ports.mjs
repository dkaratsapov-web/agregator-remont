// Проверка серверной конфигурации Compose: наружу опубликован только Caddy (80/443).
// Использование: docker compose ... config --format json | node scripts/check-deploy-ports.mjs
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const config = JSON.parse(Buffer.concat(chunks).toString());

const failures = [];
for (const [name, service] of Object.entries(config.services)) {
  const ports = (service.ports ?? []).map(
    (p) => `${p.host_ip ?? '0.0.0.0'}:${p.published}->${p.target}`,
  );
  if (name === 'caddy') {
    const published = new Set((service.ports ?? []).map((p) => String(p.published)));
    if (!published.has('80') || !published.has('443'))
      failures.push('caddy must publish 80 and 443');
  } else if (ports.length > 0) {
    failures.push(`${name} must not publish ports on the host, found: ${ports.join(', ')}`);
  }
  console.log(`${name}: ${ports.length ? ports.join(', ') : 'no published ports'}`);
}
for (const name of ['db', 'migrate', 'api']) {
  const networks = Object.keys(config.services[name].networks ?? {});
  if (networks.join() !== 'backend')
    failures.push(`${name} must be only on the internal backend network, got ${networks}`);
}
if (config.networks?.backend?.internal !== true) failures.push('backend network must be internal');

if (failures.length > 0) {
  console.error(`\nFAIL\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nDeploy port and network checks passed');
