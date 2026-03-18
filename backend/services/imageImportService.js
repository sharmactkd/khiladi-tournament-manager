import OpenAI from "openai";

const ENTRY_FIELDS = [
  "title",
  "name",
  "team",
  "gender",
  "dob",
  "weight",
  "event",
  "subEvent",
  "ageCategory",
  "weightCategory",
  "medal",
  "coach",
  "coachContact",
  "manager",
  "managerContact",
  "fathersName",
  "school",
  "class",
];

const FIELD_ALIASES = {
  title: [
    "title",
    "salutation",
    "prefix",
    "mr",
    "mrs",
    "ms",
    "miss",
    "master",
    "dr",
  ],
  name: [
    "name",
    "player",
    "player name",
    "athlete",
    "athlete name",
    "competitor",
    "student",
    "participant",
    "full name",
  ],
  team: [
    "team",
    "academy",
    "club",
    "school team",
    "association",
    "institution",
    "organization",
    "org",
  ],
  gender: [
    "gender",
    "sex",
    "m/f",
    "male female",
    "boy girl",
    "male/female",
  ],
  dob: [
    "dob",
    "date of birth",
    "birth date",
    "d.o.b",
    "birthdate",
    "dateofbirth",
  ],
  weight: [
    "weight",
    "wt",
    "body weight",
    "kg",
    "weight kg",
    "weight (kg)",
    "weight in kg",
  ],
  event: [
    "event",
    "discipline",
    "game",
    "category event",
  ],
  subEvent: [
    "sub event",
    "subevent",
    "sub-event",
    "division",
    "event type",
    "sub category",
    "sub-category",
  ],
  ageCategory: [
    "age category",
    "age group",
    "category age",
    "age division",
    "age class",
  ],
  weightCategory: [
    "weight category",
    "weight class",
    "division weight",
    "category weight",
    "wt category",
    "wt class",
  ],
  medal: [
    "medal",
    "position",
    "result",
    "place",
    "rank",
  ],
  coach: [
    "coach",
    "coach name",
    "trainer",
    "trainer name",
  ],
  coachContact: [
    "coach contact",
    "coach phone",
    "coach mobile",
    "coach number",
    "coach contact number",
    "coach mobile number",
    "coach contact no",
    "coach phone number",
  ],
  manager: [
    "manager",
    "manager name",
    "team manager",
  ],
  managerContact: [
    "manager contact",
    "manager phone",
    "manager mobile",
    "manager number",
    "manager contact number",
    "manager mobile number",
    "manager contact no",
    "manager phone number",
  ],
  fathersName: [
    "father",
    "father name",
    "father's name",
    "fathers name",
    "guardian",
    "guardian name",
    "parent name",
    "parent",
  ],
  school: [
    "school",
    "school name",
    "college",
    "college name",
    "institute",
    "institute name",
    "institution name",
  ],
  class: [
    "class",
    "grade",
    "standard",
    "section",
    "school class",
  ],
};

const TITLE_NORMALIZATION_MAP = {
  mr: "Mr.",
  mrs: "Mrs.",
  ms: "Ms.",
  miss: "Miss",
  master: "Master",
  dr: "Dr.",
};

const IMAGE_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentTitle: {
      type: "string",
      description:
        "Best possible short title for the document or sheet. Empty string if not identifiable.",
    },
    headers: {
      type: "array",
      description:
        "Detected source columns in their original reading order from left to right.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: {
            type: "string",
            description:
              "Detected source header text. If no clear header exists, create a practical column label.",
          },
          suggestedField: {
            type: "string",
            description:
              "Best matching KHILADI target field id, or empty string when no safe suggestion exists.",
          },
        },
        required: ["label", "suggestedField"],
      },
    },
    rows: {
      type: "array",
      description:
        "Detected table rows in reading order. Each row contains cell values aligned with the headers array.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cells: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Cell values aligned positionally to the headers array. Use empty strings for missing cells.",
          },
        },
        required: ["cells"],
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "Extraction caveats such as uncertain handwriting, merged cells, missing headers, or low confidence areas.",
    },
  },
  required: ["documentTitle", "headers", "rows", "warnings"],
};

