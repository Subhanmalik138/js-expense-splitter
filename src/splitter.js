/**
 * Expense splitter core — minimal settlement algorithm.
 *
 * Given a list of expenses (who paid, how much, who it was for), this module
 * computes each person's net balance and then produces the smallest practical
 * set of payments that settles everyone up, using the classic greedy
 * min-cash-flow algorithm: repeatedly match the biggest creditor with the
 * biggest debtor until every balance is zero.
 *
 * All money is handled in integer cents internally so totals are exact and
 * nothing is ever lost to floating point rounding.
 */

/** Convert a dollar amount to integer cents. */
export function toCents(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return Math.round(amount * 100);
}

/** Convert integer cents back to a dollar number. */
export function toDollars(cents) {
  return cents / 100;
}

/**
 * Compute each person's net balance in cents: positive = they are owed money,
 * negative = they owe money.
 *
 * Expense shape:
 *   { description, payer, amount, for: [names], shares?: { name: amount } }
 * When `shares` is given it must add up to `amount`; otherwise `amount` is
 * split equally among `for`, with leftover cents distributed one per person
 * so the split always totals exactly `amount`.
 */
export function computeBalances(expenses) {
  if (!Array.isArray(expenses)) {
    throw new Error("expenses must be an array");
  }
  const balances = new Map(); // name -> cents
  const add = (name, cents) => balances.set(name, (balances.get(name) ?? 0) + cents);

  for (const expense of expenses) {
    const { payer, amount } = expense;
    if (!payer || typeof payer !== "string") throw new Error("Each expense needs a payer name");
    const totalCents = toCents(amount);

    let owed; // name -> cents
    if (expense.shares) {
      owed = new Map();
      let sum = 0;
      for (const [name, share] of Object.entries(expense.shares)) {
        const c = toCents(share);
        owed.set(name, c);
        sum += c;
      }
      if (sum !== totalCents) {
        throw new Error(`Shares for "${expense.description ?? "expense"}" do not add up to the amount`);
      }
    } else {
      const people = expense.for;
      if (!Array.isArray(people) || people.length === 0) {
        throw new Error("Each expense needs a non-empty `for` list or `shares`");
      }
      owed = new Map();
      const base = Math.floor(totalCents / people.length);
      let remainder = totalCents - base * people.length;
      for (const name of people) {
        const c = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        owed.set(name, (owed.get(name) ?? 0) + c);
      }
    }

    add(payer, totalCents);
    for (const [name, c] of owed) add(name, -c);
  }

  // Drop zero balances for a clean result
  for (const [name, cents] of balances) {
    if (cents === 0) balances.delete(name);
  }
  return balances;
}

/**
 * Greedy min-cash-flow settlement.
 * Takes a Map of name -> balance in cents and returns an array of
 * { from, to, amount } with amount in cents. The number of transactions is
 * at most (number of people - 1), which is optimal for the general case.
 */
export function settle(balances) {
  const debtors = []; // [name, centsOwed] — owe money
  const creditors = []; // [name, centsOwedToThem]
  for (const [name, cents] of balances) {
    if (cents < 0) debtors.push([name, -cents]);
    else if (cents > 0) creditors.push([name, cents]);
  }
  // Deterministic order: biggest first, ties broken by name
  const bySize = (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
  debtors.sort(bySize);
  creditors.sort(bySize);

  const transactions = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const [debtor, owes] = debtors[d];
    const [creditor, owed] = creditors[c];
    const settled = Math.min(owes, owed);
    transactions.push({ from: debtor, to: creditor, amount: settled });
    debtors[d][1] -= settled;
    creditors[c][1] -= settled;
    if (debtors[d][1] === 0) d += 1;
    if (creditors[c][1] === 0) c += 1;
  }
  return transactions;
}

/**
 * Full pipeline: expenses in, settlement transactions out
 * ({ from, to, amount } with amount in dollars).
 */
export function splitExpenses(expenses) {
  return settle(computeBalances(expenses)).map((t) => ({
    from: t.from,
    to: t.to,
    amount: toDollars(t.amount),
  }));
}

/** Render transactions as human-readable lines, e.g. "Omar pays Ali $20.00". */
export function formatTransactions(transactions, currency = "$") {
  return transactions.map(
    (t) => `${t.from} pays ${t.to} ${currency}${t.amount.toFixed(2)}`
  );
}
