#!/usr/bin/env python3
"""Compose safety check (N-2).

A first filter that stops us booting a generated Compose file that would give a
container too much power over this machine or expose it to the network.
It is NOT a guarantee. Still read every Compose file and Dockerfile by eye.

Usage:
    tools/compose_check.py <compose file>

Exit codes (boot_and_test.sh treats any non-zero as "blocked"):
    0  no rule fired
    1  at least one rule fired (one line per finding on stdout)
    2  the file could not be checked (fails CLOSED: treat as blocked)

Needs only Python 3 and the Docker CLI (`docker compose config`, no daemon
needed). `docker compose config` expands anchors, `extends`, `include`, env
interpolation and short port syntax, so each rule below sees one normal form.

To add a rule: add a check in `check_service` (or `check_top_level`), then add
a line that triggers it to tools/samples/compose/bad.yml and its expected
rule id to EXPECTED in tools/test_compose_check.sh.
"""
import json
import os
import subprocess
import sys

SENSITIVE_CAPS = {
    "ALL", "SYS_ADMIN", "SYS_PTRACE", "SYS_MODULE", "SYS_RAWIO", "SYS_BOOT",
    "SYS_TIME", "NET_ADMIN", "NET_RAW", "DAC_READ_SEARCH", "DAC_OVERRIDE",
    "SETUID", "SETGID", "MKNOD", "AUDIT_CONTROL", "MAC_ADMIN", "BPF", "PERFMON",
}

# Host paths that must never be mounted into a container.
SENSITIVE_HOST_PATHS = (
    "/", "/etc", "/root", "/home", "/Users", "/var", "/proc", "/sys", "/dev",
    "/boot", "/usr", "/bin", "/sbin", "/lib", "/opt", "/mnt", "/private",
    "/Volumes", "/run", "/tmp",
)
SOCKET_NAMES = ("docker.sock", "containerd.sock", "podman.sock", "crio.sock")

LOCAL_HOST_IPS = {"127.0.0.1", "::1", "localhost"}


def host_mounts_path(source, project_dir):
    """True if a bind-mount source is outside the project folder or sensitive."""
    src = os.path.normpath(source)
    if any(name in src for name in SOCKET_NAMES):
        return "container-runtime socket"
    home = os.path.expanduser("~")
    if src == home or src == os.path.dirname(home):
        return "home directory"
    if src in SENSITIVE_HOST_PATHS or any(
        src.startswith(p + "/") for p in SENSITIVE_HOST_PATHS if p != "/"
    ):
        # Mounts inside the project folder are fine even when the project
        # itself lives under /Users or /home.
        proj = os.path.normpath(project_dir)
        if src == proj or src.startswith(proj + os.sep):
            return None
        return "sensitive host path"
    proj = os.path.normpath(project_dir)
    if not (src == proj or src.startswith(proj + os.sep)):
        return "path outside the project folder"
    return None


