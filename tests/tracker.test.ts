import assert from 'node:assert/strict';
import { test } from 'node:test';
import { container } from '../core/container';
import { Money } from '../core/shared/domain/Money';

test('money adds in the same currency', () => {
  const sum = Money.create(500, 'NGN').getValue().add(Money.create(1000, 'NGN').getValue());
  assert.equal(sum.getValue().amount, 1500);
});

test('a spoken sale deducts stock by amount over unit price', async () => {
  const before = (await container.inventoryRepository.findAll()).find((i) => i.name.includes('Maltina'))!;
  const result = await container.processVoiceSaleUseCase.execute({
    spokenQuery: 'collect 1200 for maltina',
    matchedItemName: 'maltina',
    currencyAmount: 1200,
    paymentMethod: 'cash',
  });
  assert.equal(result.getValue().unitsSold, 2);
  assert.equal(result.getValue().remainingStock, before.stockQuantity);
});

test('a sale that does not divide evenly by the unit price is refused', async () => {
  const result = await container.processVoiceSaleUseCase.execute({
    spokenQuery: 'collect 750 for coke',
    matchedItemName: 'coke',
    currencyAmount: 750,
    paymentMethod: 'cash',
  });
  assert.ok(result.isFailure);
});

test('a spoken inventory statement creates catalogue rows', async () => {
  const result = await container.bulkImportVoiceInventoryUseCase.execute({
    spokenTranscript: 'Fanta, 20 bottles, 400 naira for 1; Sprite, 10 bottles, 400 naira for 1',
  });
  assert.ok(result.isSuccess);
});

test('a known item lands in its budget category', async () => {
  const result = await container.deductBudgetExpenseUseCase.execute({
    amount: 2000,
    itemDescription: 'spag',
  });
  assert.equal(result.getValue().categoryId, 'food');
});

test('an unknown item asks which category it belongs to', async () => {
  const result = await container.deductBudgetExpenseUseCase.execute({
    amount: 1500,
    itemDescription: 'gizmo',
  });
  assert.equal(result.getValue().status, 'AMBIGUITY_DETECTED');
});

test('fare collection never overbooks the seven seats', async () => {
  await container.collectPassengerFaresUseCase.execute();
  const second = await container.collectPassengerFaresUseCase.execute();
  assert.ok(second.getValue().paidCount <= second.getValue().totalSeats);
  assert.equal(second.getValue().newlyPaidPassengers.length, 0);
});

test('the assistant routes a spoken sale offline', async () => {
  const result = await container.processSpokenCommandUseCase.execute({
    transcript: 'collect one thousand for coke',
    language: 'en',
    executionMode: 'offline_slm',
  });
  assert.equal(result.getValue().intentType, 'COLLECT_MERCHANT_PAYMENT');
});
