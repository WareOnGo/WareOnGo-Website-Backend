// Simple test script to POST a customer request to the running server
const base = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const res = await fetch(`${base}/customer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Test Customer',
      phone_number: '+911234567891',
      company_name: 'Test Co',
      preferred_location: 'Delhi',
      additional_requirements: 'None'
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
