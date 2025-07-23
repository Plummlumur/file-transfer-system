const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const LdapStrategy = require('passport-ldapauth');
const jwt = require('jsonwebtoken');
const { User, AuditLog, SystemSetting } = require('../models');
const logger = require('../utils/logger');

// JWT Strategy for API authentication
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  algorithms: ['HS256']
};

passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await User.findByPk(payload.userId, {
      attributes: { exclude: ['ldap_groups'] }
    });

    if (!user || !user.is_active) {
      return done(null, false);
    }

    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return done(null, false);
    }

    return done(null, user);
  } catch (error) {
    logger.error('JWT Strategy error:', error);
    return done(error, false);
  }
}));

// LDAP Strategy for login authentication
const getLdapConfig = () => {
  return {
    server: {
      url: process.env.LDAP_URL,
      bindDN: process.env.LDAP_BIND_DN,
      bindCredentials: process.env.LDAP_BIND_PASSWORD,
      searchBase: process.env.LDAP_SEARCH_BASE,
      searchFilter: process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})',
      searchAttributes: ['displayName', 'mail', 'memberOf', 'sAMAccountName'],
      groupSearchBase: process.env.LDAP_GROUP_BASE,
      groupSearchFilter: process.env.LDAP_GROUP_FILTER || '(member={{dn}})',
      groupSearchAttributes: ['cn']
    },
    usernameField: 'username',
    passwordField: 'password'
  };
};

passport.use(new LdapStrategy(getLdapConfig(), async (user, done) => {
  try {
    logger.info('LDAP authentication successful for user:', user.sAMAccountName);

    // Extract user groups
    const memberOf = user.memberOf || [];
    const groups = Array.isArray(memberOf) 
      ? memberOf.map(dn => {
          const match = dn.match(/CN=([^,]+)/);
          return match ? match[1] : null;
        }).filter(Boolean)
      : [];

    // Check if user is in allowed groups
    const allowedGroups = await SystemSetting.getSetting('ALLOWED_LDAP_GROUPS', []);
    const adminGroups = await SystemSetting.getSetting('ADMIN_LDAP_GROUPS', []);
    
    const hasAllowedGroup = allowedGroups.some(group => groups.includes(group));
    const isAdmin = adminGroups.some(group => groups.includes(group));

    if (!hasAllowedGroup && !isAdmin) {
      logger.warn(`User ${user.sAMAccountName} not in allowed groups:`, { userGroups: groups, allowedGroups });
      return done(null, false, { message: 'Nicht berechtigt, das System zu verwenden' });
    }

    // Find or create user in database
    const [dbUser, created] = await User.findOrCreate({
      where: { username: user.sAMAccountName },
      defaults: {
        username: user.sAMAccountName,
        email: user.mail || `${user.sAMAccountName}@${process.env.LDAP_DOMAIN || 'local'}`,
        display_name: user.displayName || user.sAMAccountName,
        ldap_groups: groups,
        is_admin: isAdmin,
        last_login: new Date()
      }
    });

    if (!created) {
      // Update existing user
      await dbUser.update({
        email: user.mail || dbUser.email,
        display_name: user.displayName || dbUser.display_name,
        ldap_groups: groups,
        is_admin: isAdmin,
        last_login: new Date(),
        is_active: true
      });
    }

    logger.info(`User ${dbUser.username} ${created ? 'created' : 'updated'} successfully`);
    return done(null, dbUser);

  } catch (error) {
    logger.error('LDAP strategy error:', error);
    return done(error);
  }
}));

// Passport serialization (not used for JWT but required)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Setup passport middleware
const setupPassport = (app) => {
  app.use(passport.initialize());
};

// JWT token generation
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    isAdmin: user.is_admin,
    groups: user.ldap_groups || []
  };

  const options = {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'file-transfer-system',
    audience: 'file-transfer-users'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      logger.error('Authentication error:', err);
      return res.status(500).json({ error: 'Authentication error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user;
    next();
  })(req, res, next);
};

// Middleware to require admin privileges
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    AuditLog.logSecurityEvent(
      'UNAUTHORIZED_ADMIN_ACCESS',
      req.user?.id,
      req.ip,
      req.get('User-Agent'),
      { path: req.path, method: req.method }
    );
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
};

// Middleware to check specific LDAP group membership
const requireGroup = (groupName) => {
  return (req, res, next) => {
    if (!req.user || !req.user.hasGroup(groupName)) {
      AuditLog.logSecurityEvent(
        'UNAUTHORIZED_GROUP_ACCESS',
        req.user?.id,
        req.ip,
        req.get('User-Agent'),
        { requiredGroup: groupName, userGroups: req.user?.ldap_groups }
      );
      return res.status(403).json({ error: `Group membership required: ${groupName}` });
    }
    next();
  };
};

// Middleware to authenticate LDAP credentials
const authenticateLdap = (req, res, next) => {
  passport.authenticate('ldapauth', { session: false }, async (err, user, info) => {
    if (err) {
      logger.error('LDAP authentication error:', err);
      await AuditLog.logAuth(
        'LOGIN_FAILED',
        null,
        req.ip,
        req.get('User-Agent'),
        { error: err.message, username: req.body.username }
      );
      return res.status(500).json({ error: 'Authentication service error' });
    }

    if (!user) {
      logger.warn('LDAP authentication failed:', info);
      await AuditLog.logAuth(
        'LOGIN_FAILED',
        null,
        req.ip,
        req.get('User-Agent'),
        { reason: info?.message || 'Invalid credentials', username: req.body.username }
      );
      return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    }

    // Log successful authentication
    await AuditLog.logAuth(
      'LOGIN_SUCCESS',
      user.id,
      req.ip,
      req.get('User-Agent'),
      { username: user.username }
    );

    req.user = user;
    next();
  })(req, res, next);
};

// Middleware to extract user from token without requiring authentication
const optionalAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (!err && user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

// Rate limiting for authentication endpoints
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await AuditLog.logSecurityEvent(
      'RATE_LIMIT_EXCEEDED',
      null,
      req.ip,
      req.get('User-Agent'),
      { endpoint: req.path, attempts: req.rateLimit.current }
    );
    res.status(429).json({ error: 'Too many login attempts, please try again later' });
  }
});

module.exports = {
  setupPassport,
  authenticateToken,
  authenticateLdap,
  requireAdmin,
  requireGroup,
  optionalAuth,
  generateToken,
  authRateLimit
};
