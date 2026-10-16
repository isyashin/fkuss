#!/usr/bin/env python3
"""Install one root cron.d file; preserve all unrelated schedules."""
import os
from pathlib import Path
import shlex
import re
import subprocess
import sys
from topology import load_config, run

path = Path(sys.argv[1]).resolve()
config = load_config(path)
if os.geteuid() != 0:
    raise SystemExit("Run as root (cron.d, private backups, Caddy reload)")
scripts = Path(config["sourceDir"], "scripts")
# Remove only known jobs of configured tenant ports from the previous user cron.
# Tokens can be present in legacy lines; neither print nor copy them into logs.
user = config.get("operatorUser")
if user:
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        raise SystemExit("invalid operatorUser")
    previous = subprocess.run(["crontab", "-u", user, "-l"], capture_output=True, text=True)
    keep = []
    for line in previous.stdout.splitlines():
        managed = any(re.search(rf"# resto {re.escape(site['slug'])} (report-metrics|sync-menu|push-delivery)$", line)
            or re.search(rf"(?:localhost|127\.0\.0\.1):{site['port']}/api/jobs/(report-metrics|sync-menu|push-delivery)(?:\s|$)", line)
            for site in config["sites"])
        if not managed:
            keep.append(line)
    if previous.returncode == 0:
        run(["crontab", "-u", user, "-"], '\n'.join(keep) + '\n')
logs = Path(config["baseDir"], "logs")
logs.mkdir(parents=True, exist_ok=True)
logs.chmod(0o700)
runner = scripts / "run-site-job.sh"
entries = ["SHELL=/bin/bash", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"]
for site in config["sites"]:
    for schedule, job in [("0 */6 * * *", "report-metrics"), ("*/15 * * * *", "sync-menu"), ("* * * * *", "push-delivery")]:
        command = shlex.join(["bash", str(runner), str(site["port"]), site["envFile"], job])
        entries.append(f"{schedule} root {command} >>{shlex.quote(str(logs / (site['slug']+'-'+job+'.log')))} 2>&1")
platform = config["platform"]
command = shlex.join(["bash", str(runner), str(platform["port"]), platform["envFile"], "billing-daily"])
entries.append(f"30 4 * * * root {command} >>{shlex.quote(str(logs / 'billing.log'))} 2>&1")
for schedule, job in [("0 5 * * *", "backup"), ("*/5 * * * *", "exports"), ("* * * * *", "caddy")]:
    command = shlex.join(["python3", str(scripts / "topology.py"), str(path), job, "--apply"])
    entries.append(f"{schedule} root {command} >>{shlex.quote(str(logs / (job+'.log')))} 2>&1")
target = Path('/etc/cron.d/fkuss-topology')
target.write_text('\n'.join(entries) + '\n')
target.chmod(0o644)
Path('/etc/logrotate.d/fkuss-topology').write_text(str(logs / '*.log') + ' {\n daily\n rotate 14\n compress\n missingok\n notifempty\n copytruncate\n create 0600 root root\n}\n')
print(f"Installed {len(entries)-2} jobs for {len(config['sites'])} sites and platform")
