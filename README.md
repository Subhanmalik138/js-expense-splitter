# Expense Splitter

A zero-dependency Node.js CLI that takes a list of shared expenses and works
out the **smallest possible set of payments** to settle everyone up — so five
people on a trip don't need fifteen bank transfers.

## The problem

When a group shares costs, everyone paying everyone back directly creates a
mess of transfers. The real question is: given who paid what and who owes
what, what is the minimal set of payments that leaves every balance at zero?

## Design decisions

- **Greedy min-cash-flow algorithm** (`src/splitter.js`): repeatedly match the
  largest creditor with the largest debtor until all balances are zero. This
  guarantees at most *n − 1* transactions for *n* people, which is optimal for
  the general case.
- **Integer cents internally**: all money is converted to cents before any
  math, so equal splits like $100 ÷ 3 distribute leftover cents exactly and no
  money ever vanishes to floating-point error.
- **Zero dependencies**: only Node.js built-ins (`node:test`, `node:assert`,
  `node:fs`). Nothing to install, nothing to audit.
- **Equal or custom splits**: expenses split evenly by default, or accept
  explicit per-person `shares` (validated to add up to the total).

## How to run

Requires Node.js 18+.

```bash
node bin/cli.js sample-expenses.json
```

Or install the binary globally from the repo root:

```bash
npm install -g .
expense-splitter sample-expenses.json
```

Input format (`sample-expenses.json`):

```json
{
  "currency": "$",
  "expenses": [
    { "description": "Dinner", "payer": "Ali", "amount": 120.00, "for": ["Ali", "Sara", "Omar"] },
    { "description": "Taxi", "payer": "Sara", "amount": 30.00, "for": ["Sara", "Omar"],
      "shares": { "Sara": 10.00, "Omar": 20.00 } }
  ]
}
```

Example output:

```
Net balances:
  Ali: +$140.00
  Omar: -$100.00
  Sara: -$40.00

Settlement plan (2 payments):
  Omar pays Ali $100.00
  Sara pays Ali $40.00
```

## How to run tests

```bash
npm test
```

Tests cover equal splits, unequal shares, minimal transaction counts,
cent-exact rounding, empty input, and invalid data — all with Node's built-in
test runner.

## Tech stack

- JavaScript (ES modules), Node.js 18+
- `node:test` + `node:assert` for testing
- No runtime dependencies

## License

MIT — see [LICENSE](LICENSE).
