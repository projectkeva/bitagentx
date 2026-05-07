const clampRatio = value => Math.max(0, Math.min(1, value));

export const clampAlphaValue = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 99) return 99;
  if (n < -99) return -99;
  return Math.round(n);
};

export const alphaTextPalettes = {
  lightBackground: {
    primaryColor: '#0b1224',
    secondaryColor: '#1f2937',
    accentColor: '#0f172a',
    underlineColor: 'rgba(0, 0, 0, 0.35)',
  },
  darkBackground: {
    primaryColor: '#E8F5FF',
    secondaryColor: '#D1E8FF',
    accentColor: '#7DD3FC',
    underlineColor: 'rgba(11, 18, 36, 0.75)',
  },
};

export const blendAlphaChannel = (from, to, ratio) => {
  const t = clampRatio(ratio);
  return Math.round(from + (to - from) * t);
};

const WHITE = { r: 255, g: 255, b: 255 };
const POSITIVE_BLUE = { r: 24, g: 128, b: 255 };
const NEGATIVE_GREEN = { r: 12, g: 176, b: 96 };
const FRAME_NEGATIVE_GREEN = { r: 0, g: 120, b: 42 };

export const buildAlphaColorComponents = (alphaValue, options = {}) => {
  const clamped = clampAlphaValue(alphaValue);
  if (clamped === null || clamped === 0) {
    return { ...WHITE };
  }

  const {
    minimumIntensity = 0,
    positiveTarget = POSITIVE_BLUE,
    negativeTarget = NEGATIVE_GREEN,
  } = options;

  const intensity = Math.max(Math.abs(clamped) / 99, minimumIntensity);
  const target = clamped < 0 ? negativeTarget : positiveTarget;
  return {
    r: blendAlphaChannel(WHITE.r, target.r, intensity),
    g: blendAlphaChannel(WHITE.g, target.g, intensity),
    b: blendAlphaChannel(WHITE.b, target.b, intensity),
  };
};

export const toRgbString = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
export const toRgbaString = ({ r, g, b }, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

export const getRelativeLuminance = ({ r, g, b }) => {
  const normalize = v => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  const R = normalize(r);
  const G = normalize(g);
  const B = normalize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

export const getAlphaColorDetails = alphaValue => {
  const clamped = clampAlphaValue(alphaValue);
  if (clamped === null) {
    return {
      backgroundColor: null,
      glowColor: null,
      glowSoftColor: null,
      luminance: null,
      textPalette: alphaTextPalettes.darkBackground,
    };
  }

  const components = buildAlphaColorComponents(clamped);
  const backgroundColor = toRgbString(components);
  const luminance = getRelativeLuminance(components);
  const isLightBackground = luminance >= 0.68;
  return {
    backgroundColor,
    glowColor: toRgbaString(components, 0.95),
    glowSoftColor: toRgbaString(components, 0.22),
    luminance,
    textPalette: isLightBackground ? alphaTextPalettes.lightBackground : alphaTextPalettes.darkBackground,
  };
};

export const getAlphaGlowDetails = alphaValue => {
  const components = buildAlphaColorComponents(alphaValue);
  return {
    glowColor: toRgbaString(components, 0.95),
    glowSoftColor: toRgbaString(components, 0.22),
  };
};

export const getAlphaAvatarFrameDetails = alphaValue => {
  const components = buildAlphaColorComponents(alphaValue, {
    minimumIntensity: 0.58,
    positiveTarget: POSITIVE_BLUE,
    negativeTarget: FRAME_NEGATIVE_GREEN,
  });
  return {
    frameColor: toRgbaString(components, 1),
    frameSoftColor: toRgbaString(components, 0.16),
  };
};
