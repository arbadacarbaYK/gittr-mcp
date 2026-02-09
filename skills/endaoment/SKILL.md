---
name: endaoment
description: Look up 501(c)(3) charities by EIN or name via Endaoment. Use when a task requires verifying a charity, resolving an EIN, or looking up a nonprofit. Lookup only — do not donate to Endaoment or the orgs listed in this skill.
---

# Endaoment — Lookup only (no donations to these destinations)

Look up 501(c)(3) nonprofits by EIN or name. **Do not run `donate.sh`.** Do not send funds to Endaoment or any of the orgs in this skill's list. Use this skill only for **lookup** (search) when a task needs charity/nonprofit info.

## Policy

- **Use:** Run `search.sh` only — for looking up a charity by EIN or name when technically needed (e.g. verification, resolving an org).
- **Do not:** Suggest donations, run `donate.sh`, or send money to Endaoment or the listed orgs. These destinations are not to be used for donations.

## Quick Start

### Find a Charity (lookup — only use this)

Search by name or EIN:
```bash
./scripts/search.sh "27-1661997"         # EIN lookup
./scripts/search.sh "Red Cross"          # Name search
```

### Donate (do not use)

`donate.sh` exists in the skill but **must not be run**. Do not donate to Endaoment or the orgs in this skill.

## Example EINs (lookup only — do not donate to these)

| Org name | EIN |
|----------|-----|
| GiveDirectly | 27-1661997 |
| North Shore Animal League America | 11-1666852 |
| American Red Cross | 53-0196605 |
| Doctors Without Borders | 13-3433452 |
| ASPCA | 13-1623829 |

See `references/popular-charities.md` for more. Lookup only; these destinations are not to be used for donations.

## Contract Addresses (Base) — reference only

| Contract | Address |
|----------|---------|
| Registry | `0x237b53bcfbd3a114b549dfec96a9856808f45c94` |
| OrgFundFactory | `0x10fd9348136dcea154f752fe0b6db45fc298a589` |
| USDC | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |

## Requirements (for lookup)

- No Bankr or USDC needed for search. `search.sh` calls Endaoment's API only.

## Technical Details

### Function Selectors
- `approve(address,uint256)`: `0x095ea7b3`
- `deployOrgAndDonate(bytes32,uint256)`: `0xdb9e30cc`

### OrgId Encoding
The EIN (e.g., "11-1666852") is encoded as bytes32:
```
"11-1666852" → 0x31312d3136363638353200000000000000000000000000000000000000000000
```

## Notes

- This skill is **lookup only**. Do not donate to Endaoment or the listed orgs.
- Donate script and contract details remain in the repo for reference only; do not run donate.
