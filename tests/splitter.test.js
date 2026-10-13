import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toCents,
  computeBalances,
  settle,
  splitExpenses,
  formatTransactions,
} from "../src/splitter.js";

describe("toCents", () => {
  it("converts dollars to integer cents", () => {
    assert.equal(toCents(20), 2000);
    assert.equal(toCents(19.99), 1999);
  });
  it("rejects invalid amounts", () => {
    assert.throws(() => toCents(-5), /Invalid amount/);
    assert.throws(() => toCents("20"), /Invalid amount/);
    assert.throws(() => toCents(NaN), /Invalid amount/);
  });
});

describe("computeBalances", () => {
  it("splits one expense equally", () => {
    const balances = computeBalances([
      { description: "Dinner", payer: "Ali", amount: 120, for: ["Ali", "Sara", "Omar"] },
    ]);
    assert.equal(balances.get("Ali"), 8000); // paid 120, owes 40
    assert.equal(balances.get("Sara"), -4000);
    assert.equal(balances.get("Omar"), -4000);
  });

  it("supports unequal shares", () => {
    const balances = computeBalances([
      {
        description: "Taxi",
        payer: "Sara",
        amount: 30,
        for: ["Sara", "Omar"],
        shares: { Sara: 10, Omar: 20 },
      },
    ]);
    assert.equal(balances.get("Sara"), 2000); // paid 30, owes 10
    assert.equal(balances.get("Omar"), -2000);
  });

  it("rejects shares that do not add up", () => {
    assert.throws(
      () =>
        computeBalances([
          { payer: "Ali", amount: 30, for: ["Ali", "Omar"], shares: { Ali: 10, Omar: 10 } },
        ]),
      /do not add up/
    );
  });

  it("rounds equal splits so the total is exact to the cent", () => {
    const balances = computeBalances([
      { payer: "Ali", amount: 100, for: ["Ali", "Sara", "Omar"] },
    ]);
    // 100.00 split 3 ways: first person in the list absorbs the leftover cent,
    // so Ali owes 33.34 and Sara/Omar owe 33.33 — totals exactly 100.00
    const total = [...balances.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, 0);
    const owed = [balances.get("Sara"), balances.get("Omar")].sort((a, b) => a - b);
    assert.deepEqual(owed, [-3333, -3333]);
    assert.equal(balances.get("Ali"), 6666);
  });

  it("returns empty balances for empty input", () => {
    assert.equal(computeBalances([]).size, 0);
  });

  it("nets multiple expenses per person", () => {
    const balances = computeBalances([
      { payer: "Ali", amount: 60, for: ["Ali", "Sara"] },
      { payer: "Sara", amount: 60, for: ["Ali", "Sara"] },
    ]);
    assert.equal(balances.size, 0); // perfectly offset
  });
});

describe("settle (greedy min-cash-flow)", () => {
  it("produces the minimal number of transactions", () => {
    // Chain: Ali -> Sara -> Omar -> Ali would be 3 payments naively.
    // Net: Ali +20, Sara 0, Omar -20 -> 1 payment.
    const balances = new Map([
      ["Ali", 2000],
      ["Sara", 0],
      ["Omar", -2000],
    ]);
    const txns = settle(balances);
    assert.equal(txns.length, 1);
    assert.deepEqual(txns[0], { from: "Omar", to: "Ali", amount: 2000 });
  });

  it("never exceeds n-1 transactions", () => {
    const balances = new Map([
      ["A", 5000],
      ["B", 3000],
      ["C", -2000],
      ["D", -2500],
      ["E", -3500],
    ]);
    const txns = settle(balances);
    assert.ok(txns.length <= 4, `expected <= 4 transactions, got ${txns.length}`);
    // Every cent accounted for
    const moved = txns.reduce((a, t) => a + t.amount, 0);
    assert.equal(moved, 8000);
  });

  it("returns no transactions when everyone is even", () => {
    assert.deepEqual(settle(new Map()), []);
  });

  it("is deterministic regardless of input order", () => {
    const mk = (entries) => settle(new Map(entries));
    const a = mk([
      ["Zed", -1500],
      ["Amy", 1500],
    ]);
    const b = mk([
      ["Amy", 1500],
      ["Zed", -1500],
    ]);
    assert.deepEqual(a, b);
  });
});

describe("splitExpenses (end to end)", () => {
  it("settles the sample trip scenario", () => {
    const txns = splitExpenses([
      { description: "Hotel", payer: "Ali", amount: 300, for: ["Ali", "Sara", "Omar"] },
      { description: "Dinner", payer: "Sara", amount: 90, for: ["Ali", "Sara", "Omar"] },
      { description: "Museum", payer: "Omar", amount: 60, for: ["Ali", "Omar"] },
    ]);
    // Totals: Ali paid 300, Sara 90, Omar 60. Owed: hotel 100 each, dinner 30 each, museum 30 each (Ali, Omar).
    // Ali: +300-160 = +140, Sara: +90-130 = -40, Omar: +60-160 = -100
    // Minimal: Omar->Ali 100, Sara->Ali 40
    assert.equal(txns.length, 2);
    const total = txns.reduce((a, t) => a + t.amount, 0);
    assert.equal(total, 140);
  });
});

describe("formatTransactions", () => {
  it("renders human-readable lines", () => {
    const lines = formatTransactions([{ from: "Omar", to: "Ali", amount: 20 }], "$");
    assert.deepEqual(lines, ["Omar pays Ali $20.00"]);
  });
});
