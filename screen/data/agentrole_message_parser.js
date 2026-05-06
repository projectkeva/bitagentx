export const COMMAND_TOKEN_REGEX =
  /\/(?:r|welcome|m)\b(?:\s+<[^>\n]+>)?(?:\s+(?!—)[^\/\n—,]+)?|\/(?:d|linkstart|block|a)\b/gi;
export const COMMAND_DISPLAY_TOKEN_REGEX = /\[\[([^\]|]+)\|([^\]]+)\]\]/gi;
export const STORY_CHOICE_PREFIX_RE =
  /^\s*(?:\[\s*([A-Za-z]|\d{1,2})\s*\]|【\s*([A-Za-z]|\d{1,2})\s*】|\(\s*([A-Za-z]|\d{1,2})\s*\)|（\s*([A-Za-z]|\d{1,2})\s*）|([A-Za-z]|\d{1,2})\s*[).:：、．])\s*(.+)$/;

export const stripMarkdownWrap = s => {
  let t = String(s || '').trim();
  if ((t.startsWith('**') && t.endsWith('**')) || (t.startsWith('__') && t.endsWith('__'))) {
    t = t.slice(2, -2).trim();
  }
  return t;
};

export const isInteractiveCommand = commandText => {
  if (!commandText) {
    return false;
  }
  const trimmed = commandText.trim();
  if (/^\/welcome\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/r\b/i.test(trimmed)) {
    return true;
  }
  return true;
};

export const isValidCommandText = text => {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return false;
  }
  if (/^\/linkstart\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/a\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/reopen\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/r\s+.+/i.test(trimmed)) {
    return true;
  }
  if (/^\/r\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/welcome\s+.+/i.test(trimmed)) {
    return true;
  }
  if (/^\/welcome\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/m\b/i.test(trimmed)) {
    return true;
  }
  if (/^\/d(?:\s+(?:continue|new))?$/i.test(trimmed)) {
    return true;
  }
  if (/^\/block$/i.test(trimmed)) {
    return true;
  }
  if (/^\/lang(?:\s+.+)?$/i.test(trimmed)) {
    return true;
  }
  return false;
};

export const getCommandSegments = text => {
  if (!text) {
    return [];
  }
  const segments = [];
  const commandRegex = new RegExp(COMMAND_TOKEN_REGEX);
  const displayRegex = new RegExp(COMMAND_DISPLAY_TOKEN_REGEX);
  let lastIndex = 0;

  while (lastIndex < text.length) {
    commandRegex.lastIndex = lastIndex;
    displayRegex.lastIndex = lastIndex;
    const commandMatch = commandRegex.exec(text);
    const displayMatch = displayRegex.exec(text);
    let nextMatch = null;
    let matchType = null;

    if (commandMatch && displayMatch) {
      if (displayMatch.index <= commandMatch.index) {
        nextMatch = displayMatch;
        matchType = 'display';
      } else {
        nextMatch = commandMatch;
        matchType = 'command';
      }
    } else if (displayMatch) {
      nextMatch = displayMatch;
      matchType = 'display';
    } else if (commandMatch) {
      nextMatch = commandMatch;
      matchType = 'command';
    }

    if (!nextMatch) {
      segments.push({ text: text.slice(lastIndex), isCommand: false });
      break;
    }

    if (nextMatch.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, nextMatch.index), isCommand: false });
    }

    if (matchType === 'display') {
      const commandText = nextMatch[1];
      const displayText = nextMatch[2];
      segments.push({
        text: displayText,
        displayText,
        commandText,
        isCommand: isInteractiveCommand(commandText),
      });
      lastIndex = nextMatch.index + nextMatch[0].length;
    } else {
      const commandText = nextMatch[0];
      segments.push({ text: commandText, isCommand: isInteractiveCommand(commandText) });
      lastIndex = nextMatch.index + nextMatch[0].length;
    }
  }
  return segments;
};

