// Simple test script to POST an enquiry to the running server
const base = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const res = await fetch(`${base}/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Enquiry',
      phoneNumber: '+911234567890',
      email: 'test@example.com',
      source: 'unit-test'
    })
  });

  const body = await res.json();
  console.log('Status:', res.status);
  console.log('Body:', body);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
