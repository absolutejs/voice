import { expect, test } from "bun:test";
import {
  applyRiskTieredPhraseHintCorrections,
  applyLexiconCorrections,
  applyPhraseHintCorrections,
  createDomainLexicon,
  createDomainPhraseHints,
  createLexiconCorrectionHandler,
  createPhraseHintCorrectionHandler,
  createRiskyTurnCorrectionHandler,
} from "../src/correction";

test("applyPhraseHintCorrections replaces matched aliases with canonical hint text", () => {
  const result = applyPhraseHintCorrections(
    "Slight rainstorms are likely in a trip around the mountain and shelter beneath wealth.",
    [
      {
        aliases: ["trip around the mountain"],
        text: "trip round the mountain",
      },
      {
        aliases: ["shelter beneath wealth"],
        text: "shelter beneath well thatched trees that shed the rain like a roof",
      },
    ],
  );

  expect(result.changed).toBe(true);
  expect(result.text).toBe(
    "Slight rainstorms are likely in a trip round the mountain and shelter beneath well thatched trees that shed the rain like a roof.",
  );
  expect(result.matches.map((match) => match.hint.text)).toEqual([
    "trip round the mountain",
    "shelter beneath well thatched trees that shed the rain like a roof",
  ]);
});

test("createPhraseHintCorrectionHandler returns correction metadata when a hint is applied", async () => {
  const handler = createPhraseHintCorrectionHandler({
    provider: "test-corrector",
    reason: "test-reason",
  });

  const result = await handler({
    api: {} as never,
    context: {},
    fallback: undefined,
    phraseHints: [
      {
        aliases: ["joe johnson"],
        text: "Joe Johnston",
      },
    ],
    session: {} as never,
    text: "We spoke with Joe Johnson yesterday.",
    transcripts: [],
  });

  expect(result).toEqual({
    metadata: {
      matchedAliases: ["joe johnson"],
      matchedHints: ["Joe Johnston"],
    },
    provider: "test-corrector",
    reason: "test-reason",
    text: "We spoke with Joe Johnston yesterday.",
  });
});

test("applyPhraseHintCorrections supports fuzzy multi-word alias recovery", () => {
  const result = applyPhraseHintCorrections(
    "One may easily find shelter beneath wealth during the storm.",
    [
      {
        aliases: ["shelter beneath well"],
        text: "shelter beneath well thatched trees that shed the rain like a roof",
      },
    ],
  );

  expect(result.changed).toBe(true);
  expect(result.text).toBe(
    "One may easily find shelter beneath well thatched trees that shed the rain like a roof during the storm.",
  );
});

test("applyLexiconCorrections repairs code-switch phrases using lexicon aliases", () => {
  const result = applyLexiconCorrections(
    "उसके बारे में complain करलो technology evolve हुई है",
    [
      {
        aliases: ["complain करलो technology evolve हुई है"],
        language: "hi-en",
        text: "complain कर लो technology evolve हुई है",
      },
    ],
  );

  expect(result.changed).toBe(true);
  expect(result.text).toBe(
    "उसके बारे में complain कर लो technology evolve हुई है",
  );
});

test("createLexiconCorrectionHandler returns lexicon correction metadata", async () => {
  const handler = createLexiconCorrectionHandler({
    provider: "lexicon-corrector",
    reason: "codeswitch-test",
  });

  const result = await handler({
    api: {} as never,
    context: {},
    fallback: undefined,
    lexicon: [
      {
        aliases: ["complain करलो"],
        language: "hi-en",
        text: "complain कर लो",
      },
    ],
    phraseHints: [],
    session: {} as never,
    text: "उसके बारे में complain करलो",
    transcripts: [],
  });

  expect(result).toEqual({
    metadata: {
      matchedAliases: ["complain करलो"],
      matchedHints: ["complain कर लो"],
    },
    provider: "lexicon-corrector",
    reason: "codeswitch-test",
    text: "उसके बारे में complain कर लो",
  });
});

test("createDomainPhraseHints keeps only safer aliases by default", () => {
  const result = createDomainPhraseHints([
    {
      aliases: ["aj", "absolute js", "absolute javascript"],
      text: "AbsoluteJS",
    },
  ]);

  expect(result).toEqual([
    {
      aliases: ["absolute js", "absolute javascript"],
      text: "AbsoluteJS",
    },
  ]);
});

test("createDomainLexicon preserves language and pronunciation metadata", () => {
  const result = createDomainLexicon([
    {
      aliases: ["joe johnson"],
      language: "en",
      pronunciation: "JOE JON-ston",
      text: "Joe Johnston",
    },
  ]);

  expect(result).toEqual([
    {
      aliases: ["joe johnson"],
      language: "en",
      pronunciation: "JOE JON-ston",
      text: "Joe Johnston",
    },
  ]);
});

test("applyRiskTieredPhraseHintCorrections disables fuzzy replacement in safe mode", () => {
  const result = applyRiskTieredPhraseHintCorrections(
    "One may easily find shelter beneath wealth during the storm.",
    [
      {
        aliases: ["shelter beneath well"],
        text: "shelter beneath well thatched trees that shed the rain like a roof",
      },
    ],
    { riskTier: "safe" },
  );

  expect(result.changed).toBe(false);
});

test("createRiskyTurnCorrectionHandler only applies on lower-confidence turns", async () => {
  const handler = createRiskyTurnCorrectionHandler({
    maxAverageConfidence: 0.9,
    provider: "risky-turn-corrector",
    reason: "low-confidence-second-pass",
    riskTier: "balanced",
  });

  const skipped = await handler({
    api: {} as never,
    context: {},
    fallback: undefined,
    lexicon: [],
    phraseHints: [
      {
        aliases: ["shelter beneath well"],
        text: "shelter beneath well thatched trees that shed the rain like a roof",
      },
    ],
    session: {} as never,
    text: "One may easily find shelter beneath wealth during the storm.",
    transcripts: [
      {
        confidence: 0.97,
        id: "1",
        isFinal: true,
        text: "One may easily find shelter beneath wealth during the storm.",
      },
    ],
  });
  expect(skipped).toBeUndefined();

  const applied = await handler({
    api: {} as never,
    context: {},
    fallback: undefined,
    lexicon: [],
    phraseHints: [
      {
        aliases: ["shelter beneath well"],
        text: "shelter beneath well thatched trees that shed the rain like a roof",
      },
    ],
    session: {} as never,
    text: "One may easily find shelter beneath wealth during the storm.",
    transcripts: [
      {
        confidence: 0.62,
        id: "2",
        isFinal: true,
        text: "One may easily find shelter beneath wealth during the storm.",
      },
    ],
  });

  expect(applied).toEqual({
    metadata: {
      averageConfidence: 0.62,
      matchedAliases: ["shelter beneath well"],
      matchedHints: [
        "shelter beneath well thatched trees that shed the rain like a roof",
      ],
      riskTier: "balanced",
    },
    provider: "risky-turn-corrector",
    reason: "low-confidence-second-pass",
    text: "One may easily find shelter beneath well thatched trees that shed the rain like a roof during the storm.",
  });
});
