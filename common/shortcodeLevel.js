const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;
const LEVELS_PER_YEAR = 10;

const GENESIS_ANCHOR = Object.freeze({
  timestamp: Date.UTC(2020, 0, 16, 0, 0, 0),
  blockHeight: 1,
});

const REFERENCE_ANCHOR = Object.freeze({
  timestamp: Date.UTC(2025, 10, 18, 0, 0, 0),
  blockHeight: 1423700,
});

const BLOCK_HEIGHT_SNAPSHOTS = [GENESIS_ANCHOR, REFERENCE_ANCHOR];

const toSortedSnapshots = snapshots =>
  snapshots
    .filter(s => Number.isFinite(s.timestamp) && Number.isFinite(s.blockHeight))
    .sort((a, b) => a.timestamp - b.timestamp);

const computeBlocksPerLevelBetweenAnchors = (earlier, later) => {
  if (!earlier || !later) {
    return null;
  }
  const msDelta = later.timestamp - earlier.timestamp;
  const blockDelta = later.blockHeight - earlier.blockHeight;
  if (!(msDelta > 0) || !(blockDelta > 0)) {
    return null;
  }
  const days = msDelta / MS_PER_DAY;
  const years = days / DAYS_PER_YEAR;
  if (!(years > 0)) {
    return null;
  }
  const blocksPerYear = blockDelta / years;
  const blocksPerLevel = blocksPerYear / LEVELS_PER_YEAR;
  return blocksPerLevel > 0 ? Math.max(1, Math.round(blocksPerLevel)) : null;
};

const deriveBlocksPerLevel = () => {
  const sorted = toSortedSnapshots(BLOCK_HEIGHT_SNAPSHOTS);
  if (sorted.length >= 2) {
    const later = sorted[sorted.length - 1];
    const earlier = sorted[sorted.length - 2];
    const perLevel = computeBlocksPerLevelBetweenAnchors(earlier, later);
    if (Number.isFinite(perLevel) && perLevel > 0) {
      return perLevel;
    }
  }
  const fallback = computeBlocksPerLevelBetweenAnchors(GENESIS_ANCHOR, REFERENCE_ANCHOR);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 26280;
};

const BLOCKS_PER_LEVEL = deriveBlocksPerLevel();

let latestKnownBlockHeight = REFERENCE_ANCHOR.blockHeight;

const normalizeBlockHeight = candidate => {
  const numeric = Number(candidate);
  if (Number.isFinite(numeric) && numeric >= GENESIS_ANCHOR.blockHeight) {
    return numeric;
  }
  return null;
};

const setLatestKnownBlockHeight = candidate => {
  const numeric = normalizeBlockHeight(candidate);
  if (numeric !== null) {
    latestKnownBlockHeight = numeric;
  }
};

const getLatestKnownBlockHeight = () => latestKnownBlockHeight;

const determineCurrentBlockHeight = overrideHeight => {
  const overrideNumeric = normalizeBlockHeight(overrideHeight);
  if (overrideNumeric !== null) {
    return overrideNumeric;
  }
  if (Number.isFinite(latestKnownBlockHeight)) {
    return latestKnownBlockHeight;
  }
  return REFERENCE_ANCHOR.blockHeight;
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

const calculateLevelFromShortcode = (shortCode, options = {}) => {
  const birthBlock = parseBlockHeightFromShortcode(shortCode);
  if (!Number.isFinite(birthBlock)) {
    return null;
  }
  const currentHeight = determineCurrentBlockHeight(options.currentBlockHeight);
  const ageBlocks = Math.max(0, currentHeight - birthBlock);
  const level = Math.floor(ageBlocks / BLOCKS_PER_LEVEL);
  return Math.max(1, level);
};

module.exports = {
  calculateLevelFromShortcode,
  setLatestKnownBlockHeight,
  getLatestKnownBlockHeight,
  GENESIS_ANCHOR,
  REFERENCE_ANCHOR,
  BLOCKS_PER_LEVEL,
};
