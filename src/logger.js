// node/common.js style

exports.logger = (level, file) => {
  const logger = require('logger').createLogger(file); // logs to STDOUT

  logger.setLevel(level);
  return logger
}