export const extractStoryChoices = text => {
  if (!text) {
    return [];
  }

  const lines = String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const choices = [];
  const seenSends = new Set();

  const addChoice = (key, send, label) => {
    const normalizedSend = String(send || '').trim();
    if (!normalizedSend || seenSends.has(normalizedSend)) {
      return;
    }
    seenSends.add(normalizedSend);
    choices.push({ key: String(key || normalizedSend), send: normalizedSend, label: String(label || normalizedSend) });
  };

  lines.forEach(rawLine => {
    const line = stripMarkdownWrap(rawLine);
    const prefixMatch = line.match(STORY_CHOICE_PREFIX_RE);
    if (prefixMatch) {
      const marker = (prefixMatch[1] || prefixMatch[2] || prefixMatch[3] || prefixMatch[4] || prefixMatch[5] || '').trim();
      const content = (prefixMatch[6] || '').trim();
      if (marker && content.length >= 2) {
        const send = /^\d+$/.test(marker) ? marker : marker.toUpperCase();
        addChoice(send, send, line);
      }
      return;
    }

    const ynMatch = line.match(/^\s*(yes|no|y|n)\s*(?:[\/|]\s*(yes|no|y|n))?\s*$/i);
    if (!ynMatch) {
      return;
    }

    const first = ynMatch[1];
    const second = ynMatch[2];
    const normalizeBinary = value => {
      if (!value) {
        return null;
      }
      const lower = value.toLowerCase();
      if (lower === 'yes' || lower === 'y') {
        return { key: 'Y', send: 'Y', label: 'Y' };
      }
      if (lower === 'no' || lower === 'n') {
        return { key: 'N', send: 'N', label: 'N' };
      }
      return null;
    };

    const normalizedFirst = normalizeBinary(first);
    const normalizedSecond = normalizeBinary(second);
    if (normalizedFirst) {
      addChoice(normalizedFirst.key, normalizedFirst.send, normalizedFirst.label);
    }
    if (normalizedSecond) {
      addChoice(normalizedSecond.key, normalizedSecond.send, normalizedSecond.label);
    }
  });

  return choices;
};

export const stripStoryChoiceLines = text => {
  const raw = String(text || '');
  if (!raw) {
    return raw;
  }

  return raw
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = stripMarkdownWrap(line).trim();
      if (!trimmed) {
        return true;
      }
      if (STORY_CHOICE_PREFIX_RE.test(trimmed)) {
        return false;
      }
      if (/^(yes|no|y|n)\s*(?:[\/|]\s*(yes|no|y|n))?\s*$/i.test(trimmed)) {
        return false;
      }
      if (/^(?:input|select|choose|reply)\s+\d+(?:\s*[-~to]\s*\d+)?\b/i.test(trimmed)) {
        return false;
      }
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const parseStoryLineSegments = line => {
  const text = String(line || '');
  if (!text) {
    return [];
  }

  const chunks = text.split(/(\s*[\/|]\s*)/);
  const segments = [];

  chunks.forEach(chunk => {
    if (!chunk) {
      return;
    }
    const trimmed = stripMarkdownWrap(chunk);
    const isDivider = /^\s*[\/|]\s*$/.test(chunk);
    if (!trimmed || isDivider) {
      segments.push({ type: 'text', text: chunk });
      return;
    }

    const prefixMatch = trimmed.match(STORY_CHOICE_PREFIX_RE);
    if (prefixMatch) {
      const marker = (prefixMatch[1] || prefixMatch[2] || prefixMatch[3] || prefixMatch[4] || prefixMatch[5] || '').trim();
      const content = (prefixMatch[6] || '').trim();
      if (marker && content.length >= 1) {
        const send = /^\d+$/.test(marker) ? marker : marker.toUpperCase();
        segments.push({ type: 'choice', raw: chunk, send, display: content });
        return;
      }
    }

    const ynMatch = trimmed.match(/^(yes|no|y|n)\s*$/i);
    if (ynMatch) {
      const value = ynMatch[1].toLowerCase();
      const send = value === 'yes' || value === 'y' ? 'Y' : 'N';
      segments.push({ type: 'choice', raw: chunk, send, display: trimmed });
      return;
    }

    segments.push({ type: 'text', text: chunk });
  });

  return segments;
};

export const buildStoryInlineLines = text => {
  const raw = String(text || '');
  if (!raw) {
    return [];
  }

  return raw.split(/\r?\n/).map(lineRaw => {
    const segments = parseStoryLineSegments(lineRaw);
    return {
      type: 'line',
      segments: segments.length > 0 ? segments : [{ type: 'text', text: lineRaw }],
      rawLine: lineRaw,
    };
  });
};

export const isSystemCallMessage = text => String(text || '').trim() === 'SYSTEM CALL';

export const buildAccessibleMessageText = (params, getRoleUiText) => {
  const {
    item,
    text,
    isUser,
    showDigest,
    isStoryDigest,
    hasCopyLink,
    stateIsHistory,
    isSystemCall,
  } = params || {};
  const t = typeof getRoleUiText === 'function' ? getRoleUiText : key => key;
  const sourceText = String(showDigest && (item?.digest || item?.summary) ? item?.digest || item?.summary : text || '').trim();

  const stripDisplayTokens = raw => String(raw || '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s*\/\S+.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  let base = stripDisplayTokens(sourceText);

  if (!base) {
    if (isSystemCall) return t('systemMessage');
    if (isStoryDigest) return t('conversationSummary');
    if (hasCopyLink) return t('copyableCardMessage');
    return t('chatMessage');
  }

  if (stateIsHistory) {
    return base;
  }

  const rolePrefix = isUser ? t('me') : t('assistant');
  return `${rolePrefix}：${base}`;
};
