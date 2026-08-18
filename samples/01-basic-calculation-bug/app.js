/**
 * Sample 1: Shopping Cart Discount Bug
 * 
 * Expected:
 * - Items total: (2 * 50) + (1 * 100) + (3 * 20) = 100 + 100 + 60 = $260.
 * - Volume Discount: If total items >= 5, 10% off items total ($260 - $26 = $234).
 * - Loyalty Coupon: Flat $30 discount applied AFTER percentage discount ($234 - $30 = $204).
 * - Tax: 10% on discounted subtotal ($20.40).
 * - Total Expected: $224.40
 * 
 * Bug:
 * - Off-by-one / precedence in discount calculation leads to unexpected output.
 */

function calculateCartTotal(cart, couponCode) {
    let subtotal = 0;
    let totalItemCount = 0;

    for (let i = 0; i < cart.items.length; i++) {
        const item = cart.items[i];
        subtotal += item.price * item.quantity;
        totalItemCount += item.quantity;
    }

    let discount = 0;

    // Apply volume discount: 10% off for 5 or more items
    if (totalItemCount > 5) { // <--- Bug 1: Should be >= 5 (cart has exactly 6 items in one test, 5 in another)
        discount += subtotal * 0.10;
    }

    // Apply VIP coupon
    if (couponCode === 'VIP30') {
        // Bug 2: Subtracts coupon directly from discount accumulator instead of adding
        discount = subtotal - 30; // <--- Bug 2: Overwrites percentage discount and sets wrong value
    }

    const discountedSubtotal = Math.max(0, subtotal - discount);
    const tax = discountedSubtotal * 0.10;
    const finalTotal = discountedSubtotal + tax;

    return {
        itemCount: totalItemCount,
        rawSubtotal: subtotal,
        discountApplied: discount,
        discountedSubtotal,
        tax,
        finalTotal: parseFloat(finalTotal.toFixed(2))
    };
}

// Sample cart
const cart = {
    customer: { id: 'cust_101', name: 'Alice' },
    items: [
        { id: 'p1', name: 'Mechanical Keyboard', price: 50, quantity: 2 },
        { id: 'p2', name: 'Gaming Mouse', price: 100, quantity: 1 },
        { id: 'p3', name: 'Desk Mat', price: 20, quantity: 2 } // Total quantity = 5
    ]
};

console.log('--- Starting Cart Calculation ---');
const summary = calculateCartTotal(cart, 'VIP30');
console.log('Calculation Result:', JSON.stringify(summary, null, 2));

const expectedTotal = 224.40;
if (summary.finalTotal === expectedTotal) {
    console.log('✅ SUCCESS: Total matches expected value!');
} else {
    console.error(`❌ ERROR: Expected $${expectedTotal}, but got $${summary.finalTotal}`);
}
