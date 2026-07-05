// log for the dashboard
export function log(type, message) {
  const file = `/var/log/erin/${type}.log`;

  fs.mkdirSync(`/var/log/erin/${type.split("/")[0]}`, { recursive: true });

  fs.appendFileSync(
    file,
    `[${new Date().toISOString()}] ${message}\n`
  );
}