const OPENAI_MODEL = process.env.OPENAI_IMAGE_IMPORT_MODEL || "gpt-5.4";
const OPENAI_MAX_ATTEMPTS = 3;
const OPENAI_INITIAL_RETRY_DELAY_MS = 1200;

let cachedOpenAIClient = null;

const normalizeString = (value) => String(value ?? "").trim();

const normalizeComparable = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTitleCase = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeTitle = (value) => {
  const raw = normalizeComparable(value);
  if (!raw) return "";
  return TITLE_NORMALIZATION_MAP[raw] || toTitleCase(value);
};

const normalizeGender = (value) => {
  const v = normalizeComparable(value);
  if (!v) return "";
  if (["m", "male", "boy", "boys", "man", "men"].includes(v)) return "Male";
  if (["f", "female", "girl", "girls", "woman", "women"].includes(v)) return "Female";
  return normalizeString(value);
};

const normalizeWeight = (value) => {
  const text = normalizeString(value);
  if (!text) return "";
  const matched = text.replace(/,/g, ".").match(/\d+(\.\d+)?/);
  return matched ? matched[0] : text;
};

const normalizePhone = (value) => {
  const text = normalizeString(value);
  if (!text) return "";
  const cleaned = text.replace(/[^\d+]/g, "");
  return cleaned || text;
};

const normalizeDate = (value) => {
  const text = normalizeString(value);
  if (!text) return "";

  const cleaned = text.replace(/[.]/g, "/").replace(/-/g, "/").replace(/\s+/g, "");
  const parts = cleaned.split("/").filter(Boolean);

  if (parts.length === 3) {
    const [a, b, c] = parts;

    if (a.length === 4) {
      const year = a;
      const month = b.padStart(2, "0");
      const day = c.padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    if (c.length === 4) {
      const day = a.padStart(2, "0");
      const month = b.padStart(2, "0");
      const year = c;
      return `${year}-${month}-${day}`;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return text;
};

const normalizeValueByField = (field, value) => {
  const raw = normalizeString(value);
  if (!raw) return "";

  switch (field) {
    case "title":
      return normalizeTitle(raw);

    case "name":
    case "team":
      return raw.toUpperCase();

    case "gender":
      return normalizeGender(raw);

    case "dob":
      return normalizeDate(raw);

    case "weight":
      return normalizeWeight(raw);

    case "coachContact":
    case "managerContact":
      return normalizePhone(raw);

    case "event":
    case "subEvent":
    case "ageCategory":
    case "weightCategory":
    case "medal":
    case "coach":
    case "manager":
    case "fathersName":
    case "school":
      return toTitleCase(raw);

    case "class":
      return raw;

    default:
      return raw;
  }
};

const makeUniqueHeaders = (headers) => {
  const seen = new Map();

  return headers.map((header, index) => {
    const base = normalizeString(header) || `Column ${index + 1}`;
    const currentCount = seen.get(base) || 0;
    seen.set(base, currentCount + 1);
    return currentCount === 0 ? base : `${base} ${currentCount + 1}`;
  });
};

const findSuggestedField = (header) => {
  const normalizedHeader = normalizeComparable(header);
  if (!normalizedHeader) return "";

  let bestField = "";
  let bestScore = 0;

  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeComparable(alias);

      let score = 0;

      if (normalizedHeader === normalizedAlias) {
        score = 100;
      } else if (
        normalizedHeader.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedHeader)
      ) {
        score = 80;
      } else {
        const headerWords = new Set(normalizedHeader.split(" ").filter(Boolean));
        const aliasWords = normalizedAlias.split(" ").filter(Boolean);
        const overlap = aliasWords.filter((word) => headerWords.has(word)).length;
        if (overlap > 0) {
          score = overlap * 20;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    });
  });

  return bestScore >= 20 ? bestField : "";
};

const buildSuggestedMapping = (headers, modelSuggestedMapping = {}) => {
  const usedTargets = new Set();
  const mapping = {};

  headers.forEach((header) => {
    const modelField = normalizeString(modelSuggestedMapping[header]);
    const safeModelField = ENTRY_FIELDS.includes(modelField) ? modelField : "";
    const fallbackField = findSuggestedField(header);
    const selectedField = safeModelField || fallbackField;

    if (selectedField && !usedTargets.has(selectedField)) {
      mapping[header] = selectedField;
      usedTargets.add(selectedField);
    } else {
      mapping[header] = "";
    }
  });

  return mapping;
};

