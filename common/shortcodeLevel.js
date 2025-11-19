const GENESIS_TIMESTAMP = Date.UTC(2020, 0, 16, 3, 0, 0);
const BLOCK_INTERVAL_MINUTES = 2;
const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_YEAR = 365 * MINUTES_PER_DAY;
const DEFAULT_BLOCKS_PER_YEAR = MINUTES_PER_YEAR / BLOCK_INTERVAL_MINUTES;
const DEFAULT_BLOCKS_PER_LEVEL = DEFAULT_BLOCKS_PER_YEAR / 10;

const BLOCK_HEIGHT_ANCHORS = Object.freeze([
  { timestamp: GENESIS_TIMESTAMP, blockHeight: 1 },
  { timestamp: Date.UTC(2021, 0, 16, 3, 0, 0), blockHeight: 262801 },
  { timestamp: Date.UTC(2022, 0, 16, 3, 0, 0), blockHeight: 525601 },
  { timestamp: Date.UTC(2023, 0, 16, 3, 0, 0), blockHeight: 788401 },
  { timestamp: Date.UTC(2024, 0, 16, 3, 0, 0), blockHeight: 1051201 },
  { timestamp: Date.UTC(2025, 0, 16, 3, 0, 0), blockHeight: 1314001 },
]);

const SORTED_ANCHORS = BLOCK_HEIGHT_ANCHORS.slice().sort((a, b) => a.timestamp - b.timestamp);

const getLatestKnownAnchor = (nowMs = Date.now()) => {
  for (let i = SORTED_ANCHORS.length - 1; i >= 0; i -= 1) {
    const anchor = SORTED_ANCHORS[i];
    if (anchor.timestamp <= nowMs) {
      return anchor;
    }
  }
  return SORTED_ANCHORS[0] || null;
};

const resolveAnchorPair = (nowMs = Date.now()) => {
  if (SORTED_ANCHORS.length < 2) {
    return null;
  }
  const historical = SORTED_ANCHORS.filter(anchor => anchor.timestamp <= nowMs);
  if (historical.length >= 2) {
    const later = historical[historical.length - 1];
    const earlier = historical[historical.length - 2];
    return { earlier, later };
  }
  return {
    earlier: SORTED_ANCHORS[0],
    later: SORTED_ANCHORS[1],
  };
};

const getBlocksPerMsEstimate = (nowMs = Date.now()) => {
  const pair = resolveAnchorPair(nowMs);
  if (!pair) {
    return 1 / (BLOCK_INTERVAL_MINUTES * MS_PER_MINUTE);
  }
  const msDelta = pair.later.timestamp - pair.earlier.timestamp;
  const blockDelta = pair.later.blockHeight - pair.earlier.blockHeight;
  if (msDelta > 0 && blockDelta > 0) {
    return blockDelta / msDelta;
  }
  return 1 / (BLOCK_INTERVAL_MINUTES * MS_PER_MINUTE);
};

const getBlocksPerYearEstimate = (nowMs = Date.now()) => {
  const pair = resolveAnchorPair(nowMs);
  if (!pair) {
    return DEFAULT_BLOCKS_PER_YEAR;
  }
  const blockDelta = pair.later.blockHeight - pair.earlier.blockHeight;
  if (!(blockDelta > 0)) {
    return DEFAULT_BLOCKS_PER_YEAR;
  }
  const laterYear = new Date(pair.later.timestamp).getUTCFullYear();
  const earlierYear = new Date(pair.earlier.timestamp).getUTCFullYear();
  const yearDelta = Math.max(1, laterYear - earlierYear);
  return blockDelta / yearDelta;
};

const getBlocksPerLevelEstimate = (nowMs = Date.now()) => {
  const perYear = getBlocksPerYearEstimate(nowMs);
  const perLevel = perYear / 10;
  if (perLevel > 0) {
    return perLevel;
  }
  return DEFAULT_BLOCKS_PER_LEVEL;
};

const getCurrentBlockEstimate = (nowMs = Date.now()) => {
  const anchor = getLatestKnownAnchor(nowMs);
  if (!anchor) {
    const elapsedMs = nowMs - GENESIS_TIMESTAMP;
    const minutesSinceGenesis = Math.max(0, Math.floor(elapsedMs / MS_PER_MINUTE));
    const blocksSinceGenesis = Math.floor(minutesSinceGenesis / BLOCK_INTERVAL_MINUTES);
    return 1 + blocksSinceGenesis;
  }
  const elapsedMs = Math.max(0, nowMs - anchor.timestamp);
  const projectedBlocks = Math.floor(elapsedMs * getBlocksPerMsEstimate(nowMs));
  const candidate = anchor.blockHeight + projectedBlocks;
  return Math.max(anchor.blockHeight, candidate);
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
  const blocksPerLevel = getBlocksPerLevelEstimate();
  const level = Math.floor(ageBlocks / blocksPerLevel);
  return Math.max(1, level);
};

module.exports = {
  calculateLevelFromShortcode,
};
