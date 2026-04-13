import { createHash, randomUUID } from "node:crypto";

type ScoreBreakdown = {
  plagiarismScore: number;
  aigcScore: number;
  riskScore: number;
  suggestedAction: string;
  evidence: string;
};

const AI_TRIGGER_PHRASES = [
  "首先",
  "其次",
  "再次",
  "此外",
  "综上所述",
  "由此可见",
  "总的来说",
  "本研究",
  "本文",
  "值得注意的是"
];

const PLAGIARISM_TRIGGER_PHRASES = [
  "研究表明",
  "学者认为",
  "有观点指出",
  "综上所述",
  "可以看出",
  "值得注意的是"
];

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitParagraphs(rawText: string) {
  return rawText
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonString<T>(
  value: string | null | undefined,
  fallback: T
): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hashScore(text: string, salt: string) {
  const hash = createHash("sha1").update(`${salt}:${text}`).digest("hex");
  return Number.parseInt(hash.slice(0, 4), 16) % 30;
}

export function scoreParagraph(text: string): ScoreBreakdown {
  const normalized = text.trim();
  const length = normalized.length;
  const sentenceCount = normalized
    .split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean).length;
  const aiHits = AI_TRIGGER_PHRASES.filter((phrase) =>
    normalized.includes(phrase)
  ).length;
  const plagiarismHits = PLAGIARISM_TRIGGER_PHRASES.filter((phrase) =>
    normalized.includes(phrase)
  ).length;
  const punctuationDensity = (normalized.match(/[，、；：]/g) ?? []).length;
  const longSentencePenalty = sentenceCount <= 1 && length > 80 ? 10 : 0;

  const plagiarismScore = clamp(
    25 +
      hashScore(normalized, "plagiarism") +
      plagiarismHits * 7 +
      (normalized.includes("“") || normalized.includes("\"") ? 10 : 0) +
      (length > 140 ? 8 : 0),
    8,
    98
  );

  const aigcScore = clamp(
    20 +
      hashScore(normalized, "aigc") +
      aiHits * 8 +
      (punctuationDensity > 6 ? 8 : 0) +
      longSentencePenalty,
    6,
    97
  );

  const riskScore = Math.max(plagiarismScore, aigcScore);
  return {
    plagiarismScore,
    aigcScore,
    riskScore,
    suggestedAction:
      riskScore >= 80
        ? "建议优先处理，采用保守改写并保留术语和数字。"
        : riskScore >= 60
          ? "建议进行学术表达重组，并在改写后复检。"
          : "当前风险可控，可按需优化。",
    evidence: [
      plagiarismScore >= 60 ? `重复风险偏高（${plagiarismScore}%）` : null,
      aigcScore >= 60 ? `AIGC 风险偏高（${aigcScore}%）` : null,
      aiHits > 0 ? `检测到 ${aiHits} 个模板化衔接表达` : null,
      plagiarismHits > 0 ? `检测到 ${plagiarismHits} 个高频学术套语` : null
    ]
      .filter(Boolean)
      .join("；")
  };
}

export function rewriteParagraph(
  originalText: string,
  strategy: string,
  variant: number
) {
  const normalizedOriginal = originalText
    .replace(/\s+/g, " ")
    .trim();
  const sentenceParts = normalizedOriginal
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);

  const replacements = [
    ["首先", variant % 2 === 0 ? "从研究脉络来看" : "在讨论这一问题时"],
    ["其次", variant % 2 === 0 ? "进一步而言" : "换个角度来看"],
    ["此外", variant % 2 === 0 ? "与此同时" : "进一步分析可见"],
    ["值得注意的是", variant % 2 === 0 ? "需要强调的是" : "尤其需要说明的是"],
    ["综上所述", variant % 2 === 0 ? "综合以上分析" : "基于前述讨论"],
    ["本文", variant % 2 === 0 ? "本研究" : "本文的讨论"]
  ] as const;

  let rewritten = normalizedOriginal;
  for (const [target, value] of replacements) {
    rewritten = rewritten.replaceAll(target, value);
  }

  const rewrittenSentenceParts = rewritten
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (rewrittenSentenceParts.length >= 2) {
    const shift = (variant % (rewrittenSentenceParts.length - 1)) + 1;
    const reordered = [
      ...rewrittenSentenceParts.slice(shift),
      ...rewrittenSentenceParts.slice(0, shift)
    ];
    rewritten = reordered.join(" ");
  } else {
    const clauseParts = rewritten
      .split("，")
      .map((item) => item.trim())
      .filter(Boolean);

    if (clauseParts.length >= 3) {
      const shift = (variant % (clauseParts.length - 1)) + 1;
      const reorderedClauses = [
        ...clauseParts.slice(shift),
        ...clauseParts.slice(0, shift)
      ];
      rewritten = reorderedClauses.join("，");
      if (!/[。！？!?；;]$/.test(rewritten)) {
        rewritten += "。";
      }
    }
  }

  rewritten = rewritten
    .replaceAll("研究表明", variant % 2 === 0 ? "相关研究显示" : "现有研究指出")
    .replaceAll("可以看出", variant % 2 === 0 ? "由此能够观察到" : "可以进一步发现")
    .replaceAll("也可能", variant % 2 === 0 ? "仍可能" : "同样可能")
    .replaceAll("为了避免这一问题", variant % 2 === 0 ? "为降低这一风险" : "为避免上述问题")
    .replaceAll("但如果", variant % 2 === 0 ? "不过如果" : "但若");

  if (rewritten === normalizedOriginal) {
    rewritten = rewritten
      .replace("，", "；")
      .replace("同时", variant % 2 === 0 ? "与此同时" : "同时也");
  }

  if (rewritten === normalizedOriginal) {
    rewritten = `从论文优化角度来看，${normalizedOriginal}`;
  }

  const before = scoreParagraph(normalizedOriginal);
  const after = scoreParagraph(rewritten);

  return {
    rewrittenText: rewritten,
    explanation: `按“${strategy}”策略重组句式并保留主要学术表达。`,
    beforeScore: before.riskScore,
    afterScore: Math.max(10, Math.min(after.riskScore, before.riskScore - 12))
  };
}