const bufferToDataUrl = (buffer, mimeType = "image/png") => {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getRetryDelayMs = (attemptNumber) =>
  OPENAI_INITIAL_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attemptNumber - 1));

const isRetryableOpenAIError = (error) => {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;

  const code = normalizeString(error?.code).toLowerCase();
  if (["etimedout", "ecconnreset", "econnreset", "eai_again", "timeout"].includes(code)) {
    return true;
  }

  const type = normalizeString(error?.type).toLowerCase();
  if (type.includes("rate_limit")) return true;

  return false;
};

const buildOpenAIError = (error, attemptsUsed) => {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);

  console.error("🔥 FINAL OpenAI ERROR WRAPPED:", {
    model: OPENAI_MODEL,
    attemptsUsed,
    status,
    message: error?.message,
    code: error?.code,
    type: error?.type,
    responseStatus: error?.response?.status,
    responseData: error?.response?.data,
  });

  let message = "OpenAI image analysis failed.";

  if (status === 401) {
    message = "OpenAI request failed: invalid API key.";
  } else if (status === 400) {
    message = `OpenAI request failed: ${error?.message || "bad request"}`;
  } else if (status === 429) {
    message =
      attemptsUsed > 1
        ? "Image analysis is temporarily rate-limited. Please wait a few seconds and try again."
        : "OpenAI request failed: rate limit reached. Please try again shortly.";
  } else if ([500, 502, 503, 504].includes(status)) {
    message =
      attemptsUsed > 1
        ? "Image analysis is temporarily unavailable. Please wait a few seconds and try again."
        : "OpenAI image analysis is temporarily unavailable.";
  } else if (error?.message) {
    message = error.message;
  }

  const wrappedError = new Error(message);
  wrappedError.status = status || 502;
  wrappedError.code = error?.code;
  wrappedError.type = error?.type;
  return wrappedError;
};

const getOpenAIClient = () => {
  if (cachedOpenAIClient) return cachedOpenAIClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is missing in the backend environment.");
    error.status = 500;
    throw error;
  }

  cachedOpenAIClient = new OpenAI({ apiKey });
  return cachedOpenAIClient;
};

const buildVisionPrompt = () => {
  const fieldList = ENTRY_FIELDS.join(", ");

  return [
    "You are extracting structured tournament data from a single uploaded image for a MERN production app called KHILADI.",
    "Return only the structured data required by the JSON schema.",
    "",
    "Your job:",
    "1. Detect the table or record structure from the image.",
    "2. Preserve reading order from top-to-bottom and left-to-right.",
    "3. Extract printed, handwritten, scanned, low-quality, and partially merged table data as accurately as possible.",
    "4. Do not hallucinate. If text is unreadable or uncertain, use an empty string and mention the issue in warnings.",
    "5. If the sheet has no visible header row, infer practical column labels from the content.",
    "6. If the page is a label-value style sheet instead of a clean table, still convert it into one logical row.",
    "7. Keep rows aligned to the detected headers. Use empty strings for missing cells.",
    "8. Keep original cell text as close as possible. Do not normalize into final app format yet.",
    "",
    "KHILADI target fields that suggestedField may use:",
    fieldList,
    "",
    "Suggested-field rules:",
    "- Use one of the exact KHILADI field ids only when the match is reasonably clear.",
    "- Otherwise use an empty string.",
    "- Common examples:",
    "  - player / athlete / name -> name",
    "  - age group -> ageCategory",
    "  - weight class -> weightCategory",
    "  - medal / place / result / position -> medal",
    "  - team / academy / school / club -> team",
    "  - father / guardian -> fathersName",
    "",
    "Important extraction rules:",
    "- Ignore decorative graphics, logos, borders, and unrelated poster text.",
    "- If the image contains ranking/result sheets, capture the result rows only.",
    "- If a medal/result is implied by words like Gold, Silver, Bronze, 1st, 2nd, 3rd, place, rank, result, include that value in the relevant row/cell.",
    "- Prefer fewer, cleaner columns over noisy broken columns.",
    "- If multiple lines belong to one cell, combine them into a single string separated by a space.",
    "- Do not invent rows that are not visible.",
  ].join("\n");
};

