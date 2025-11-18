const GENESIS_TIMESTAMP = Date.UTC(2020, 0, 16, 3, 0, 0);
const BLOCK_INTERVAL_MINUTES = 2;
const BLOCKS_PER_LEVEL = 26280;
const MS_PER_MINUTE = 60 * 1000;

const getCurrentBlockEstimate = () => {
  const elapsedMs = Date.now() - GENESIS_TIMESTAMP;
  const minutesSinceGenesis = Math.max(0, Math.floor(elapsedMs / MS_PER_MINUTE));
  const blocksSinceGenesis = Math.floor(minutesSinceGenesis / BLOCK_INTERVAL_MINUTES);
  return 1 + blocksSinceGenesis;
};

const parseBlockHeightFromShortcode = shortCode => {
  if (shortCode === undefined || shortCode === null) {
    return null;
  }
  const normalized = String(shortCode).trim();
  if (!/^\d+$/.test(normalized) || normalized.length < 2) {
    return null;
  }
  const lengthPrefix = parseInt(normalized[0], 10);
  if (!Number.isFinite(lengthPrefix) || lengthPrefix <= 0 || normalized.length < 1 + lengthPrefix) {
    return null;
  }
  const blockStr = normalized.slice(1, 1 + lengthPrefix);
  const blockHeight = parseInt(blockStr, 10);
  return Number.isNaN(blockHeight) ? null : blockHeight;
};

const calculateLevelFromShortcode = shortCode => {
  const birthBlock = parseBlockHeightFromShortcode(shortCode);
  if (!Number.isFinite(birthBlock)) {
    return null;
  }
  const currentBlock = getCurrentBlockEstimate();
  const ageBlocks = Math.max(0, currentBlock - birthBlock);
  const level = Math.floor(ageBlocks / BLOCKS_PER_LEVEL);
  return Math.max(1, level);
};

module.exports = {
  calculateLevelFromShortcode,
};