def load_config(path):
    try:
        out = subprocess.run(
            ["docker", "compose", "-f", path, "config", "--format", "json", "--no-env-resolution"],
            capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError:
        raise RuntimeError("docker CLI not found")
    except subprocess.TimeoutExpired:
        raise RuntimeError("docker compose config timed out")
    if out.returncode != 0:
        lines = out.stderr.strip().splitlines()
        raise RuntimeError("docker compose config failed: " + (lines[-1] if lines else "no message"))
    return json.loads(out.stdout)


def finding(rule, service, message):
    return f"{rule} [{service}] {message}"


def check_service(name, svc, project_dir):
    f = []

    if svc.get("privileged") is True:
        f.append(finding("C01-privileged", name, "privileged: true gives the container full access to the host"))

    for key, rule in (("network_mode", "C02-host-network"), ("pid", "C03-host-pid"), ("ipc", "C04-host-ipc"), ("userns_mode", "C05-host-userns"), ("cgroup", "C06-host-cgroup")):
        val = svc.get(key)
        if isinstance(val, str) and val.strip().lower() == "host":
            f.append(finding(rule, name, f"{key}: host shares the host's namespace"))
    if isinstance(svc.get("uts"), str) and svc["uts"].strip().lower() == "host":
        f.append(finding("C06-host-uts", name, "uts: host shares the host's namespace"))

    for cap in svc.get("cap_add") or []:
        if str(cap).upper().replace("CAP_", "") in SENSITIVE_CAPS:
            f.append(finding("C07-cap-add", name, f"cap_add: {cap} is a dangerous capability"))

    for dev in svc.get("devices") or []:
        f.append(finding("C08-devices", name, f"devices: {json.dumps(dev) if not isinstance(dev, str) else dev} exposes a host device"))

    for opt in svc.get("security_opt") or []:
        o = str(opt).lower().replace(" ", "")
        if o in ("seccomp=unconfined", "seccomp:unconfined", "apparmor=unconfined", "apparmor:unconfined", "label=disable", "label:disable", "no-new-privileges=false", "no-new-privileges:false"):
            f.append(finding("C09-security-opt", name, f"security_opt: {opt} turns off a container protection"))

    if svc.get("sysctls"):
        f.append(finding("C10-sysctls", name, "sysctls changes kernel settings; not needed for our apps"))

    for vol in svc.get("volumes") or []:
        if isinstance(vol, dict):
            if vol.get("type") == "bind":
                why = host_mounts_path(vol.get("source", ""), project_dir)
                if why:
                    f.append(finding("C11-host-mount", name, f"bind mount of {vol.get('source')} ({why})"))
        elif isinstance(vol, str):
            f.append(finding("C11-host-mount", name, f"unparsed volume entry: {vol}"))

    for port in svc.get("ports") or []:
        if isinstance(port, dict):
            host_ip = port.get("host_ip")
            published = port.get("published")
            if published in (None, "", 0, "0") and not host_ip:
                continue  # container-only port, not published
            if host_ip not in LOCAL_HOST_IPS:
                f.append(finding(
                    "C12-public-port", name,
                    f"port {published or '?'}->{port.get('target')} is bound to "
                    f"{host_ip or 'all interfaces (0.0.0.0)'}; use '127.0.0.1:{published or 'PORT'}:{port.get('target')}'",
                ))
        else:
            f.append(finding("C12-public-port", name, f"unparsed port entry: {port}"))

    for key in ("env_file",):
        for ef in svc.get(key) or []:
            path = ef.get("path") if isinstance(ef, dict) else ef
            if path:
                ap = path if os.path.isabs(path) else os.path.join(project_dir, path)
                ap = os.path.normpath(ap)
                proj = os.path.normpath(project_dir)
                if not (ap == proj or ap.startswith(proj + os.sep)):
                    f.append(finding("C13-outside-file", name, f"env_file {path} is outside the project folder"))

    build = svc.get("build")
    if isinstance(build, dict):
        ctx = build.get("context")
        if ctx:
            ctx = os.path.normpath(ctx)
            proj = os.path.normpath(project_dir)
            if not (ctx == proj or ctx.startswith(proj + os.sep)):
                f.append(finding("C13-outside-file", name, f"build context {ctx} is outside the project folder"))
        if build.get("privileged") is True:
            f.append(finding("C01-privileged", name, "build.privileged: true"))
        if build.get("network") == "host":
            f.append(finding("C02-host-network", name, "build.network: host"))
        if build.get("additional_contexts"):
            f.append(finding("C13-outside-file", name, "build.additional_contexts pulls in extra directories"))

    return f


def check_top_level(cfg, project_dir):
    f = []
    for name, net in (cfg.get("networks") or {}).items():
        if isinstance(net, dict) and net.get("external") is True:
            f.append(finding("C14-external-resource", "networks", f"network {name} is external (shared with something outside this project)"))
        if isinstance(net, dict) and net.get("driver") in ("host", "macvlan", "ipvlan"):
            f.append(finding("C02-host-network", "networks", f"network {name} uses driver {net.get('driver')}"))
    for name, vol in (cfg.get("volumes") or {}).items():
        if isinstance(vol, dict) and vol.get("external") is True:
            f.append(finding("C14-external-resource", "volumes", f"volume {name} is external (could be another project's data)"))
        opts = (vol or {}).get("driver_opts") or {}
        if isinstance(opts, dict) and opts.get("type") == "none" and opts.get("o") and "bind" in str(opts.get("o")):
            dev = str(opts.get("device", ""))
            why = host_mounts_path(dev, project_dir) if dev else "unknown device path"
            if why:
                f.append(finding("C11-host-mount", "volumes", f"volume {name} is a bind mount of {dev} ({why})"))
    for kind in ("secrets", "configs"):
        for name, item in (cfg.get(kind) or {}).items():
            fpath = item.get("file") if isinstance(item, dict) else None
            if fpath:
                ap = os.path.normpath(fpath)
                proj = os.path.normpath(project_dir)
                if not (ap == proj or ap.startswith(proj + os.sep)):
                    f.append(finding("C13-outside-file", kind, f"{kind[:-1]} {name} reads {fpath} from outside the project folder"))
    return f


def main(argv):
    if len(argv) != 2:
        print("usage: compose_check.py <compose file>", file=sys.stderr)
        return 2
    path = os.path.abspath(argv[1])
    if not os.path.isfile(path):
        print(f"cannot check: {path} not found", file=sys.stderr)
        return 2
    project_dir = os.path.dirname(path)
    try:
        cfg = load_config(path)
    except Exception as exc:  # fail closed
        print(f"CANNOT CHECK {path}: {exc}")
        return 2

    findings = check_top_level(cfg, project_dir)
    services = cfg.get("services") or {}
    if not services:
        print(f"CANNOT CHECK {path}: no services found")
        return 2
    for name, svc in services.items():
        findings.extend(check_service(name, svc or {}, project_dir))

    if findings:
        print(f"BLOCKED {path}: {len(findings)} problem(s)")
        for line in findings:
            print("  " + line)
        return 1
    print(f"OK {path}: no rule fired (still read it by eye)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
