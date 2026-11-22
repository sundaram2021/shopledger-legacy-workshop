'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

function makeDb() {
  return {
    nextOrderId: 1009,
    nextSettlementId: 505,
    products: [
      { id: 6, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', stock: 8, reserved: 1, price: 700 },
      { id: 4, sku: 'OIL-001', name: 'Cold-Pressed Sunflower Oil 1L', stock: 6, reserved: 2, price: 220 }
    ],
    customers: [
      { id: 4, name: 'Suresh Deshmukh', openingBalance: 0, totalBilled: 0, totalSettled: 0, balance: 0 }
    ],
    orders: [
      {
        id: 1007,
        date: '04/03/2022',
        customer: 'Suresh Deshmukh',
        customerId: 4,
        paymentMode: 'cash',
        status: 'pending',
        items: [
          { id: 6, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', price: 700, qty: 2 },
          { id: 4, sku: 'OIL-001', name: 'Cold-Pressed Sunflower Oil 1L', price: 220, qty: 2 }
        ],
        subtotal: 1840,
        discount: 0,
        tax: 0,
        total: 1840
      }
    ],
    settlements: [],
    auditLog: []
  };
}

test('check allows billing the exact remaining sellable quantity', function () {
  const products = [
    { id: 6, name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0 },
    { id: 5, name: 'Byadgi Kashmiri Chilli Powder 500g', stock: 4, reserved: 3 }
  ];

  assert.deepEqual(inventory.check(products, [{ id: 6, qty: 1 }]), { ok: true });
  assert.deepEqual(inventory.check(products, [{ id: 5, qty: 1 }]), { ok: true });
});

test('check still rejects quantities above sellable stock', function () {
  const products = [
    { id: 6, name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0 },
    { id: 5, name: 'Byadgi Kashmiri Chilli Powder 500g', stock: 4, reserved: 3 }
  ];

  const ghee = inventory.check(products, [{ id: 6, qty: 2 }]);
  assert.equal(ghee.ok, false);
  assert.match(ghee.msg, /A2 Gir Cow Ghee 500ml is out of stock \(1 sellable available\)/);

  const chilli = inventory.check(products, [{ id: 5, qty: 2 }]);
  assert.equal(chilli.ok, false);
  assert.match(chilli.msg, /Byadgi Kashmiri Chilli Powder 500g is out of stock \(1 sellable available\)/);
});

test('cancelling a pending order restores physical stock without touching quote reservations', function () {
  const db = makeDb();

  const result = orders.cancel(db, 1007, 'Customer changed mind');

  assert.equal(result.ok, true);
  assert.equal(db.orders[0].status, 'cancelled');
  assert.equal(db.orders[0].cancelReason, 'Customer changed mind');

  assert.equal(db.products[0].stock, 10);
  assert.equal(db.products[0].reserved, 1);

  assert.equal(db.products[1].stock, 8);
  assert.equal(db.products[1].reserved, 2);
});

test('cancelling the same order twice does not restore stock twice', function () {
  const db = makeDb();

  assert.equal(orders.cancel(db, 1007, 'first').ok, true);
  const second = orders.cancel(db, 1007, 'second');

  assert.equal(second.ok, false);
  assert.equal(db.products[0].stock, 10);
  assert.equal(db.products[1].stock, 8);
});

test('last sellable unit can be billed and comes back after cancellation', function () {
  const db = makeDb();
  db.products = [{ id: 6, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0, price: 700 }];
  db.orders = [];
  db.nextOrderId = 1009;

  assert.deepEqual(inventory.check(db.products, [{ id: 6, qty: 1 }]), { ok: true });

  inventory.reserve(db.products, [{ id: 6, qty: 1 }]);
  assert.equal(db.products[0].stock, 0);
  assert.equal(inventory.check(db.products, [{ id: 6, qty: 1 }]).ok, false);

  const order = orders.add(db, {
    date: '04/03/2022',
    customer: 'Walk-in',
    paymentMode: 'cash',
    status: 'completed',
    items: [{ id: 6, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', price: 700, qty: 1 }],
    subtotal: 700,
    discount: 0,
    tax: 0,
    total: 700
  });

  assert.equal(orders.cancel(db, order.id, 'returned').ok, true);
  assert.equal(db.products[0].stock, 1);
  assert.deepEqual(inventory.check(db.products, [{ id: 6, qty: 1 }]), { ok: true });
});
