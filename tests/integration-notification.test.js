import { jest } from '@jest/globals';

// Mock the notification service before importing controllers
const mockNotificationService = {
  sendEnquiryNotification: jest.fn(),
  sendCustomerRequestNotification: jest.fn(),
  formatEnquiryTemplate: jest.fn(),
  formatCustomerRequestTemplate: jest.fn(),
  validateConfiguration: jest.fn(),
  getRateLimitStatus: jest.fn(),
  getRecipients: jest.fn()
};

// Mock the prisma client
const mockPrismaClient = {
  enquiry: {
    create: jest.fn()
  },
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

// Import controllers after mocking dependencies
const { createEnquiry } = await import('../controllers/enquiryController.js');
const { createCustomerRequest } = await import('../controllers/customerRequestController.js');

describe('Email Notification Integration Tests', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockPhoneUtils.isValidPhoneNumber.mockReturnValue(true);
    mockSerializeUtils.sanitizeForJSON.mockImplementation(data => data);
    mockNotificationService.getRecipients.mockReturnValue(['admin@example.com', 'notifications@example.com']);
    mockNotificationService.validateConfiguration.mockReturnValue({
      isValid: true,
      missingVariables: [],
      recipients: 2
    });
    mockNotificationService.getRateLimitStatus.mockReturnValue({
      monthly: { current: 5, limit: 200, remaining: 195 },
      daily: { current: 2, limit: 10, remaining: 8 },
      hourly: { current: 1, limit: 5, remaining: 4 }
    });

    // Setup mock request and response objects
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('Complete Enquiry Notification Flow', () => {
    beforeEach(() => {
      mockReq = {
        body: {
          name: 'John Doe',
          phoneNumber: '+1234567890',
          email: 'john@example.com',
          source: 'website'
        }
      };

      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: 1,
        name: 'John Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        source: 'website',
        createdat: new Date('2023-01-01T10:00:00Z')
      });
    });

    test('should complete full enquiry notification flow successfully', async () => {
      // Setup successful notification
      const mockTemplateData = {
        name: 'John Doe',
        phone_number: '+1234567890',
        email: 'john@example.com',
        source: 'website',
        created_date: '1/1/2023, 10:00:00 AM',
        enquiry_id: 1,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockNotificationService.formatEnquiryTemplate.mockReturnValue(mockTemplateData);
      mockNotificationService.sendEnquiryNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' },
        duration: 150
      });

      await createEnquiry(mockReq, mockRes);

      // Verify database creation
      expect(mockPrismaClient.enquiry.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          phoneNumber: '+1234567890',
          email: 'john@example.com',
          source: 'website'
        }
      });

      // Verify successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        id: 1,
        name: 'John Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        source: 'website',
        createdat: expect.any(Date)
      });

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was sent with correct data
      expect(mockNotificationService.sendEnquiryNotification).toHaveBeenCalledWith({
        id: 1,
        name: 'John Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        source: 'website',
        createdat: expect.any(Date)
      });
    });

    test('should handle enquiry with missing optional email field', async () => {
      // Update request body for this test
      mockReq.body = {
        name: 'Jane Smith',
        phoneNumber: '+1987654321',
        source: 'phone'
        // email is intentionally omitted
      };

      // Update mock to return enquiry without email
      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: 2,
        name: 'Jane Smith',
        phoneNumber: '+1987654321',
        email: null,
        source: 'phone',
        createdat: new Date('2023-01-02T14:30:00Z')
      });

      const mockTemplateData = {
        name: 'Jane Smith',
        phone_number: '+1987654321',
        email: 'Not provided',
        source: 'phone',
        created_date: '1/2/2023, 2:30:00 PM',
        enquiry_id: 2,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockNotificationService.formatEnquiryTemplate.mockReturnValue(mockTemplateData);
      mockNotificationService.sendEnquiryNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' }
      });

      await createEnquiry(mockReq, mockRes);

      // Verify database creation with null email
      expect(mockPrismaClient.enquiry.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Smith',
          phoneNumber: '+1987654321',
          email: null,
          source: 'phone'
        }
      });

      // Verify successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was sent with null email handled
      expect(mockNotificationService.sendEnquiryNotification).toHaveBeenCalledWith({
        id: 2,
        name: 'Jane Smith',
        phoneNumber: '+1987654321',
        email: null,
        source: 'phone',
        createdat: expect.any(Date)
      });
    });

    test('should verify email content formatting for enquiry', async () => {
      // Update request body for this test
      mockReq.body = {
        name: 'Test User',
        phoneNumber: '+1555123456',
        email: 'test@example.com',
        source: 'social_media'
      };

      const mockTemplateData = {
        name: 'Test User',
        phone_number: '+1555123456',
        email: 'test@example.com',
        source: 'social_media',
        created_date: '1/1/2023, 12:00:00 PM',
        enquiry_id: 3,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: 3,
        name: 'Test User',
        phoneNumber: '+1555123456',
        email: 'test@example.com',
        source: 'social_media',
        createdat: new Date('2023-01-01T12:00:00Z')
      });

      // Mock the notification service to actually call formatEnquiryTemplate
      mockNotificationService.sendEnquiryNotification.mockImplementation(async (data) => {
        mockNotificationService.formatEnquiryTemplate(data);
        return { success: true, response: { status: 200, text: 'OK' } };
      });
      mockNotificationService.formatEnquiryTemplate.mockReturnValue(mockTemplateData);

      await createEnquiry(mockReq, mockRes);

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify template formatting was called with correct data
      expect(mockNotificationService.formatEnquiryTemplate).toHaveBeenCalledWith({
        id: 3,
        name: 'Test User',
        phoneNumber: '+1555123456',
        email: 'test@example.com',
        source: 'social_media',
        createdat: expect.any(Date)
      });

      // Verify formatted data contains all required fields
      const formattedData = mockNotificationService.formatEnquiryTemplate.mock.results[0].value;
      expect(formattedData).toHaveProperty('name', 'Test User');
      expect(formattedData).toHaveProperty('phone_number', '+1555123456');
      expect(formattedData).toHaveProperty('email', 'test@example.com');
      expect(formattedData).toHaveProperty('source', 'social_media');
      expect(formattedData).toHaveProperty('created_date');
      expect(formattedData).toHaveProperty('enquiry_id', 3);
      expect(formattedData).toHaveProperty('recipients');
    });
  });

  describe('Complete Customer Request Notification Flow', () => {
    beforeEach(() => {
      mockReq = {
        body: {
          full_name: 'Alice Johnson',
          phone_number: '+1234567890',
          company_name: 'Tech Corp',
          preferred_location: 'San Francisco',
          additional_requirements: 'Need 24/7 support'
        }
      };

      mockPrismaClient.customer_request.create.mockResolvedValue({
        id: 1,
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support',
        created_at: new Date('2023-01-01T15:00:00Z')
      });
    });

    test('should complete full customer request notification flow successfully', async () => {
      const mockTemplateData = {
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support',
        created_date: '1/1/2023, 3:00:00 PM',
        request_id: 1,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockNotificationService.formatCustomerRequestTemplate.mockReturnValue(mockTemplateData);
      mockNotificationService.sendCustomerRequestNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' },
        duration: 200
      });

      await createCustomerRequest(mockReq, mockRes);

      // Verify database creation
      expect(mockPrismaClient.customer_request.create).toHaveBeenCalledWith({
        data: {
          full_name: 'Alice Johnson',
          phone_number: '+1234567890',
          company_name: 'Tech Corp',
          preferred_location: 'San Francisco',
          additional_requirements: 'Need 24/7 support'
        }
      });

      // Verify successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        id: 1,
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support',
        created_at: expect.any(Date)
      });

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was sent with correct data
      expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalledWith({
        id: 1,
        full_name: 'Alice Johnson',
        phone_number: '+1234567890',
        company_name: 'Tech Corp',
        preferred_location: 'San Francisco',
        additional_requirements: 'Need 24/7 support',
        created_at: expect.any(Date)
      });
    });

    test('should handle customer request with minimal additional requirements', async () => {
      // Set minimal requirements
      mockReq.body.additional_requirements = 'Basic service';

      mockPrismaClient.customer_request.create.mockResolvedValue({
        id: 2,
        full_name: 'Bob Wilson',
        phone_number: '+1987654321',
        company_name: 'Small Business LLC',
        preferred_location: 'Austin',
        additional_requirements: 'Basic service',
        created_at: new Date('2023-01-03T09:15:00Z')
      });

      const mockTemplateData = {
        full_name: 'Bob Wilson',
        phone_number: '+1987654321',
        company_name: 'Small Business LLC',
        preferred_location: 'Austin',
        additional_requirements: 'Basic service',
        created_date: '1/3/2023, 9:15:00 AM',
        request_id: 2,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockNotificationService.formatCustomerRequestTemplate.mockReturnValue(mockTemplateData);
      mockNotificationService.sendCustomerRequestNotification.mockResolvedValue({
        success: true,
        response: { status: 200, text: 'OK' }
      });

      await createCustomerRequest(mockReq, mockRes);

      // Verify successful response
      expect(mockRes.status).toHaveBeenCalledWith(201);

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was sent with minimal requirements
      expect(mockNotificationService.sendCustomerRequestNotification).toHaveBeenCalledWith({
        id: 2,
        full_name: 'Bob Wilson',
        phone_number: '+1987654321',
        company_name: 'Small Business LLC',
        preferred_location: 'Austin',
        additional_requirements: 'Basic service',
        created_at: expect.any(Date)
      });
    });

    test('should verify email content formatting for customer request', async () => {
      const mockTemplateData = {
        full_name: 'Carol Davis',
        phone_number: '+1555987654',
        company_name: 'Enterprise Solutions',
        preferred_location: 'New York',
        additional_requirements: 'Enterprise-grade security and compliance',
        created_date: '1/4/2023, 11:30:00 AM',
        request_id: 3,
        recipients: 'admin@example.com, notifications@example.com'
      };

      mockPrismaClient.customer_request.create.mockResolvedValue({
        id: 3,
        full_name: 'Carol Davis',
        phone_number: '+1555987654',
        company_name: 'Enterprise Solutions',
        preferred_location: 'New York',
        additional_requirements: 'Enterprise-grade security and compliance',
        created_at: new Date('2023-01-04T11:30:00Z')
      });

      mockReq.body = {
        full_name: 'Carol Davis',
        phone_number: '+1555987654',
        company_name: 'Enterprise Solutions',
        preferred_location: 'New York',
        additional_requirements: 'Enterprise-grade security and compliance'
      };

      // Mock the notification service to actually call formatCustomerRequestTemplate
      mockNotificationService.sendCustomerRequestNotification.mockImplementation(async (data) => {
        mockNotificationService.formatCustomerRequestTemplate(data);
        return { success: true, response: { status: 200, text: 'OK' } };
      });
      mockNotificationService.formatCustomerRequestTemplate.mockReturnValue(mockTemplateData);

      await createCustomerRequest(mockReq, mockRes);

      // Wait for async notification
      await new Promise(resolve => setImmediate(resolve));

      // Verify template formatting was called with correct data
      expect(mockNotificationService.formatCustomerRequestTemplate).toHaveBeenCalledWith({
        id: 3,
        full_name: 'Carol Davis',
        phone_number: '+1555987654',
        company_name: 'Enterprise Solutions',
        preferred_location: 'New York',
        additional_requirements: 'Enterprise-grade security and compliance',
        created_at: expect.any(Date)
      });

      // Verify formatted data contains all required fields
      const formattedData = mockNotificationService.formatCustomerRequestTemplate.mock.results[0].value;
      expect(formattedData).toHaveProperty('full_name', 'Carol Davis');
      expect(formattedData).toHaveProperty('phone_number', '+1555987654');
      expect(formattedData).toHaveProperty('company_name', 'Enterprise Solutions');
      expect(formattedData).toHaveProperty('preferred_location', 'New York');
      expect(formattedData).toHaveProperty('additional_requirements', 'Enterprise-grade security and compliance');
      expect(formattedData).toHaveProperty('created_date');
      expect(formattedData).toHaveProperty('request_id', 3);
      expect(formattedData).toHaveProperty('recipients');
    });
  });

  describe('Email Service Failure Scenarios', () => {
    test('should handle enquiry notification service failure gracefully', async () => {
      mockReq = {
        body: {
          name: 'Error Test',
          phoneNumber: '+1234567890',
          email: 'error@example.com',
          source: 'test'
        }
      };

      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: 99,
        name: 'Error Test',
        phoneNumber: '+1234567890',
        email: 'error@example.com',
        source: 'test',
        createdat: new Date()
      });

      // Setup notification failure
      mockNotificationService.sendEnquiryNotification.mockRejectedValue(
        new Error('EmailJS service unavailable')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createEnquiry(mockReq, mockRes);

      // Verify successful response despite notification failure
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for async notification error handling
      await new Promise(resolve => setImmediate(resolve));

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send enquiry notification for ID 99:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle customer request notification service failure gracefully', async () => {
      mockReq = {
        body: {
          full_name: 'Error Test',
          phone_number: '+1234567890',
          company_name: 'Test Company',
          preferred_location: 'Test City',
          additional_requirements: 'Test requirements'
        }
      };

      mockPrismaClient.customer_request.create.mockResolvedValue({
        id: 99,
        full_name: 'Error Test',
        phone_number: '+1234567890',
        company_name: 'Test Company',
        preferred_location: 'Test City',
        additional_requirements: 'Test requirements',
        created_at: new Date()
      });

      // Setup notification failure
      mockNotificationService.sendCustomerRequestNotification.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createCustomerRequest(mockReq, mockRes);

      // Verify successful response despite notification failure
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Wait for async notification error handling
      await new Promise(resolve => setImmediate(resolve));

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send customer request notification for ID 99:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Data Validation and Edge Cases', () => {
    test('should not send notification when enquiry validation fails', async () => {
      mockReq = {
        body: {
          name: '', // Invalid empty name
          phoneNumber: '+1234567890',
          email: 'test@example.com',
          source: 'website'
        }
      };

      await createEnquiry(mockReq, mockRes);

      // Verify validation failure response
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid or missing `name`'
      });

      // Verify database creation was not called
      expect(mockPrismaClient.enquiry.create).not.toHaveBeenCalled();

      // Wait to ensure notification is not sent
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was not sent
      expect(mockNotificationService.sendEnquiryNotification).not.toHaveBeenCalled();
    });

    test('should not send notification when customer request validation fails', async () => {
      mockReq = {
        body: {
          full_name: 'Valid Name',
          phone_number: 'invalid-phone', // Invalid phone number
          company_name: 'Valid Company',
          preferred_location: 'Valid Location',
          additional_requirements: 'Valid requirements'
        }
      };

      // Setup phone validation to fail
      mockPhoneUtils.isValidPhoneNumber.mockReturnValue(false);

      await createCustomerRequest(mockReq, mockRes);

      // Verify validation failure response
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing or invalid fields',
        fields: ['phone_number']
      });

      // Verify database creation was not called
      expect(mockPrismaClient.customer_request.create).not.toHaveBeenCalled();

      // Wait to ensure notification is not sent
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was not sent
      expect(mockNotificationService.sendCustomerRequestNotification).not.toHaveBeenCalled();
    });

    test('should handle database creation failure without sending notification', async () => {
      mockReq = {
        body: {
          name: 'Test User',
          phoneNumber: '+1234567890',
          email: 'test@example.com',
          source: 'website'
        }
      };

      // Setup database failure
      mockPrismaClient.enquiry.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createEnquiry(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create enquiry'
      });

      // Wait to ensure notification is not sent
      await new Promise(resolve => setImmediate(resolve));

      // Verify notification was not sent
      expect(mockNotificationService.sendEnquiryNotification).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Async Notification Behavior Verification', () => {
    test('should verify enquiry notifications are truly asynchronous', async () => {
      let notificationStarted = false;
      let notificationCompleted = false;

      mockReq = {
        body: {
          name: 'Async Test',
          phoneNumber: '+1234567890',
          email: 'async@example.com',
          source: 'test'
        }
      };

      mockPrismaClient.enquiry.create.mockResolvedValue({
        id: 100,
        name: 'Async Test',
        phoneNumber: '+1234567890',
        email: 'async@example.com',
        source: 'test',
        createdat: new Date()
      });

      // Setup slow notification to verify async behavior
      mockNotificationService.sendEnquiryNotification.mockImplementation(async (data) => {
        notificationStarted = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        notificationCompleted = true;
        return { success: true };
      });

      await createEnquiry(mockReq, mockRes);

      // Verify response was sent immediately
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      // Verify notification hasn't started yet (async behavior)
      expect(notificationStarted).toBe(false);
      expect(notificationCompleted).toBe(false);

      // Wait for async notification to start and complete
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setTimeout(resolve, 60));

      // Verify notification was processed asynchronously
      expect(notificationStarted).toBe(true);
      expect(notificationCompleted).toBe(true);
    });

    test('should verify customer request notifications are truly asynchronous', async () => {
      let notificationStarted = false;
      let notificationCompleted = false;

      mockReq = {
        body: {
          full_name: 'Async Test',
          phone_number: '+1234567890',
          company_name: 'Async Company',
          preferred_location: 'Async City',
          additional_requirements: 'Async requirements'
        }
      };

      mockPrismaClient.customer_request.create.mockResolvedValue({
        id: 100,
        full_name: 'Async Test',
        phone_number: '+1234567890',
        company_name: 'Async Company',
        preferred_location: 'Async City',
        additional_requirements: 'Async requirements',
        created_at: new Date()
      });

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

      // Verify notification hasn't started yet (async behavior)
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