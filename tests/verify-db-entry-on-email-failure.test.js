import { jest } from '@jest/globals';

// Mock the notification service to always fail
const mockNotificationService = {
  sendEnquiryNotification: jest.fn().mockRejectedValue(new Error('Email service is down')),
  sendCustomerRequestNotification: jest.fn().mockRejectedValue(new Error('Email service is down'))
};

// Mock the prisma client to track database operations
const mockPrismaClient = {
  enquiry: {
    create: jest.fn()
  },
  customer_request: {
    create: jest.fn()
  }
};

// Mock utility modules
const mockPhoneUtils = {
  isValidPhoneNumber: jest.fn().mockReturnValue(true)
};

const mockSerializeUtils = {
  sanitizeForJSON: jest.fn(data => data)
};

// Set up module mocks
jest.unstable_mockModule('../utils/notificationService.js', () => ({
  default: mockNotificationService
}));

jest.unstable_mockModule('../models/prismaClient.js', () => ({
  default: mockPrismaClient
}));

jest.unstable_mockModule('../utils/phone.js', () => mockPhoneUtils);
jest.unstable_mockModule('../utils/serialize.js', () => mockSerializeUtils);

// Import controllers after mocking
const { createEnquiry } = await import('../controllers/enquiryController.js');
const { createCustomerRequest } = await import('../controllers/customerRequestController.js');

describe('Database Entry Verification - Email Failure Scenarios', () => {
  let mockReq, mockRes, consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Suppress console.error for cleaner test output
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('CRITICAL: Enquiry entry is saved to database even when email notification fails', async () => {
    mockReq = {
      body: {
        name: 'John Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        source: 'website'
      }
    };

    const mockDbEntry = {
      id: 1,
      name: 'John Doe',
      phoneNumber: '+1234567890',
      email: 'john@example.com',
      source: 'website',
      createdat: new Date()
    };

    mockPrismaClient.enquiry.create.mockResolvedValue(mockDbEntry);

    // Execute the controller
    await createEnquiry(mockReq, mockRes);

    // CRITICAL VERIFICATION: Database entry was created
    expect(mockPrismaClient.enquiry.create).toHaveBeenCalledTimes(1);
    expect(mockPrismaClient.enquiry.create).toHaveBeenCalledWith({
      data: {
        name: 'John Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        source: 'website'
      }
    });

    // CRITICAL VERIFICATION: Success response was sent to client
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(mockDbEntry);

    // Wait for async notification attempt
    await new Promise(resolve => setImmediate(resolve));

    // Verify email notification was attempted (and failed)
    expect(mockNotificationService.sendEnquiryNotification).toHaveBeenCalledWith(mockDbEntry);

    // Verify error was logged but didn't affect the response
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send enquiry notification for ID 1:'),
      expect.any(Error)
    );

    console.log('✅ VERIFIED: Enquiry saved to database despite email failure');
  });

  test('CRITICAL: Customer request entry is saved to database even when email notification fails', async () => {
    mockReq = {
      body: {
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support'
      }
    };

    const mockDbEntry = {
      id: 1,
      full_name: 'Alice Johnson',
      phone_number: '+1234567890',
      company_name: 'Tech Corp',
      preferred_location: 'San Francisco',
      additional_requirements: 'Need 24/7 support',
      created_at: new Date()
    };

    mockPrismaClient.customer_request.create.mockResolvedValue(mockDbEntry);

    // Execute the controller
    await createCustomerRequest(mockReq, mockRes);

    // CRITICAL VERIFICATION: Database entry was created
    expect(mockPrismaClient.customer_request.create).toHaveBeenCalledTimes(1);
    expect(mockPrismaClient.customer_request.create).toHaveBeenCalledWith({
      data: {
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support'
      }
    });

    // CRITICAL VERIFICATION: Success response was sent to client
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(mockDbEntry);

    // Wait for async notification attempt
    await new Promise(resolve => setImmediate(resolve));

    // Verify email notification was attempted (and failed)
    expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalledWith(mockDbEntry);

    // Verify error was logged but didn't affect the response
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send customer request notification for ID 1:'),
      expect.any(Error)
    );

    console.log('✅ VERIFIED: Customer request saved to database despite email failure');
  });

  test('CRITICAL: Multiple entries can be saved even with continuous email failures', async () => {
    // Create 3 enquiries with email service down
    for (let i = 1; i <= 3; i++) {
      mockReq = {
        body: {
          name: `User ${i}`,
          phoneNumber: `+123456789${i}`,
          email: `user${i}@example.com`,
          source: 'website'
        }
      };

      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: i,
        name: `User ${i}`,
        phoneNumber: `+123456789${i}`,
        email: `user${i}@example.com`,
        source: 'website',
        createdat: new Date()
      });

      await createEnquiry(mockReq, mockRes);

      // Verify each entry was saved
      expect(mockPrismaClient.enquiry.create).toHaveBeenCalledTimes(i);
      expect(mockRes.status).toHaveBeenCalledWith(201);
    }

    // Wait for all async notifications
    await new Promise(resolve => setImmediate(resolve));

    // Verify all 3 email attempts were made (and failed)
    expect(mockNotificationService.sendEnquiryNotification).toHaveBeenCalledTimes(3);

    // Verify all 3 errors were logged
    expect(consoleSpy).toHaveBeenCalledTimes(3);

    console.log('✅ VERIFIED: Multiple entries saved successfully despite continuous email failures');
  });

  test('CRITICAL: Email service timeout does not block database operations', async () => {
    // Simulate email service timeout
    mockNotificationService.sendEnquiryNotification.mockImplementation(
      () => new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 5000)
      )
    );

    mockReq = {
      body: {
        name: 'Timeout Test',
        phoneNumber: '+1234567890',
        email: 'timeout@example.com',
        source: 'website'
      }
    };

    const mockDbEntry = {
      id: 99,
      name: 'Timeout Test',
      phoneNumber: '+1234567890',
      email: 'timeout@example.com',
      source: 'website',
      createdat: new Date()
    };

    mockPrismaClient.enquiry.create.mockResolvedValue(mockDbEntry);

    const startTime = Date.now();
    await createEnquiry(mockReq, mockRes);
    const responseTime = Date.now() - startTime;

    // CRITICAL VERIFICATION: Response was immediate (not blocked by timeout)
    expect(responseTime).toBeLessThan(100); // Should respond in less than 100ms

    // CRITICAL VERIFICATION: Database entry was created
    expect(mockPrismaClient.enquiry.create).toHaveBeenCalledTimes(1);

    // CRITICAL VERIFICATION: Success response was sent immediately
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(mockDbEntry);

    console.log(`✅ VERIFIED: Database operation completed in ${responseTime}ms (not blocked by email timeout)`);
  });
});
