const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateLdap, generateToken, authenticateToken, authRateLimit } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction, logSecurityEvent } = require('../middleware/auditLogger');
const { User, AuditLog } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

// Login endpoint
router.post('/login',
  authRateLimit,
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 2, max: 255 })
      .withMessage('Username must be between 2 and 255 characters'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 1 })
      .withMessage('Password cannot be empty')
  ],
  asyncHandler(async (req, res, next) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await AuditLog.logAuth(
        'LOGIN_VALIDATION_FAILED',
        null,
        req.ip,
        req.get('User-Agent'),
        { errors: errors.array(), username: req.body.username }
      );
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Authenticate with LDAP
    authenticateLdap(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        // Generate JWT token
        const token = generateToken(req.user);
        
        // Update last login
        await req.user.update({ last_login: new Date() });

        logger.info(`User ${req.user.username} logged in successfully`, {
          userId: req.user.id,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.json({
          message: 'Login successful',
          token,
          user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            display_name: req.user.display_name,
            is_admin: req.user.is_admin,
            last_login: req.user.last_login,
            preferences: req.user.preferences,
            quota_status: req.user.getUploadQuotaStatus()
          }
        });
      } catch (error) {
        logger.error('Login processing error:', error);
        await AuditLog.logAuth(
          'LOGIN_PROCESSING_ERROR',
          req.user?.id,
          req.ip,
          req.get('User-Agent'),
          { error: error.message, username: req.body.username }
        );
        next(error);
      }
    });
  })
);

// Logout endpoint
router.post('/logout',
  authenticateToken,
  logAction('LOGOUT', 'AUTH'),
  asyncHandler(async (req, res) => {
    await AuditLog.logAuth(
      'LOGOUT',
      req.user.id,
      req.ip,
      req.get('User-Agent'),
      { username: req.user.username }
    );

    logger.info(`User ${req.user.username} logged out`, {
      userId: req.user.id,
      ip: req.ip
    });

    res.json({
      message: 'Logout successful'
    });
  })
);

// Get current user profile
router.get('/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Refresh user data from database
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['ldap_groups'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        is_admin: user.is_admin,
        is_active: user.is_active,
        last_login: user.last_login,
        preferences: user.preferences,
        quota_status: user.getUploadQuotaStatus(),
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  })
);

// Update user profile
router.put('/profile',
  authenticateToken,
  [
    body('display_name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Display name must be between 1 and 255 characters'),
    body('preferences')
      .optional()
      .isObject()
      .withMessage('Preferences must be an object'),
    body('preferences.language')
      .optional()
      .isIn(['de', 'en'])
      .withMessage('Language must be either "de" or "en"'),
    body('preferences.email_notifications')
      .optional()
      .isBoolean()
      .withMessage('Email notifications must be a boolean'),
    body('preferences.default_retention_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Default retention days must be between 1 and 365')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { display_name, preferences } = req.body;
    const updateData = {};

    if (display_name !== undefined) {
      updateData.display_name = display_name;
    }

    if (preferences !== undefined) {
      // Merge with existing preferences
      updateData.preferences = {
        ...req.user.preferences,
        ...preferences
      };
    }

    // Update user
    await req.user.update(updateData);

    await AuditLog.logAuth(
      'PROFILE_UPDATED',
      req.user.id,
      req.ip,
      req.get('User-Agent'),
      { updatedFields: Object.keys(updateData) }
    );

    logger.info(`User ${req.user.username} updated profile`, {
      userId: req.user.id,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        display_name: req.user.display_name,
        is_admin: req.user.is_admin,
        preferences: req.user.preferences,
        quota_status: req.user.getUploadQuotaStatus()
      }
    });
  })
);

// Refresh token endpoint
router.post('/refresh',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Generate new token
    const token = generateToken(req.user);

    await AuditLog.logAuth(
      'TOKEN_REFRESHED',
      req.user.id,
      req.ip,
      req.get('User-Agent'),
      { username: req.user.username }
    );

    res.json({
      message: 'Token refreshed successfully',
      token
    });
  })
);

// Check authentication status
router.get('/status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        display_name: req.user.display_name,
        is_admin: req.user.is_admin,
        quota_status: req.user.getUploadQuotaStatus()
      }
    });
  })
);

// Change password endpoint (for local accounts, if implemented)
router.post('/change-password',
  authenticateToken,
  [
    body('current_password')
      .notEmpty()
      .withMessage('Current password is required'),
    body('new_password')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character')
  ],
  logSecurityEvent('PASSWORD_CHANGE_ATTEMPT'),
  asyncHandler(async (req, res) => {
    // This endpoint is for future implementation of local accounts
    // Currently, authentication is handled by LDAP/AD
    
    await AuditLog.logSecurityEvent(
      'PASSWORD_CHANGE_ATTEMPTED',
      req.user.id,
      req.ip,
      req.get('User-Agent'),
      { message: 'Password change attempted but not supported with LDAP authentication' }
    );

    res.status(501).json({
      error: 'Password change not supported',
      message: 'Password changes must be done through your organization\'s directory service (LDAP/Active Directory)'
    });
  })
);

// Get user's recent activity
router.get('/activity',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = parseInt(req.query.offset) || 0;

    const activities = await AuditLog.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: [
        'id', 'action', 'category', 'resource_type', 'resource_id',
        'ip_address', 'created_at', 'details'
      ]
    });

    const total = await AuditLog.count({
      where: { user_id: req.user.id }
    });

    res.json({
      activities,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  })
);

module.exports = router;
