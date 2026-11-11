# Release Commands — v0.9.0-alpha

Execute these commands manually after reviewing the release.

---

## Pre-flight Checks

```bash
# Verify clean compilation
npx tsc --noEmit

# Verify all tests pass
npx vitest --run

# Verify examples run
npm run demo 8

# Review working tree
git status
```

---

## Commit & Tag

```bash
# Stage all changes (new files + modifications)
git add .

# Commit with release message
git commit -m "Release v0.9.0-alpha: Bluetooth transport + compliance suite

- Bluetooth Classic RFCOMM transport (BluetoothTransport implements ITransport)
- Connection policy (max peers, backoff, blacklisting)
- Device discovery with duplicate suppression
- Length-prefixed framed packet I/O (send + receive)
- NineCore integration proven end-to-end
- Protocol compliance suite (117 tests, all 40 RFC rules verified)
- Protocol defect fixes (Rule 13, Rule 27 partial)
- Documentation audit and stale doc corrections
- 560 tests passing, zero TypeScript errors"

# Create annotated tag
git tag -a v0.9.0-alpha -m "Bluetooth transport complete, compliance suite, 560 tests"

# Verify the tag
git show v0.9.0-alpha --stat
```

---

## Push

```bash
# Push commits to remote
git push origin main

# Push the tag
git push origin v0.9.0-alpha
```

---

## Verification After Push

```bash
# Confirm tag exists on remote
git ls-remote --tags origin | grep v0.9.0

# Confirm local and remote are in sync
git log --oneline -1 origin/main
```

---

## Rollback (if tag was created incorrectly)

```bash
# Delete local tag
git tag -d v0.9.0-alpha

# Delete remote tag (if already pushed)
git push origin --delete v0.9.0-alpha

# Undo the commit (keep changes staged)
git reset --soft HEAD~1

# Fix the issue, then re-commit and re-tag
```

---

## Notes

- The recommended version is **v0.9.0-alpha** because:
  - Major (0): still pre-1.0 (academic prototype, not production-ready)
  - Minor (9): significant milestone — Bluetooth transport is the 9th major subsystem added since v0.1.0
  - Patch (0): first release at this minor version
  - Suffix (-alpha): not all protocol features are complete (Discovery protocol, Ed25519, Desktop Admin remain)
- The jump from v0.7.6 to v0.9.0 reflects the magnitude of work: 2 major phases (8 + 9), 13 sub-phases, +255 tests, 6 new source modules, 2 protocol defect fixes, and 6 new documentation files.
