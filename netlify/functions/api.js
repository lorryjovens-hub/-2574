const app = require('../../proxy-server');
const serverless = require('serverless-http');

module.exports.handler = serverless(app);