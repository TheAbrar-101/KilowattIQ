/**
 * Payment System, Prepaid Top-Up & Tokenization Test Suite
 * 
 * Verifies:
 * 1. bKash Direct Checkout Adapter (initiate, execute, tokenization)
 * 2. Nagad PGW Adapter (initiate, execute, tokenization)
 * 3. Rocket DBBL Adapter (initiate, execute, tokenization)
 * 4. Postpaid Bill Payment for DESCO / DPDC with BERC VAT breakdown
 * 5. Prepaid Smart Meter Top-Up with 20-digit STS token generation & credited kWh
 * 6. PCI-Safe tokenized payment methods (save, list, delete)
 * 7. Auto-Pay configuration with monthly spending cap & user confirmation check
 * 8. Payment history & receipt retrieval
 */

import { BkashAdapter } from '../payments/bkashAdapter';
import { NagadAdapter } from '../payments/nagadAdapter';
import { RocketAdapter } from '../payments/rocketAdapter';
import { PaymentManager } from '../payments/paymentManager';

async function runTests() {
  console.log('--- RUNNING BILL PAYMENT & PREPAID TOP-UP TESTS ---');
  const bkash = new BkashAdapter();
  const nagad = new NagadAdapter();
  const rocket = new RocketAdapter();
  const manager = PaymentManager.getInstance();
  const testHouseholdId = 'test-hh-payments-99';

  // Test 1: bKash Direct Checkout Adapter
  console.log('\nTest 1: bKash Direct Checkout Adapter');
  const bkashInit = await bkash.initiatePayment({
    amountBDT: 1500,
    invoiceNumber: 'INV_TEST_BKASH_01',
    consumerPhone: '01711889210',
  });
  if (!bkashInit.paymentId.startsWith('BK_PAY_')) {
    throw new Error(`Expected bKash payment ID starting with BK_PAY_, got ${bkashInit.paymentId}`);
  }
  const bkashExec = await bkash.executePayment(bkashInit.paymentId, { otpOrToken: '1234' });
  if (!bkashExec.success || !bkashExec.trxId.startsWith('BKASH_')) {
    throw new Error('bKash execution failed');
  }
  const bkashToken = await bkash.tokenizeWallet('01711889210', '1234');
  if (!bkashToken.token.startsWith('bkash_tok_') || !bkashToken.maskedIdentifier.includes('***')) {
    throw new Error('bKash tokenization PCI format mismatch');
  }
  console.log(`  ✓ Test 1 Passed: bKash flow verified (TrxID: ${bkashExec.trxId}, Masked: ${bkashToken.maskedIdentifier})`);

  // Test 2: Nagad PGW Adapter
  console.log('\nTest 2: Nagad PGW Adapter');
  const nagadInit = await nagad.initiatePayment({
    amountBDT: 1800,
    invoiceNumber: 'INV_TEST_NAGAD_01',
    consumerPhone: '01819441920',
  });
  const nagadExec = await nagad.executePayment(nagadInit.paymentId, { otpOrToken: '4321' });
  if (!nagadExec.success || !nagadExec.trxId.startsWith('NAGAD_')) {
    throw new Error('Nagad execution failed');
  }
  const nagadToken = await nagad.tokenizeWallet('01819441920', '4321');
  if (!nagadToken.token.startsWith('nagad_tok_')) {
    throw new Error('Nagad tokenization mismatch');
  }
  console.log(`  ✓ Test 2 Passed: Nagad flow verified (TrxID: ${nagadExec.trxId}, Masked: ${nagadToken.maskedIdentifier})`);

  // Test 3: DBBL Rocket Adapter
  console.log('\nTest 3: DBBL Rocket Adapter');
  const rocketInit = await rocket.initiatePayment({
    amountBDT: 2000,
    invoiceNumber: 'INV_TEST_ROCKET_01',
    consumerPhone: '01912331820',
  });
  const rocketExec = await rocket.executePayment(rocketInit.paymentId, { otpOrToken: '5678' });
  if (!rocketExec.success || !rocketExec.trxId.startsWith('RCKT_')) {
    throw new Error('Rocket execution failed');
  }
  const rocketToken = await rocket.tokenizeWallet('01912331820', '5678');
  if (!rocketToken.token.startsWith('rocket_tok_')) {
    throw new Error('Rocket tokenization mismatch');
  }
  console.log(`  ✓ Test 3 Passed: Rocket flow verified (TrxID: ${rocketExec.trxId}, Masked: ${rocketToken.maskedIdentifier})`);

  // Test 4: Postpaid Bill Payment for DESCO
  console.log('\nTest 4: Postpaid Bill Payment (DESCO LT-A Settlement)');
  const billReceipt = await manager.payPostpaidBill({
    householdId: testHouseholdId,
    amountBDT: 2280,
    provider: 'BKASH',
    accountNumber: '8820-9941-01',
    meterNumber: 'MTR-DESCO-9921',
    utilityProvider: 'DESCO',
    consumerName: 'Tanvir Hossain',
    consumerPhone: '01711889210',
    otpOrToken: '1234',
  });
  if (billReceipt.status !== 'COMPLETED' || billReceipt.paymentType !== 'POSTPAID_BILL') {
    throw new Error('Postpaid bill receipt verification failed');
  }
  if (billReceipt.vatBDT <= 0 || billReceipt.demandChargeBDT <= 0) {
    throw new Error('Missing statutory VAT or demand charge in receipt');
  }
  console.log(`  ✓ Test 4 Passed: Bill settled (Receipt: ${billReceipt.id}, BERC Ref: ${billReceipt.utilityReferenceId}, Amount: ৳${billReceipt.amountBDT})`);

  // Test 5: Prepaid Smart Meter Top-Up & STS 20-Digit Token Generation
  console.log('\nTest 5: Prepaid Smart Meter Top-Up (20-Digit STS Token)');
  const topUpReceipt = await manager.topUpPrepaidMeter({
    householdId: testHouseholdId,
    amountBDT: 1500,
    provider: 'NAGAD',
    accountNumber: '8820-9941-01',
    meterNumber: 'MTR-DESCO-9921',
    utilityProvider: 'DESCO',
    consumerName: 'Tanvir Hossain',
    consumerPhone: '01819441920',
    otpOrToken: '4321',
  });
  if (!topUpReceipt.prepaidTokenSTS || topUpReceipt.prepaidTokenSTS.length !== 24) {
    // 20 digits + 4 spaces = 24 chars
    throw new Error(`Expected 20-digit formatted STS token, got: ${topUpReceipt.prepaidTokenSTS}`);
  }
  if (!topUpReceipt.energyUnitsCreditedKwh || topUpReceipt.energyUnitsCreditedKwh <= 0) {
    throw new Error('Credited kWh units must be greater than zero');
  }
  console.log(`  ✓ Test 5 Passed: Prepaid top-up completed (STS Token: "${topUpReceipt.prepaidTokenSTS}", Credited: ${topUpReceipt.energyUnitsCreditedKwh} kWh)`);

  // Test 6: PCI-Safe Tokenized Payment Methods Management
  console.log('\nTest 6: PCI-Safe Tokenized Payment Methods');
  const savedMethod = await manager.addPaymentMethod(testHouseholdId, {
    provider: 'BKASH',
    phoneNumber: '01799881122',
    alias: 'Office Backup bKash',
    otp: '1234',
  });
  if (!savedMethod.token.startsWith('bkash_tok_') || !savedMethod.maskedIdentifier.includes('***')) {
    throw new Error('Tokenized method format failed');
  }
  const allMethods = manager.getPaymentMethods(testHouseholdId);
  const found = allMethods.find(m => m.id === savedMethod.id);
  if (!found) throw new Error('Saved method not found in list');

  const removed = manager.removePaymentMethod(testHouseholdId, savedMethod.id);
  if (!removed) throw new Error('Failed to remove saved method');
  console.log(`  ✓ Test 6 Passed: Tokenized wallet created & deleted cleanly (Token: ${savedMethod.token.slice(0, 16)}...)`);

  // Test 7: Auto-Pay with Monthly Cap & Safety Confirmation
  console.log('\nTest 7: Auto-Pay with Monthly Cap & Confirmation');
  try {
    // Should throw if user confirmation is missing when enabling
    manager.updateAutoPayConfig(testHouseholdId, { isEnabled: true, confirmedByUser: false });
    throw new Error('Should have rejected enabling Auto-Pay without user confirmation');
  } catch (err: any) {
    if (!err.message.includes('explicit user confirmation')) {
      throw err;
    }
  }

  const autoPayActive = manager.updateAutoPayConfig(testHouseholdId, {
    isEnabled: true,
    confirmedByUser: true,
    monthlyCapBDT: 5000,
    triggerType: 'PREPAID_LOW_BALANCE',
    lowBalanceThresholdBDT: 250,
  });
  if (!autoPayActive.isEnabled || autoPayActive.monthlyCapBDT !== 5000) {
    throw new Error('Auto-Pay configuration mismatch');
  }
  console.log(`  ✓ Test 7 Passed: Auto-Pay validated with confirmation check (Cap: ৳${autoPayActive.monthlyCapBDT}, Trigger: ${autoPayActive.triggerType})`);

  // Test 8: Receipt History Query
  console.log('\nTest 8: Payment History Query');
  const history = manager.getPaymentHistory(testHouseholdId);
  if (history.length < 2) {
    throw new Error(`Expected at least 2 receipts in history, got ${history.length}`);
  }
  const single = manager.getReceiptById(history[0].id);
  if (!single || single.id !== history[0].id) {
    throw new Error('Failed to retrieve single receipt by ID');
  }
  console.log(`  ✓ Test 8 Passed: Payment history loaded (${history.length} transactions, Single fetch verified)`);

  console.log('\n--- ALL BILL PAYMENT & TOP-UP TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Payment test suite failed:', err);
  process.exit(1);
});
