import { jest } from '@jest/globals';

// Mock the notification service before importing the controller
const mockNotificationService = {
  sendCustomerRequestNotification: jest.fn()
};

// Mock the prisma client
const mockPrismaClient = {
  customer_request: {
    create: jest.fn()
  }
};

// Mock the utility modules
const mockPhoneUtils = {
  isValidPhoneNumber: jest.fn()
};

const mockSerializeUtils = {
  sanitizeForJSON: jest.fn()
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

// Import the controller after mocking dependencies
const { createCustomerRequest } = await import('../controllers/customerRequestController.js');

describe('Customer Request Notification Integration Tests', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockPhoneUtils.isValidPhoneNumber.mockReturnValue(true);
    mockSerializeUtils.sanitizeForJSON.mockImplementation(data => data);
    
    // Setup mock request and response objects
    mockReq = {
      body: {
        full_name: 'John Doe',
        phone_number: '+1234567890',
        company_name: 'Test Company',
        preferred_location: 'New York',
        additional_requirements: 'Test requirements'
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Setup default successful database creation
    mockPrismaClient.customer_request.create.mockResolvedValue({
      id: 1,
      full_name: 'John Doe',
      phone_number: '+1234567890',
      company_name: 'Test Company',
      preferred_location: 'New York',
      additional_requirements: 'Test requirements',
      created_at: new Date()
    });
  });

  describe('Successful Customer Request Creation with Notifications', () => {
    test('should send notification after successful customer request creation', async () => {
      // Setup successful notification
      mockNotificationService.sendCustomerRequestNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' }
      });

      await createCustomerRequest(mockReq, mockRes);

      // Verify database creation was called
      expect(mockPrismaClient.customer_request.create).toHaveBeenCalledWith({
        data: {
          full_name: 'John Doe',
          phone_number: '+1234567890',
          company_name: 'Test Company',
          preferred_location: 'New York',
          additional_requirements: 'Test requirements'
        }
      });

      // Verify successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for async notification to be called
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify notification was sent with correct data
      expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalledWith({
        id: 1,
        full_name: 'John Doe',
        phone_number: '+1234567890',
        company_name: 'Test Company',
        preferred_location: 'New York',
        additional_requirements: 'Test requirements',
        created_at: expect.any(Date)
      });
    });

    test('should handle notification service success without affecting response', async () => {
      // Setup successful notification
      mockNotificationService.sendCustomerRequestNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' }
      });

      await createCustomerRequest(mockReq, mockRes);

      // Verify controller response is not affected by notification success
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        id: 1,
        full_name: 'John Doe',
        phone_number: '+1234567890',
        company_name: 'Test Company',
        preferred_location: 'New York',
        additional_requirements: 'Test requirements',
        created_at: expect.any(Date)
      });
    });
  });

  describe('Email Service Failure Handling', () => {
    test('should continue normal operation when notification service fails', async () => {
      // Setup notification failure
      mockNotificationService.sendCustomerRequestNotification.mockRejectedValue(
        new Error('EmailJS service unavailable')
      );

      // Spy on console.error to verify error logging
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createCustomerRequest(mockReq, mockRes);

      // Verify database creation still succeeded
      expect(mockPrismaClient.customer_request.create).toHaveBeenCalled();

      // Verify successful response despite notification failure
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for async notification error handling
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was attempted
      expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalled();

      // Verify error was logged but didn't affect response
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send customer request notification for ID 1:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle notification service timeout without blocking response', async () => {
      // Setup notification timeout
      mockNotificationService.sendCustomerRequestNotification.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createCustomerRequest(mockReq, mockRes);

      // Verify immediate successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for timeout and error handling
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send customer request notification for ID 1:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle notification service returning failure result', async () => {
      // Setup notification service returning failure
      mockNotificationService.sendCustomerRequestNotification.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
        rateLimited: true
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createCustomerRequest(mockReq, mockRes);

      // Verify successful response despite notification failure
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for async notification handling
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was attempted
      expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalled();

      // Note: The controller doesn't currently check the return value of notification service,
      // it only catches thrown errors. This test verifies current behavior.
      
      consoleSpy.mockRestore();
    });
  });

  describe('Controller Validation with Notification Integration', () => {
    test('should not send notification when validation fails', async () => {
      // Setup invalid request (missing required field)
      mockReq.body.full_name = '';

      await createCustomerRequest(mockReq, mockRes);

      // Verify validation failure response
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing or invalid fields',
        fields: ['full_name']
      });

      // Verify database creation was not called
      expect(mockPrismaClient.customer_request.create).not.toHaveBeenCalled();

      // Wait to ensure notification is not sent
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was not sent
      expect(mockNotificationService.sendCustomerRequestNotification).not.toHaveBeenCalled();
    });

    test('should not send notification when database creation fails', async () => {
      // Setup database failure
      mockPrismaClient.customer_request.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createCustomerRequest(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create customer request'
      });

      // Wait to ensure notification is not sent
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was not sent
      expect(mockNotificationService.sendCustomerRequestNotification).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Async Notification Behavior', () => {
    test('should send notification asynchronously without blocking response', async () => {
      let notificationStarted = false;
      let notificationCompleted = false;

      // Setup slow notification to verify async behavior
      mockNotificationService.sendCustomerRequestNotification.mockImplementation(async (data) => {
        notificationStarted = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        notificationCompleted = true;
        return { success: true };
      });

      await createCustomerRequest(mockReq, mockRes);

      // Verify response was sent immediately
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Verify notification hasn't completed yet (async behavior)
      expect(notificationStarted).toBe(false);
      expect(notificationCompleted).toBe(false);

      // Wait for async notification to start and complete
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setTimeout(resolve, 60));

      // Verify notification was processed asynchronously
      expect(notificationStarted).toBe(true);
      expect(notificationCompleted).toBe(true);
    });
  });
});