const parseResponseJson = (response) => {
  const candidateTexts = [];

  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    candidateTexts.push(response.output_text.trim());
  }

  if (Array.isArray(response?.output)) {
    response.output.forEach((item) => {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        item.content.forEach((contentItem) => {
          const maybeText = contentItem?.text || contentItem?.value || "";
          if (typeof maybeText === "string" && maybeText.trim()) {
            candidateTexts.push(maybeText.trim());
          }
        });
      }
    });
  }

  for (const text of candidateTexts) {
    try {
      return JSON.parse(text);
    } catch (error) {
      continue;
    }
  }

  const error = new Error("OpenAI returned a response, but it could not be parsed as structured JSON.");
  error.status = 502;
  throw error;
};

const coerceModelOutput = (modelJson) => {
  const rawHeaders = Array.isArray(modelJson?.headers) ? modelJson.headers : [];
  const headers = makeUniqueHeaders(
    rawHeaders.map((item, index) => {
      if (item && typeof item === "object") {
        return normalizeString(item.label) || `Column ${index + 1}`;
      }
      return `Column ${index + 1}`;
    })
  );

  const modelSuggestedMapping = {};
  rawHeaders.forEach((item, index) => {
    const header = headers[index];
    const suggested = item && typeof item === "object" ? normalizeString(item.suggestedField) : "";
    modelSuggestedMapping[header] = ENTRY_FIELDS.includes(suggested) ? suggested : "";
  });

  const rawRows = Array.isArray(modelJson?.rows) ? modelJson.rows : [];
  const warnings = Array.isArray(modelJson?.warnings)
    ? modelJson.warnings.map((warning) => normalizeString(warning)).filter(Boolean)
    : [];

  const rows = rawRows.map((rowItem) => {
    const cells = Array.isArray(rowItem?.cells) ? rowItem.cells : [];
    const row = {};

    headers.forEach((header, index) => {
      row[header] = normalizeString(cells[index] ?? "");
    });

    return row;
  });

  const normalizedWarnings = [...warnings];

  if (!headers.length) {
    normalizedWarnings.push("No usable headers were detected from the image.");
  }

  if (!rows.length) {
    normalizedWarnings.push("No usable rows were detected from the image.");
  }

  rawRows.forEach((rowItem, index) => {
    const cellCount = Array.isArray(rowItem?.cells) ? rowItem.cells.length : 0;
    if (headers.length && cellCount !== headers.length) {
      normalizedWarnings.push(
        `Detected row ${index + 1} had ${cellCount} cells while ${headers.length} headers were expected. Missing cells were padded or extra cells were ignored.`
      );
    }
  });

  const suggestedMapping = buildSuggestedMapping(headers, modelSuggestedMapping);

  return {
    documentTitle: normalizeString(modelJson?.documentTitle),
    headers,
    rows,
    suggestedMapping,
    warnings: [...new Set(normalizedWarnings)],
  };
};

const createOpenAIAnalysisResponse = async (client, imageDataUrl) => {
  console.log("📦 OpenAI MODEL:", OPENAI_MODEL);
  console.log("🖼️ Image import request details:", {
    mimeTypePreview: imageDataUrl.slice(0, 40),
    imageDataUrlLength: imageDataUrl.length,
    maxAttempts: OPENAI_MAX_ATTEMPTS,
    initialRetryDelayMs: OPENAI_INITIAL_RETRY_DELAY_MS,
  });

  return client.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildVisionPrompt(),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "original",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "khiladi_image_import_analysis",
        description:
          "Structured extraction of tournament sheet image data for KHILADI import preview and mapping.",
        strict: true,
        schema: IMAGE_ANALYSIS_SCHEMA,
      },
    },
  });
};

