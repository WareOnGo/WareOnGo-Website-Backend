#!/usr/bin/env node

/**
 * EmailJS Configuration Test Script
 * 
 * This script tests the EmailJS configuration and sends sample notifications
 * to verify that the email notification system is working correctly.
 */

// Load environment variables FIRST before importing anything else
import dotenv from 'dotenv';
dotenv.config();

// Now import the notification service after env vars are loaded
import notificationService from '../utils/notificationService.js';

/**
 * Test configuration validation
 */
function testConfiguration() {
  console.log('\n=== EmailJS Configuration Test ===\n');
  
  const config = notificationService.validateConfiguration();
  
  console.log('Configuration Status:', config.isValid ? '✅ Valid' : '❌ Invalid');
  console.log('Recipient Count:', config.recipients);
  
  if (!config.isValid) {
    console.log('Missing Variables:', config.missingVariables);
    console.log('\nPlease set the following environment variables:');
    config.missingVariables.forEach(variable => {
      console.log(`  - ${variable}`);
    });
    return false;
  }
  
  return true;
}

/**
 * Test rate limit status
 */
function testRateLimits() {
  console.log('\n=== Rate Limit Status ===\n');
  
  const rateLimits = notificationService.getRateLimitStatus();
  
  console.log('Monthly:', `${rateLimits.monthly.current}/${rateLimits.monthly.limit} (${rateLimits.monthly.percentUsed}%)`);
  console.log('Daily:', `${rateLimits.daily.current}/${rateLimits.daily.limit} (${rateLimits.daily.percentUsed}%)`);
  console.log('Hourly:', `${rateLimits.hourly.current}/${rateLimits.hourly.limit} (${rateLimits.hourly.percentUsed}%)`);
}

/**
 * Create sample enquiry data for testing
 */
function createSampleEnquiryData() {
  return {
    id: 999,
    name: 'Test User',
    phoneNumber: '+1234567890',
    email: 'test@example.com',
    source: 'Website Test',
    createdat: new Date()
  };
}

/**
 * Create sample customer request data for testing
 */
function createSampleCustomerRequestData() {
  return {
    id: 999,
    full_name: 'Test Customer',
    phone_number: '+1234567890',
    company_name: 'Test Company Ltd',
    preferred_location: 'Test City',
    additional_requirements: 'This is a test notification',
    created_at: new Date()
  };
}/**

 * Test enquiry notification
 */
async function testEnquiryNotification() {
  console.log('\n=== Testing Enquiry Notification ===\n');
  
  const sampleData = createSampleEnquiryData();
  console.log('Sample Enquiry Data:', JSON.stringify(sampleData, null, 2));
  
  try {
    const result = await notificationService.sendEnquiryNotification(sampleData);
    
    if (result.success) {
      console.log('✅ Enquiry notification sent successfully');
      console.log('Duration:', result.duration + 'ms');
      console.log('Response Status:', result.response?.status);
    } else if (result.rateLimited) {
      console.log('⚠️ Enquiry notification blocked by rate limit');
      console.log('Reset Date:', result.resetDate?.toISOString());
    } else {
      console.log('❌ Enquiry notification failed');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }
}

/**
 * Test customer request notification
 */
async function testCustomerRequestNotification() {
  console.log('\n=== Testing Customer Request Notification ===\n');
  
  const sampleData = createSampleCustomerRequestData();
  console.log('Sample Customer Request Data:', JSON.stringify(sampleData, null, 2));
  
  try {
    const result = await notificationService.sendCustomerRequestNotification(sampleData);
    
    if (result.success) {
      console.log('✅ Customer request notification sent successfully');
      console.log('Duration:', result.duration + 'ms');
      console.log('Response Status:', result.response?.status);
    } else if (result.rateLimited) {
      console.log('⚠️ Customer request notification blocked by rate limit');
      console.log('Reset Date:', result.resetDate?.toISOString());
    } else {
      console.log('❌ Customer request notification failed');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('EmailJS Configuration and Notification Test');
  console.log('==========================================');
  
  // Test configuration
  const configValid = testConfiguration();
  
  if (!configValid) {
    console.log('\n❌ Configuration invalid. Please fix configuration before testing notifications.');
    process.exit(1);
  }
  
  // Test rate limits
  testRateLimits();
  
  // Ask user if they want to send test emails
  console.log('\n=== Test Email Sending ===\n');
  console.log('⚠️  WARNING: This will send actual test emails to the configured recipients.');
  console.log('Recipients:', notificationService.getRecipients().join(', '));
  
  // In a real scenario, you might want to add user confirmation here
  // For now, we'll just log what would happen
  console.log('\nTo send test emails, uncomment the test functions below and run again.');
  
  // Uncomment these lines to actually send test emails:
  // await testEnquiryNotification();
  // await testCustomerRequestNotification();
  
  console.log('\n=== Test Complete ===\n');
  console.log('If configuration is valid, the notification system is ready to use.');
  console.log('To enable test email sending, edit this script and uncomment the test functions.');
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}