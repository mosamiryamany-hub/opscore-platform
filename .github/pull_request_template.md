<!--- Provide a general summary in the Title above -->

## Description
<!--- Describe your changes in detail -->

## Motivation and context
<!--- Why is this change required? Which measured evidence does it close? -->

## Verification evidence (closing proof)
<!--- For each claim, name the command/output that proves it. -->
- [ ] `node --check` passes on all touched JS files
- [ ] Targeted tests executed and passing (name them)
- [ ] No secrets in diff (`gitleaks` clean)
- [ ] CI actions pinned to full SHAs (`grep -rn "uses: actions/" .github/workflows | grep -v "@[0-9a-f]\{40\}"` empty)
- [ ] No application role gains `BYPASSRLS`/DDL privileges

## Screenshots / outputs (if appropriate)