const extractStructuredRowsWithOpenAI = async (file) => {
  const client = getOpenAIClient();
  const imageDataUrl = bufferToDataUrl(file.buffer, file.mimetype || "image/png");

  let lastError = null;

  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(`🚀 OpenAI attempt #${attempt}`, {
        model: OPENAI_MODEL,
        fileName: file?.originalname,
        fileSize: file?.size,
        mimeType: file?.mimetype,
      });

      const response = await createOpenAIAnalysisResponse(client, imageDataUrl);

      console.log("✅ OpenAI success on attempt:", attempt);

      return parseResponseJson(response);
    } catch (error) {
      lastError = error;

      console.error("❌ OpenAI error:", {
        attempt,
        model: OPENAI_MODEL,
        status: error?.status || error?.response?.status,
        message: error?.message,
        code: error?.code,
        type: error?.type,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
      });

      const shouldRetry =
        attempt < OPENAI_MAX_ATTEMPTS && isRetryableOpenAIError(error);

      console.log("🔁 Should retry?", {
        attempt,
        shouldRetry,
      });

      if (!shouldRetry) {
        throw buildOpenAIError(error, attempt);
      }

      const delayMs = getRetryDelayMs(attempt);
      console.log(`⏳ Waiting ${delayMs}ms before retry...`);

      await sleep(delayMs);
    }
  }

  throw buildOpenAIError(lastError, OPENAI_MAX_ATTEMPTS);
};

export const analyzeImportedImage = async (file) => {
  if (!file?.buffer) {
    const error = new Error("Uploaded image buffer not found.");
    error.status = 400;
    throw error;
  }

  console.log("🧠 analyzeImportedImage started", {
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    model: OPENAI_MODEL,
  });

  const modelJson = await extractStructuredRowsWithOpenAI(file);
  const structured = coerceModelOutput(modelJson);

  console.log("📊 OpenAI structured result summary", {
    documentTitle: structured.documentTitle,
    headersCount: structured.headers.length,
    rowsCount: structured.rows.length,
    warningsCount: structured.warnings.length,
  });

  return {
    fileName: file.originalname || "image",
    documentTitle: structured.documentTitle,
    headers: structured.headers,
    rows: structured.rows,
    suggestedMapping: structured.suggestedMapping,
    warnings: structured.warnings,
  };
};

export const confirmImportedImageRows = async ({ headers, rows, mapping }) => {
  if (!Array.isArray(headers) || !headers.length) {
    const error = new Error("Source headers are required.");
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(rows) || !rows.length) {
    const error = new Error("Source rows are required.");
    error.status = 400;
    throw error;
  }

  if (!mapping || typeof mapping !== "object") {
    const error = new Error("Column mapping is required.");
    error.status = 400;
    throw error;
  }

  const warnings = [];
  const acceptedRows = [];
  let rejectedRowsCount = 0;
  const dedupe = new Set();

  rows.forEach((sourceRow, rowIndex) => {
    const resultRow = {};

    headers.forEach((header) => {
      const targetField = normalizeString(mapping[header]);

      if (!targetField) return;
      if (!ENTRY_FIELDS.includes(targetField)) return;

      const value = normalizeValueByField(targetField, sourceRow?.[header]);
      if (value !== "") {
        resultRow[targetField] = value;
      }
    });

    const hasUsableData = Object.values(resultRow).some(
      (value) => normalizeString(value) !== ""
    );

    if (!hasUsableData) {
      rejectedRowsCount += 1;
      return;
    }

    if (!resultRow.name) {
      warnings.push(`Row ${rowIndex + 1} does not have a mapped Name field.`);
    }

    const dedupeKey = JSON.stringify(resultRow);
    if (dedupe.has(dedupeKey)) {
      warnings.push(`Duplicate row skipped at detected row ${rowIndex + 1}.`);
      rejectedRowsCount += 1;
      return;
    }

    dedupe.add(dedupeKey);
    acceptedRows.push(resultRow);
  });

  console.log("✅ confirmImportedImageRows summary", {
    sourceHeadersCount: headers.length,
    sourceRowsCount: rows.length,
    acceptedRowsCount: acceptedRows.length,
    rejectedRowsCount,
    warningsCount: [...new Set(warnings)].length,
  });

  if (!acceptedRows.length) {
    warnings.push("No valid rows remained after mapping and validation.");
  }

  return {
    rows: acceptedRows,
    warnings: [...new Set(warnings)],
    rejectedRowsCount,
  };
};