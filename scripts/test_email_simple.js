#!/usr/bin/env node

/**
 * Simple EmailJS Configuration Test
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('\n=== EmailJS Configuration Check ===\n');

const serviceId = process.env.EMAILJS_SERVICE_ID;
const publicKey = process.env.EMAILJS_PUBLIC_KEY;
const privateKey = process.env.EMAILJS_PRIVATE_KEY;

console.log('EMAILJS_SERVICE_ID:', serviceId ? '✅ Set' : '❌ Missing');
console.log('EMAILJS_PUBLIC_KEY:', publicKey ? '✅ Set' : '❌ Missing');
console.log('EMAILJS_PRIVATE_KEY:', privateKey ? '✅ Set' : '❌ Missing');

if (serviceId && publicKey && privateKey) {
  console.log('\n✅ All EmailJS configuration is set!');
  console.log('\nYour configuration:');
  console.log(`  Service ID: ${serviceId}`);
  console.log(`  Public Key: ${publicKey}`);
  console.log(`  Private Key: ${privateKey.substring(0, 5)}...`);
  console.log('\n🎉 Email notifications are ready to use!');
  console.log('\nNo templates needed - emails will be sent as plain text.');
  process.exit(0);
} else {
  console.log('\n❌ EmailJS configuration is incomplete.');
  console.log('\nPlease set the missing variables in your .env file.');
  process.exit(1);
}
