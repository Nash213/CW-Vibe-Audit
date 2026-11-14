#!/usr/bin/env bash
# Self-test for tools/compose_check.py: the good sample passes, the bad sample is
# blocked, and every rule id (and every bad service) is reported.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/compose_check.py"
GOOD="$HERE/samples/compose/good.yml"
BAD="$HERE/samples/compose/bad.yml"
fail=0

out="$("$CHECK" "$GOOD")"; rc=$?
if [ $rc -eq 0 ]; then echo "PASS good sample accepted"; else echo "FAIL good sample blocked (rc=$rc)"; echo "$out"; fail=1; fi

out="$("$CHECK" "$BAD")"; rc=$?
if [ $rc -eq 1 ]; then echo "PASS bad sample blocked"; else echo "FAIL bad sample rc=$rc (want 1)"; fail=1; fi

# Every rule must fire at least once on the bad sample.
for rule in C01-privileged C02-host-network C03-host-pid C04-host-ipc C05-host-userns \
            C06-host-uts C07-cap-add C08-devices C09-security-opt C10-sysctls \
            C11-host-mount C12-public-port C13-outside-file C14-external-resource; do
  if printf '%s\n' "$out" | grep -q "$rule"; then echo "PASS rule $rule fired"; else echo "FAIL rule $rule did not fire"; fail=1; fi
done

# Every risky service in the bad sample must be named in the output.
for svc in priv hostnet hostpid hostipc hostuserns hostuts caps dev noprot sysctl sock rootmount home outside openport outsidefile; do
  if printf '%s\n' "$out" | grep -q "\[$svc\]"; then echo "PASS service $svc flagged"; else echo "FAIL service $svc not flagged"; fail=1; fi
done

# Fail closed: a missing file and a broken file must not exit 0.
"$CHECK" /nonexistent.yml >/dev/null 2>&1; [ $? -eq 2 ] && echo "PASS missing file -> 2" || { echo "FAIL missing file"; fail=1; }
tmp="$(mktemp -d)"; printf 'services: [not, a, map\n' > "$tmp/broken.yml"
"$CHECK" "$tmp/broken.yml" >/dev/null 2>&1; [ $? -eq 2 ] && echo "PASS broken yaml -> 2" || { echo "FAIL broken yaml"; fail=1; }
rm -rf "$tmp"

[ $fail -eq 0 ] && echo "ALL OK" || echo "FAILURES"
exit $fail
