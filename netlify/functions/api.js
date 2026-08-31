/**
 * api.js — Netlify serverless function entry point.
 * Wraps the Express app with serverless-http for Netlify Functions.
 */

const serverless = require('serverless-http');
const dotenv = require('dotenv');

// Load .env in case it exists (local testing via netlify dev)
dotenv.config();

const app = require('../../backend/app');

exports.handler = serverless(app);
