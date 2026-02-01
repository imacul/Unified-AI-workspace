#!/usr/bin/env node
const { signToken } = require('../server/services/authService');
const payload = { email: process.env.TOKEN_EMAIL || 'dev@example.com', role: 'admin' };
const token = signToken(payload, { expiresIn: '30d' });
console.log(token);
