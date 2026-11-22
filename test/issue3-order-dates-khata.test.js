'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const orders = require('../lib/orders');
const ledger = require('../lib/ledger');

function makeDb() {
  return {
    nextOrderId: 1009,
    nextSettlementId: 505,
    products: [],
    customers: [
      {
        id: 1,
        name: 'Meera Joshi',
        phone: '98230 11420',
        type: 'Retail',
        creditLimit: 5000,
        openingBalance: 450,
        totalBilled: 1982.01,
        totalSettled: 1200,
        balance: 1232.01
      }
    ],
    orders: [
      { id: 1001, date: '28/12/2021', customer: 'Meera Joshi', status: 'completed', total: 676.9 },
      { id: 1002, date: '05/01/2022', customer: 'Anil Kulkarni', status: 'completed', total: 1346 },
      { id: 1003, date: '14/01/2022', customer: 'Walk-in', status: 'completed', total: 596 },
      { id: 1004, date: '30/01/2022', customer: 'Kalyani Foods (Wholesale)', status: 'completed', total: 2700 },
      { id: 1005, date: '02/02/2022', customer: 'Priya Nair', status: 'completed', total: 1590 },
      { id: 1006, date: '18/02/2022', customer: 'Meera Joshi', status: 'completed', total: 2334.6 },
      { id: 1007, date: '04/03/2022', customer: 'Suresh Deshmukh', status: 'pending', total: 1840 },
      { id: 1008, date: '15/03/2022', customer: 'Walk-in', status: 'completed', total: 424 }
    ],
    settlements: [],
    auditLog: []
  };
}

function ids(list) {
  return list.map(function (order) { return order.id; });
}

test('order list is newest first by calendar date, not by text', function () {
  const list = orders.list(makeDb(), {});
  assert.deepEqual(ids(list), [1008, 1007, 1006, 1005, 1004, 1003, 1002, 1001]);
});

test('date range filter uses calendar dates and keeps newest first', function () {
  const list = orders.list(makeDb(), { from: '2022-01-01', to: '2022-01-31' });
  assert.deepEqual(ids(list), [1004, 1003, 1002]);
});

test('date range filter includes boundary dates', function () {
  const list = orders.list(makeDb(), { from: '2022-01-05', to: '2022-01-14' });
  assert.deepEqual(ids(list), [1003, 1002]);
});

test('date range filter accepts DD/MM/YYYY input', function () {
  const list = orders.list(makeDb(), { from: '01/01/2022', to: '31/01/2022' });
  assert.deepEqual(ids(list), [1004, 1003, 1002]);
});

test('settlement amount from the form string updates totals numerically', function () {
  const db = makeDb();

  const result = ledger.recordSettlement(db, 1, '500', 'upi', 'Part payment');

  assert.equal(result.ok, true);
  assert.equal(db.customers[0].totalSettled, 1700);
  assert.equal(db.customers[0].balance, 732.01);
  assert.equal(result.settlement.amount, 500);
  assert.equal(result.settlement.id, 505);
  assert.equal(db.nextSettlementId, 506);
});

test('settlement amounts are rounded to paise', function () {
  const db = makeDb();

  const result = ledger.recordSettlement(db, 1, '500.5', 'cash', '');

  assert.equal(result.ok, true);
  assert.equal(db.customers[0].totalSettled, 1700.5);
  assert.equal(db.customers[0].balance, 731.51);
});

test('settlement rejects invalid, zero, and negative amounts', function () {
  const db = makeDb();

  ['abc', '', '0', 0, '-100', -100, null, undefined].forEach(function (amount) {
    const result = ledger.recordSettlement(db, 1, amount, 'upi', '');
    assert.equal(result.ok, false);
  });

  assert.equal(db.customers[0].totalSettled, 1200);
  assert.equal(db.customers[0].balance, 1232.01);
});
