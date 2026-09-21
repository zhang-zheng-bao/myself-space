const instrumentalTag = /^\[instrumental:true\]\s*$/im;

export function isInstrumental(lyrics?: string) {
  return instrumentalTag.test(lyrics || "");
}

// Keep the flag in LRC metadata so existing storage preserves it without a migration.
export function setInstrumental(lyrics: string | undefined, enabled: boolean) {
  const text = (lyrics || "").replace(/^\[instrumental:true\][\t ]*(?:\r?\n|$)/gim, "");
  return enabled ? `[instrumental:true]\n${text}` : text;
}
