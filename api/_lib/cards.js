export const MAX_CARD_BYTES = 4 * 1024 * 1024;
export const MAX_CARDS = 500;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TEXT_LENGTH = 2000;

const text = (value) => String(value ?? '').slice(0, MAX_TEXT_LENGTH);

export const isUuid = (value) => UUID_PATTERN.test(String(value ?? '').trim());

export const normaliseCard = (card) => ({
  card_index: card?.card_index,
  title: text(card?.title),
  year: text(card?.year),
  runtime: text(card?.runtime),
  director: text(card?.director),
  writer: text(card?.writer),
  starring: text(card?.starring),
  genre: text(card?.genre),
  still_filename: text(card?.still_filename),
  // Only still_url is unbounded; it carries a base64 data URL.
  still_url: card?.still_url ? String(card.still_url) : null
});

/** Returns an error string, or null when the card is acceptable. */
export const validateCard = (card) => {
  if (card === null || typeof card !== 'object' || Array.isArray(card)) {
    return 'card must be an object.';
  }

  if (!Number.isInteger(card.card_index) || card.card_index < 0) {
    return 'card_index must be a non-negative integer.';
  }

  if (Buffer.byteLength(JSON.stringify(normaliseCard(card)), 'utf8') > MAX_CARD_BYTES) {
    return 'This card is larger than 4 MB. Use a smaller still image.';
  }

  return null;
};
