const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { DatabaseSync } = require("node:sqlite");

// Хост/порт можно переопределить через переменные окружения:
//   HOST=0.0.0.0 PORT=8080 node server/server.js
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 5500;
const BUILD_TAG = "2026-05-04-ozon-reports-only-v1";

// Пути проекта (сервер лежит в <корень>/server, статика — в <корень>/web).
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(PROJECT_ROOT, "web");
const DATA_DIR = process.env.WBSP_DATA_DIR || path.join(PROJECT_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
const OZON_API_BASE = "https://api-seller.ozon.ru";

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username_key TEXT UNIQUE NOT NULL,
  username_display TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username_key TEXT NOT NULL,
  data_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(username_key, data_key)
);
CREATE TABLE IF NOT EXISTS user_data_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username_key TEXT NOT NULL,
  backup_name TEXT NOT NULL,
  backup_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, saltHex) {
  return crypto.pbkdf2Sync(String(password), Buffer.from(saltHex, "hex"), 120000, 32, "sha256").toString("hex");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readResponseJsonSafe(resp) {
  try {
    return await resp.json();
  } catch {
    try {
      const text = await resp.text();
      return { raw: text };
    } catch {
      return null;
    }
  }
}

async function ozonPost(pathname, clientId, apiKey, body) {
  const resp = await fetch(`${OZON_API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      "Client-Id": String(clientId || ""),
      "Api-Key": String(apiKey || ""),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const data = await readResponseJsonSafe(resp);
  return { ok: resp.ok, status: resp.status, data };
}

async function ozonGet(pathname, clientId, apiKey) {
  const resp = await fetch(`${OZON_API_BASE}${pathname}`, {
    method: "GET",
    headers: {
      "Client-Id": String(clientId || ""),
      "Api-Key": String(apiKey || ""),
      "Content-Type": "application/json",
    },
  });
  const data = await readResponseJsonSafe(resp);
  return { ok: resp.ok, status: resp.status, data };
}

async function ozonRequest(method, pathname, clientId, apiKey, body) {
  const upper = String(method || "GET").toUpperCase();
  const hasBody = upper !== "GET" && upper !== "HEAD";
  const resp = await fetch(`${OZON_API_BASE}${pathname}`, {
    method: upper,
    headers: {
      "Client-Id": String(clientId || ""),
      "Api-Key": String(apiKey || ""),
      "Content-Type": "application/json",
    },
    body: hasBody ? JSON.stringify(body || {}) : undefined,
  });
  const data = await readResponseJsonSafe(resp);
  return { ok: resp.ok, status: resp.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOzonWarehouses(clientId, apiKey) {
  const variants = [
    () => ozonPost("/v1/warehouse/list", clientId, apiKey, {}),
    () => ozonGet("/v1/warehouse/list", clientId, apiKey),
    () => ozonPost("/v2/warehouse/list", clientId, apiKey, {}),
  ];
  let last403 = false;
  for (const fn of variants) {
    try {
      const res = await fn();
      if (res.status === 403) { last403 = true; continue; }
      if (!res.ok) continue;
      last403 = false;
      const list = Array.isArray(res.data?.result) ? res.data.result : Array.isArray(res.data?.warehouses) ? res.data.warehouses : [];
      if (list.length >= 0) return list;
    } catch {}
  }
  if (last403) throw new Error("403_forbidden: проверьте Client ID и API Key");
  return [];
}

async function loadOzonProducts(clientId, apiKey, maxPages = 200) {
  const refs = [];
  let lastId = "";
  for (let i = 0; i < maxPages; i += 1) {
    const body = { filter: { visibility: "ALL" }, last_id: lastId, limit: 1000 };
    const res = await ozonPost("/v3/product/list", clientId, apiKey, body);
    if (!res.ok) break;
    const items = Array.isArray(res.data?.result?.items) ? res.data.result.items : [];
    items.forEach((it) => {
      refs.push({
        product_id: Number(it.product_id || 0),
        offer_id: String(it.offer_id || ""),
      });
    });
    const next = String(res.data?.result?.last_id || "");
    if (!next || !items.length) break;
    lastId = next;
  }
  return refs;
}

async function loadOzonProductInfo(clientId, apiKey, productIds) {
  const map = new Map();
  for (let i = 0; i < productIds.length; i += 100) {
    const chunk = productIds.slice(i, i + 100);
    const res = await ozonPost("/v2/product/info/list", clientId, apiKey, { product_id: chunk });
    if (!res.ok) continue;
    const items = Array.isArray(res.data?.result?.items) ? res.data.result.items : [];
    items.forEach((it) => map.set(Number(it.id || it.product_id || 0), it));
  }
  return map;
}

async function loadOzonStocks(clientId, apiKey, productIds) {
  const map = new Map();
  for (let i = 0; i < productIds.length; i += 100) {
    const chunk = productIds.slice(i, i + 100);
    const variants = [
      () => ozonPost("/v4/product/info/stocks", clientId, apiKey, { filter: { product_id: chunk }, limit: 1000 }),
      () => ozonPost("/v3/product/info/stocks", clientId, apiKey, { filter: { product_id: chunk }, limit: 1000 }),
      () => ozonPost("/v1/product/info/stocks", clientId, apiKey, { product_id: chunk }),
      () => ozonPost("/v2/product/info/stocks", clientId, apiKey, { product_id: chunk }),
    ];
    let stocksItems = [];
    for (const fn of variants) {
      try {
        const res = await fn();
        if (!res.ok) continue;
        stocksItems = Array.isArray(res.data?.result?.items)
          ? res.data.result.items
          : Array.isArray(res.data?.result)
          ? res.data.result
          : Array.isArray(res.data?.items)
          ? res.data.items
          : [];
        if (stocksItems.length || res.ok) break;
      } catch {}
    }
    stocksItems.forEach((it) => {
      const pid = Number(it.product_id || it.id || 0);
      if (!pid) return;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(it);
    });
  }
  return map;
}

async function loadOzonStocksFeed(clientId, apiKey, maxPages = 30) {
  const map = new Map();
  let lastId = "";
  for (let i = 0; i < maxPages; i += 1) {
    const body = {
      filter: { visibility: "ALL" },
      last_id: lastId,
      limit: 100,
    };
    const res = await ozonPost("/v3/product/info/stocks", clientId, apiKey, body);
    if (!res.ok) break;
    const items = Array.isArray(res.data?.result?.items) ? res.data.result.items : [];
    items.forEach((it) => {
      const pid = Number(it?.product_id || it?.id || 0);
      if (!pid) return;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(it);
    });
    const next = String(res.data?.result?.last_id || "");
    if (!next || !items.length) break;
    lastId = next;
  }
  return map;
}

function hasWarehouseDetailsInStocksMap(stocksMap) {
  if (!(stocksMap instanceof Map) || !stocksMap.size) return false;
  for (const items of stocksMap.values()) {
    for (const item of items || []) {
      if (item?.warehouse_id || item?.warehouseId || item?.warehouse_name || item?.warehouseName) return true;
      const stocks = item?.stocks;
      if (stocks && typeof stocks === "object") {
        const values = Array.isArray(stocks) ? stocks : Object.values(stocks);
        for (const s of values) {
          if (!s || typeof s !== "object") continue;
          const whIds = Array.isArray(s?.warehouse_ids) ? s.warehouse_ids : [];
          if (whIds.length) return true;
          if (s?.warehouse_id || s?.warehouseId || s?.warehouse_name || s?.warehouseName) return true;
        }
      }
    }
  }
  return false;
}

function collectInfoSkuCandidates(info, ref) {
  const out = new Set();
  const numeric = new Set();
  const add = (v) => {
    const s = String(v || "").trim();
    if (s) out.add(s);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) numeric.add(Math.round(n));
  };
  add(info?.sku);
  add(ref?.offer_id);
  const stocksObj = info?.stocks;
  if (stocksObj && typeof stocksObj === "object") {
    Object.values(stocksObj).forEach((x) => {
      if (x && typeof x === "object") add(x.sku);
    });
  }
  if (Array.isArray(info?.sources)) {
    info.sources.forEach((s) => add(s?.sku));
  }
  if (Array.isArray(info?.items)) {
    info.items.forEach((s) => add(s?.sku));
  }
  return { text: [...out], numeric: [...numeric] };
}

function splitChunks(arr, size = 100) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function extractItemsFromOzonResponse(data) {
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.result?.items)) return data.result.items;
  if (Array.isArray(data?.result?.rows)) return data.result.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function csvSplitLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => String(v || "").trim());
}

function parseCsvToRows(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = csvSplitLine(lines[0], delimiter);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = csvSplitLine(lines[i], delimiter);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function extractReportUrl(data) {
  const candidates = [
    data?.result?.url,
    data?.result?.file,
    data?.result?.file_url,
    data?.result?.download_url,
    data?.result?.link,
    data?.url,
    data?.file,
    data?.file_url,
    data?.download_url,
    data?.link,
  ];
  const found = candidates.find((v) => typeof v === "string" && /^https?:\/\//i.test(v));
  return found ? String(found) : "";
}

function extractReportCode(data) {
  const candidates = [
    data?.result?.code,
    data?.result?.report_id,
    data?.result?.reportId,
    data?.result?.report_code,
    data?.result?.reportCode,
    data?.result?.task_id,
    data?.result?.taskId,
    data?.code,
    data?.report_code,
    data?.reportCode,
    data?.task_id,
    data?.taskId,
  ];
  const found = candidates.find((v) => String(v || "").trim());
  return found ? String(found).trim() : "";
}

function extractRowsFromAnyPayload(data) {
  const rows = extractItemsFromOzonResponse(data);
  if (rows.length) return rows;
  if (Array.isArray(data?.result?.data)) return data.result.data;
  if (Array.isArray(data?.result?.report_data)) return data.result.report_data;
  if (Array.isArray(data?.result?.reportData)) return data.result.reportData;
  if (Array.isArray(data?.result?.list)) return data.result.list;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.list)) return data.list;
  if (typeof data?.result?.data === "string") {
    try {
      const parsed = JSON.parse(data.result.data);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const raw = String(data?.raw || "");
  if (raw && (raw.includes(";") || raw.includes(",")) && raw.includes("\n")) {
    return parseCsvToRows(raw);
  }
  return [];
}

function extractReportState(data) {
  const candidates = [
    data?.result?.status,
    data?.result?.state,
    data?.result?.report_status,
    data?.result?.reportState,
    data?.status,
    data?.state,
  ];
  const found = candidates.find((v) => String(v || "").trim());
  return found ? String(found).trim() : "";
}

function extractErrorMessage(data) {
  const candidates = [
    data?.message,
    data?.error,
    data?.description,
    data?.detail,
    data?.result?.message,
    data?.result?.error,
    data?.result?.description,
    data?.result?.detail,
  ];
  const found = candidates.find((v) => String(v || "").trim());
  if (found) return String(found).trim();
  if (typeof data?.raw === "string" && data.raw.trim()) return data.raw.trim().slice(0, 200);
  return "";
}

function getFieldValueByKeys(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function loadOzonStocksByWarehouseFromReportRows(reportRows, productRefs, infoMap) {
  const map = new Map();
  const keyMap = new Map();
  const pidBySku = new Map();
  const pidByOffer = new Map();
  const pidByProductId = new Map();
  (productRefs || []).forEach((ref) => {
    const pid = Number(ref?.product_id || 0);
    if (!pid) return;
    const info = infoMap.get(pid) || {};
    pidByProductId.set(String(pid), pid);
    const offerId = String(ref?.offer_id || info?.offer_id || "").trim();
    if (offerId) pidByOffer.set(offerId, pid);
    const cands = collectInfoSkuCandidates(info, ref);
    cands.text.forEach((sku) => pidBySku.set(String(sku), pid));
    cands.numeric.forEach((sku) => pidBySku.set(String(sku), pid));
  });

  for (const row of reportRows || []) {
    const pidRaw = getFieldValueByKeys(row, [
      "product_id",
      "productId",
      "id",
      "ID товара",
      "ID товара Ozon",
    ]);
    const skuRaw = getFieldValueByKeys(row, [
      "sku",
      "SKU",
      "item_code",
      "itemCode",
      "seller_sku",
      "sellerSku",
      "Артикул",
      "Артикул продавца",
      "offer_id",
      "offerId",
    ]);
    const offerRaw = getFieldValueByKeys(row, ["offer_id", "offerId", "item_code", "itemCode", "Артикул продавца", "Артикул"]);
    const pid =
      Number(pidRaw || 0) ||
      Number(pidBySku.get(String(skuRaw || "").trim()) || 0) ||
      Number(pidByOffer.get(String(offerRaw || "").trim()) || 0) ||
      Number(pidByProductId.get(String(pidRaw || "").trim()) || 0);
    const rec = {
      warehouse_id: getFieldValueByKeys(row, ["warehouse_id", "warehouseId", "ID склада", "Склад ID"]),
      warehouse_name: getFieldValueByKeys(row, ["warehouse_name", "warehouseName", "Склад", "Название склада"]),
      present: getNumber(
        getFieldValueByKeys(row, ["free_to_sell_amount", "freeToSellAmount", "available_amount", "availableAmount", "present", "available", "quantity", "stock", "В наличии", "Остаток"])
      ),
      reserved: getNumber(
        getFieldValueByKeys(row, ["reserved", "reserved_amount", "reservedAmount", "Резерв"])
      ),
      in_transit_to_warehouse: getNumber(
        getFieldValueByKeys(row, ["promised_amount", "promisedAmount", "in_transit_to_warehouse", "inTransitToWarehouse", "В пути"])
      ),
      in_transit_from_warehouse: getNumber(
        getFieldValueByKeys(row, ["in_transit_from_warehouse", "inTransitFromWarehouse"])
      ),
    };
    if (pid) {
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(rec);
    } else {
      const keys = [String(skuRaw || "").trim(), String(offerRaw || "").trim(), String(pidRaw || "").trim()].filter(Boolean);
      keys.forEach((k) => {
        const key = k.toLowerCase();
        if (!keyMap.has(key)) keyMap.set(key, []);
        keyMap.get(key).push(rec);
      });
    }
  }
  return { map, keyMap };
}

async function loadOzonStocksByWarehouseFromReport(clientId, apiKey, productRefs, infoMap) {
  const endpointStats = [];
  const pushStat = (endpoint, status, note = "") => {
    endpointStats.push({ endpoint, status: Number(status || 0), note: String(note || "") });
  };

  // Пробуем /v2/analytics/stock_on_warehouses с пагинацией
  for (const ep of ["/v2/analytics/stock_on_warehouses", "/v1/analytics/stock_on_warehouses"]) {
    let allRows = [];
    let offset = 0;
    const pageSize = 1000;
    let epWorked = false;
    for (let page = 0; page < 50; page += 1) {
      try {
        const res = await ozonRequest("POST", ep, clientId, apiKey, { limit: pageSize, offset, warehouse_type: "ALL" });
        pushStat(`POST ${ep}`, res.status, `direct; page:${page + 1}; offset:${offset}`);
        if (!res.ok) break;
        epWorked = true;
        const rows = extractRowsFromAnyPayload(res.data);
        if (!rows.length) break;
        allRows = allRows.concat(rows);
        if (rows.length < pageSize) break;
        offset += rows.length;
      } catch {
        pushStat(`POST ${ep}`, -1, "error");
        break;
      }
    }
    if (allRows.length) {
      const parsed = loadOzonStocksByWarehouseFromReportRows(allRows, productRefs, infoMap);
      if (parsed.map.size || parsed.keyMap.size) return { map: parsed.map, keyMap: parsed.keyMap, endpointStats };
    }
    if (epWorked) break;
  }

  const otherDirectVariants = [
    { method: "POST", endpoint: "/v1/report/warehouses/stock", body: {} },
    { method: "GET", endpoint: "/v1/report/warehouses/stock", body: null },
  ];

  for (const v of otherDirectVariants) {
    try {
      const res = await ozonRequest(v.method, v.endpoint, clientId, apiKey, v.body || undefined);
      pushStat(`${v.method} ${v.endpoint}`, res.status, "direct");
      if (!res.ok) continue;
      const rows = extractRowsFromAnyPayload(res.data);
      if (!rows.length) continue;
      const parsed = loadOzonStocksByWarehouseFromReportRows(rows, productRefs, infoMap);
      if (parsed.map.size || parsed.keyMap.size) return { map: parsed.map, keyMap: parsed.keyMap, endpointStats };
    } catch {
      pushStat(`${v.method} ${v.endpoint}`, -1, "error");
    }
  }

  const createVariants = [
    { endpoint: "/v1/report/stock/create", body: {} },
    { endpoint: "/v1/report/products/create", body: {} },
    { endpoint: "/v1/report/warehouses/stock", body: { create: true } },
  ];

  for (const create of createVariants) {
    try {
      const created = await ozonPost(create.endpoint, clientId, apiKey, create.body);
      pushStat(`POST ${create.endpoint}`, created.status, "create");
      if (!created.ok) continue;
      const immediateRows = extractRowsFromAnyPayload(created.data);
      if (immediateRows.length) {
        const parsed = loadOzonStocksByWarehouseFromReportRows(immediateRows, productRefs, infoMap);
        if (parsed.map.size || parsed.keyMap.size) return { map: parsed.map, keyMap: parsed.keyMap, endpointStats };
      }
      let reportUrl = extractReportUrl(created.data);
      const reportCode = extractReportCode(created.data);
      if (!reportUrl && reportCode) {
        for (let i = 0; i < 12; i += 1) {
          await sleep(1500);
          const infoVariants = [
            { method: "POST", endpoint: "/v1/report/info", body: { code: reportCode } },
            { method: "POST", endpoint: "/v1/report/info", body: { report_code: reportCode } },
            { method: "POST", endpoint: "/v1/report/info", body: { task_id: reportCode } },
            { method: "GET", endpoint: `/v1/report/info?code=${encodeURIComponent(reportCode)}`, body: null },
          ];
          for (const inf of infoVariants) {
            try {
              const infRes = await ozonRequest(inf.method, inf.endpoint, clientId, apiKey, inf.body || undefined);
              pushStat(`${inf.method} ${inf.endpoint}`, infRes.status, "poll");
              if (!infRes.ok) continue;
              reportUrl = extractReportUrl(infRes.data) || reportUrl;
              const pollRows = extractRowsFromAnyPayload(infRes.data);
              if (pollRows.length) {
                const parsed = loadOzonStocksByWarehouseFromReportRows(pollRows, productRefs, infoMap);
                if (parsed.map.size || parsed.keyMap.size) return { map: parsed.map, keyMap: parsed.keyMap, endpointStats };
              }
            } catch {
              pushStat(`${inf.method} ${inf.endpoint}`, -1, "poll_error");
            }
          }
          if (reportUrl) break;
        }
      }
      if (reportUrl) {
        try {
          const fileResp = await fetch(reportUrl);
          pushStat("GET report_url", fileResp.status, "download");
          if (fileResp.ok) {
            const text = await fileResp.text();
            const rows = parseCsvToRows(text);
            if (rows.length) {
              const parsed = loadOzonStocksByWarehouseFromReportRows(rows, productRefs, infoMap);
              if (parsed.map.size || parsed.keyMap.size) return { map: parsed.map, keyMap: parsed.keyMap, endpointStats };
            }
          }
        } catch {
          pushStat("GET report_url", -1, "download_error");
        }
      }
    } catch {
      pushStat(`POST ${create.endpoint}`, -1, "create_error");
    }
  }

  return { map: new Map(), keyMap: new Map(), endpointStats };
}

async function loadOzonOrdersSalesFromReport(clientId, apiKey, days = 30, productRefs = [], infoMap = new Map()) {
  const endpointStats = [];
  const pushStat = (endpoint, status, note = "") => {
    endpointStats.push({ endpoint, status: Number(status || 0), note: String(note || "") });
  };

  const pidBySku = new Map();
  const pidByOffer = new Map();
  const pidByProductId = new Map();
  (productRefs || []).forEach((ref) => {
    const pid = Number(ref?.product_id || 0);
    if (!pid) return;
    const info = infoMap.get(pid) || {};
    pidByProductId.set(String(pid), pid);
    const offerId = String(ref?.offer_id || info?.offer_id || "").trim();
    if (offerId) pidByOffer.set(offerId.toLowerCase(), pid);
    const cands = collectInfoSkuCandidates(info, ref);
    cands.text.forEach((s) => pidBySku.set(String(s || "").trim().toLowerCase(), pid));
    cands.numeric.forEach((n) => pidBySku.set(String(n), pid));
  });

  const periodDays = Math.max(1, Number(days) || 30);
  const toDate = new Date();
  toDate.setHours(23, 59, 59, 0);
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - periodDays);
  fromDate.setHours(0, 0, 0, 0);
  const fromIso = fromDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const toIso = toDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  pushStat("period", 200, `processed_at_from:${fromIso}; processed_at_to:${toIso}`);

  const createVariants = [
    {
      endpoint: "/v1/report/postings/create",
      body: {
        language: "DEFAULT",
        filter: {
          processed_at_from: fromIso,
          processed_at_to: toIso,
        },
        with: {
          analytics_data: true,
          financial_data: true,
          additional_data: false,
          customer_data: false,
          jewelry_codes: false,
        },
      },
    },
    {
      endpoint: "/v1/report/postings/create",
      body: {
        language: "DEFAULT",
        filter: {
          processed_at_from: fromIso,
          processed_at_to: toIso,
          delivery_schema: ["fbo", "fbs", "rfbs"],
        },
        with: {
          analytics_data: true,
          financial_data: true,
          additional_data: false,
          customer_data: false,
          jewelry_codes: false,
        },
      },
    },
    {
      endpoint: "/v1/report/postings/create",
      body: {
        language: "DEFAULT",
        filter: {
          processed_at_from: fromIso,
          processed_at_to: toIso,
          delivery_schema: ["fbo"],
        },
        with: {
          analytics_data: true,
          financial_data: true,
          additional_data: false,
          customer_data: false,
          jewelry_codes: false,
        },
      },
    },
    {
      endpoint: "/v1/report/postings/create",
      body: {
        filter: {
          processed_at_from: fromIso,
          processed_at_to: toIso,
          delivery_schema: ["fbo"],
          is_express: false,
          sku: [],
          cancel_reason_id: [],
          offer_id: "",
          status_alias: [],
          statuses: [],
          title: "",
        },
        language: "DEFAULT",
        with: {
          additional_data: false,
          analytics_data: true,
          customer_data: false,
          jewelry_codes: false,
        },
      },
    },
  ];

  const toOrdersMap = (rows) => {
    const map = new Map();
    let totalOrdered = 0;
    let totalBought = 0;
    const pickByPatterns = (obj, patterns) => {
      const entries = Object.entries(obj || {});
      for (const [k, v] of entries) {
        const key = String(k || "").toLowerCase();
        if (patterns.some((p) => key.includes(p))) {
          const n = getNumber(v);
          if (Number.isFinite(n)) return n;
        }
      }
      return 0;
    };
    (rows || []).forEach((row) => {
      const skuRaw = String(
        getFieldValueByKeys(row, [
          "sku",
          "SKU",
          "item_code",
          "itemCode",
          "offer_id",
          "offerId",
          "Артикул",
          "Артикул продавца",
        ]) || ""
      ).trim();
      const warehouseRaw = String(
        getFieldValueByKeys(row, [
          "warehouse_name",
          "warehouseName",
          "warehouse",
          "Склад",
          "Склад отгрузки",
          "Склад отправления",
          "Название склада",
        ]) || ""
      ).trim();
      const statusRaw = String(
        getFieldValueByKeys(row, ["status", "Статус", "posting_status", "order_status"]) || ""
      )
        .trim()
        .toLowerCase();
      const pidRaw = String(
        getFieldValueByKeys(row, ["product_id", "productId", "id", "ID товара", "ID товара Ozon"]) || ""
      ).trim();

      let ordered = Math.max(
        0,
        Math.round(
          getNumber(
            getFieldValueByKeys(row, [
              "ordered_count",
              "ordered_units",
              "orders_count",
              "orders",
              "ordered",
              "order_count",
              "order_units",
              "Заказов",
              "Заказы",
              "Заказано",
              "Заказано, шт",
              "Кол-во заказов",
            ])
          )
        )
      );
      let bought = Math.max(
        0,
        Math.round(
          getNumber(
            getFieldValueByKeys(row, [
              "delivered_count",
              "delivered_units",
              "sales_count",
              "sales",
              "bought",
              "sale_count",
              "sale_units",
              "Продаж",
              "Выкупы",
              "Продано",
              "Продано, шт",
            ])
          )
        )
      );
      if (ordered === 0) {
        ordered = Math.max(
          0,
          Math.round(
            pickByPatterns(row, ["ordered", "orders", "order", "заказ", "заказов", "заказано"])
          )
        );
      }
      if (bought === 0) {
        bought = Math.max(
          0,
          Math.round(
            pickByPatterns(row, ["delivered", "sales", "sale", "bought", "продаж", "продано", "выкуп"])
          )
        );
      }
      if (ordered === 0) {
        const qty = Math.max(
          0,
          Math.round(
            getNumber(
              getFieldValueByKeys(row, [
                "quantity",
                "qty",
                "items_count",
                "Количество",
                "Кол-во",
                "Количество товаров",
                "Количество",
                "Количество единиц",
                "Количество в отправлении",
              ])
            )
          )
        );
        if (qty > 0 && !(statusRaw.includes("cancel") || statusRaw.includes("отмен"))) {
          ordered = qty;
        }
      }
      if (ordered === 0 && bought === 0) return;
      totalOrdered += ordered;
      totalBought += bought;

      const sku = skuRaw.toLowerCase();
      const warehouse = warehouseRaw.toLowerCase();
      const pid =
        Number(pidRaw || 0) ||
        Number(pidBySku.get(sku) || 0) ||
        Number(pidByOffer.get(sku) || 0) ||
        Number(pidByProductId.get(pidRaw) || 0);
      const keys = [];
      if (sku) {
        if (warehouse) keys.push(`${sku}__${warehouse}`);
        keys.push(`${sku}__`);
      }
      if (pid > 0) {
        if (warehouse) keys.push(`${pid}__${warehouse}`);
        keys.push(`${pid}__`);
      }
      keys.forEach((key) => {
        const prev = map.get(key) || { ordered: 0, bought: 0 };
        map.set(key, { ordered: prev.ordered + ordered, bought: prev.bought + bought });
      });
    });
    return { map, totalOrdered, totalBought };
  };

  for (const variant of createVariants) {
    try {
      const created = await ozonPost(variant.endpoint, clientId, apiKey, variant.body);
      pushStat(`POST ${variant.endpoint}`, created.status, "create");
      if (!created.ok) {
        const errMsg = extractErrorMessage(created.data);
        if (errMsg) pushStat(`POST ${variant.endpoint}`, created.status, `error:${errMsg}`);
        continue;
      }

      let rows = extractRowsFromAnyPayload(created.data);
      let reportUrl = extractReportUrl(created.data);
      const reportCode = extractReportCode(created.data);
      const createdState = extractReportState(created.data);
      if (createdState) pushStat(`POST ${variant.endpoint}`, created.status, `state:${createdState}`);

      if (!rows.length && reportCode) {
        for (let i = 0; i < 40; i += 1) {
          await sleep(2000);
          const pollBodies = [{ code: reportCode }, { report_id: reportCode }, { task_id: reportCode }];
          let polled = false;
          for (const pbody of pollBodies) {
            const infoRes = await ozonPost("/v1/report/info", clientId, apiKey, pbody);
            const infoState = extractReportState(infoRes.data);
            let note = `poll#${i + 1}`;
            if (infoState) note += ` state:${infoState}`;
            if (!infoRes.ok) {
              pushStat("POST /v1/report/info", infoRes.status, note);
              continue;
            }
            rows = extractRowsFromAnyPayload(infoRes.data);
            reportUrl = extractReportUrl(infoRes.data) || reportUrl;
            if (rows.length) note += ` rows:${rows.length}`;
            if (reportUrl) note += " url:yes";
            pushStat("POST /v1/report/info", infoRes.status, note);
            polled = true;
            break;
          }
          if (!polled) continue;
          if (rows.length || reportUrl) break;
        }
      }

      if (!rows.length && reportUrl) {
        try {
          const fileResp = await fetch(reportUrl);
          pushStat("GET report_url", fileResp.status, "download");
          if (fileResp.ok) {
            const text = await fileResp.text();
            rows = parseCsvToRows(text);
            if (rows.length) {
              const sampleKeys = Object.keys(rows[0] || {}).slice(0, 12).join(",");
              pushStat("GET report_url", 200, `rows:${rows.length}; keys:${sampleKeys}`);
            }
          }
        } catch {
          pushStat("GET report_url", -1, "download_error");
        }
      }

      const parsed = toOrdersMap(rows);
      if (parsed.map.size || parsed.totalOrdered > 0 || parsed.totalBought > 0) {
        return {
          map: parsed.map,
          totalOrdered: parsed.totalOrdered,
          totalBought: parsed.totalBought,
          diag: endpointStats,
          source: "report_postings_api",
        };
      }
    } catch {
      pushStat(`POST ${variant.endpoint}`, -1, "create_error");
    }
  }

  return { map: new Map(), totalOrdered: 0, totalBought: 0, diag: endpointStats, source: "none" };
}

async function loadOzonOrdersSalesFromPostings(clientId, apiKey, days = 30, productRefs = [], infoMap = new Map()) {
  const diag = [];
  const pushDiag = (endpoint, status, note = "") => {
    diag.push({ endpoint, status: Number(status || 0), note: String(note || "") });
  };
  const fmtLocal = (d) => {
    const p2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  };
  const sameDayPrevMonth = (dateValue) => {
    const y = dateValue.getFullYear();
    const m = dateValue.getMonth();
    const day = dateValue.getDate();
    const targetMonth = m - 1;
    const candidate = new Date(y, targetMonth, 1, 0, 0, 0, 0);
    const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(day, lastDay);
    return new Date(candidate.getFullYear(), candidate.getMonth(), clampedDay, 0, 0, 0, 0);
  };

  const pidBySku = new Map();
  const pidByOffer = new Map();
  const pidByProductId = new Map();
  (productRefs || []).forEach((ref) => {
    const pid = Number(ref?.product_id || 0);
    if (!pid) return;
    pidByProductId.set(String(pid), pid);
    const info = infoMap.get(pid) || {};
    const offerId = String(ref?.offer_id || info?.offer_id || "").trim().toLowerCase();
    if (offerId) pidByOffer.set(offerId, pid);
    const cands = collectInfoSkuCandidates(info, ref);
    cands.text.forEach((s) => pidBySku.set(String(s || "").trim().toLowerCase(), pid));
    cands.numeric.forEach((n) => pidBySku.set(String(n), pid));
  });

  const map = new Map();
  let totalOrdered = 0;
  let totalBought = 0;
  let totalPostingsSeen = 0;
  let totalPostingsUsed = 0;
  let totalProductsSeen = 0;
  let totalProductsUsed = 0;
  const statusCounts = new Map();
  const bumpStatus = (status) => {
    const key = String(status || "empty").trim().toLowerCase() || "empty";
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  };
  // Период: сегодня 23:59:59 как верхняя граница, ровно 30 дней назад как нижняя.
  // Совпадает с тем как считает ЛК Ozon "последние 30 дней".
  const periodDays = Math.max(1, Number(days) || 30);
  const toDate = new Date();
  toDate.setHours(23, 59, 59, 0);
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - periodDays);
  fromDate.setHours(0, 0, 0, 0);
  const fromIso = fromDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const toIso = toDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  pushDiag(
    "period",
    200,
    `since_local:${fmtLocal(fromDate)}; to_local:${fmtLocal(toDate)}; since_utc:${fromIso}; to_utc:${toIso}`
  );

  const postingEndpoints = [
    { endpoint: "/v2/posting/fbo/list", schema: "fbo" },
    { endpoint: "/v3/posting/fbs/list", schema: "fbs" },
  ];

  const extractPostingProducts = (posting) => {
    const readProductQty = (product) => {
      const candidates = [
        product?.quantity,
        product?.qty,
        product?.count,
        product?.items_count,
        product?.required_qty,
        product?.requiredQty,
      ];
      for (const value of candidates) {
        const qty = Math.max(0, Math.round(getNumber(value)));
        if (qty > 0) return qty;
      }
      return 0;
    };
    const productKeys = (product) => {
      const keys = [];
      const add = (prefix, value) => {
        const s = String(value || "").trim().toLowerCase();
        if (s) keys.push(`${prefix}:${s}`);
      };
      add("pid", product?.product_id || product?.productId || product?.id);
      add("sku", product?.sku);
      add("offer", product?.offer_id || product?.offerId || product?.seller_sku || product?.sellerSku);
      return keys;
    };
    const mergeQuantities = (base, extras) => {
      if (!Array.isArray(base) || !base.length) return Array.isArray(extras) ? extras : [];
      if (!Array.isArray(extras) || !extras.length) return base;
      const qtyByKey = new Map();
      extras.forEach((item) => {
        const qty = readProductQty(item);
        if (qty <= 0) return;
        productKeys(item).forEach((key) => {
          if (!qtyByKey.has(key)) qtyByKey.set(key, qty);
        });
      });
      return base.map((item, idx) => {
        const currentQty = readProductQty(item);
        let bestQty = currentQty;
        const indexedQty = readProductQty(extras[idx]);
        if (indexedQty > bestQty) bestQty = indexedQty;
        for (const key of productKeys(item)) {
          const qty = qtyByKey.get(key);
          if (qty > bestQty) bestQty = qty;
        }
        if (bestQty > currentQty) return { ...item, quantity: bestQty };
        return item;
      });
    };

    const direct = Array.isArray(posting?.products)
      ? posting.products
      : Array.isArray(posting?.items)
      ? posting.items
      : Array.isArray(posting?.product_list)
      ? posting.product_list
      : [];

    const fromAnalytics = Array.isArray(posting?.analytics_data?.products)
      ? posting.analytics_data.products
      : Array.isArray(posting?.analytics_data?.items)
      ? posting.analytics_data.items
      : [];

    const fromFinancial = Array.isArray(posting?.financial_data?.products)
      ? posting.financial_data.products
      : Array.isArray(posting?.financial_data?.items)
      ? posting.financial_data.items
      : [];
    if (direct.length) return mergeQuantities(mergeQuantities(direct, fromFinancial), fromAnalytics);
    if (fromFinancial.length) return mergeQuantities(fromFinancial, fromAnalytics);
    if (fromAnalytics.length) return fromAnalytics;

    // Fallback: some responses may have a single product on posting level.
    const offer = String(posting?.offer_id || posting?.sku || posting?.seller_sku || "").trim();
    const pid = Number(posting?.product_id || posting?.productId || posting?.id || 0);
    const qty = getNumber(posting?.quantity ?? posting?.qty ?? posting?.items_count ?? 0);
    if (offer || pid || qty > 0) {
      return [
        {
          offer_id: offer,
          product_id: pid,
          quantity: qty > 0 ? qty : 1,
        },
      ];
    }
    return [];
  };

  const pageLimit = 1000;
  const maxPages = 1000;
  for (const postingEndpoint of postingEndpoints) {
    const endpoint = postingEndpoint.endpoint;
    let offset = 0;
    for (let page = 0; page < maxPages; page += 1) {
      // Передаём даты в запрос — Ozon фильтрует по created_at.
      // Дополнительно на стороне сервера отфильтруем по дате для точности.
      const bodyVariants = [
        {
          dir: "ASC",
          limit: pageLimit,
          offset,
          translit: false,
          filter: {
            since: fromIso,
            to: toIso,
          },
          with: {
            analytics_data: true,
            financial_data: true,
            legal_info: false,
          },
        },
        {
          dir: "ASC",
          limit: pageLimit,
          offset,
          translit: false,
          filter: {
            since: fromIso,
            to: toIso,
          },
        },
      ];
      if (page > 0) await sleep(250);
      let pageLoaded = false;
      for (const body of bodyVariants) {
        let retries = 0;
        const maxRetries = 2;
        while (retries <= maxRetries) {
        try {
          const res = await ozonPost(endpoint, clientId, apiKey, body);
          if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && retries < maxRetries) {
              retries += 1;
              await sleep(1000 * retries);
              continue;
            }
            pushDiag(endpoint, res.status || 0, `page:${page + 1}; ${extractErrorMessage(res.data) || "request_failed"}`);
            break;
          }
          const items = Array.isArray(res.data?.result?.postings)
            ? res.data.result.postings
            : Array.isArray(res.data?.result)
            ? res.data.result
            : Array.isArray(res.data?.postings)
            ? res.data.postings
            : [];
          const hasNext =
            res.data?.result && typeof res.data.result === "object" && !Array.isArray(res.data.result)
              ? Boolean(res.data.result.has_next)
              : Boolean(res.data?.has_next);
          const hasExplicitHasNext =
            (res.data?.result && typeof res.data.result === "object" && !Array.isArray(res.data.result) && "has_next" in res.data.result) ||
            (res.data && typeof res.data === "object" && "has_next" in res.data);
          if (items.length) {
            const firstPosting = items[0] || {};
            const postingKeys = Object.keys(firstPosting).slice(0, 8).join(",");
            const firstProducts = extractPostingProducts(firstPosting);
            const firstProductKeys = firstProducts.length ? Object.keys(firstProducts[0] || {}).slice(0, 8).join(",") : "-";
            const analyticsKeys =
              firstPosting?.analytics_data && typeof firstPosting.analytics_data === "object"
                ? Object.keys(firstPosting.analytics_data).slice(0, 8).join(",")
                : "-";
            const financialKeys =
              firstPosting?.financial_data && typeof firstPosting.financial_data === "object"
                ? Object.keys(firstPosting.financial_data).slice(0, 8).join(",")
                : "-";
            pushDiag(
              endpoint,
              200,
              `schema:${postingEndpoint.schema}; page:${page + 1}; offset:${offset}; postings:${items.length}; hasNext:${hasExplicitHasNext ? hasNext : "unknown"}; pKeys:${postingKeys}; prKeys:${firstProductKeys}; aKeys:${analyticsKeys}; fKeys:${financialKeys}`
            );
          }
          if (!items.length) {
            pushDiag(endpoint, 200, `schema:${postingEndpoint.schema}; page:${page + 1}; offset:${offset}; postings:0; hasNext:${hasExplicitHasNext ? hasNext : "unknown"}`);
            offset = -1;
            pageLoaded = true;
            break;
          }

          items.forEach((posting) => {
            const status = String(posting?.status || "").toLowerCase();
            totalPostingsSeen += 1;
            bumpStatus(status);

            // Серверная фильтрация по дате создания заказа
            const createdAt = String(posting?.created_at || posting?.in_process_at || "");
            if (createdAt) {
              const createdDate = new Date(createdAt);
              if (createdDate < fromDate || createdDate > toDate) return;
            }

            const whRaw = String(
              posting?.delivery_method?.warehouse_name ||
                posting?.analytics_data?.warehouse_name ||
                posting?.posting_info?.warehouse_name ||
                posting?.warehouse_name ||
                ""
            ).trim();
            const wh = whRaw.toLowerCase();
            const products = extractPostingProducts(posting);
            totalProductsSeen += products.length;
            products.forEach((p) => {
              // offer_id = артикул продавца, sku = числовой Ozon SKU
              const offerIdRaw = String(p?.offer_id || "").trim();
              const skuNumRaw = String(p?.sku || "").trim();
              const skuRaw = offerIdRaw || skuNumRaw;
              const sku = skuRaw.toLowerCase();
              const skuNum = skuNumRaw.toLowerCase();
              const offerId = offerIdRaw.toLowerCase();
              const pidDirect = Number(p?.product_id || p?.productId || p?.id || 0);
              const qty = Math.max(
                0,
                Math.round(
                  getNumber(
                    p?.quantity ??
                      p?.qty ??
                      p?.count ??
                      p?.items_count ??
                      p?.required_qty ??
                      p?.requiredQty ??
                      1
                  )
                )
              );
              if (qty <= 0) return;

              // Считаем заказом всё кроме отменённых — как в ЛК Ozon
              // Статусы из CSV: Доставлен, Доставляется, Отменён, Ожидает отгрузки, Ожидает сборки
              const isCancelled = status.includes("cancel") || status.includes("отмен") || status === "cancelled";
              const isDelivered = status.includes("deliver") || status === "delivered" || status.includes("доставлен");
              if (isCancelled) return;
              totalPostingsUsed += 1;
              totalProductsUsed += 1;

              const pid =
                Number(pidByProductId.get(String(pidDirect)) || 0) ||
                Number(pidDirect || 0) ||
                (offerId ? Number(pidByOffer.get(offerId) || 0) : 0) ||
                (skuNum ? Number(pidBySku.get(skuNum) || 0) : 0) ||
                (sku ? Number(pidBySku.get(sku) || 0) : 0) ||
                (sku ? Number(pidByOffer.get(sku) || 0) : 0);

              if (sku) {
                const skuKeys = [];
                if (wh) skuKeys.push(`${sku}__${wh}`);
                skuKeys.push(`${sku}__`);
                // Также добавляем ключи по offer_id и числовому sku отдельно
                if (offerId && offerId !== sku) {
                  if (wh) skuKeys.push(`${offerId}__${wh}`);
                  skuKeys.push(`${offerId}__`);
                }
                if (skuNum && skuNum !== sku && skuNum !== offerId) {
                  if (wh) skuKeys.push(`${skuNum}__${wh}`);
                  skuKeys.push(`${skuNum}__`);
                }
                skuKeys.forEach((keySku) => {
                  const prevSku = map.get(keySku) || { ordered: 0, bought: 0 };
                  prevSku.ordered += qty;
                  if (isDelivered) prevSku.bought += qty;
                  map.set(keySku, prevSku);
                });
              }
              totalOrdered += qty;
              if (isDelivered) totalBought += qty;

              if (pid > 0) {
                const pidKeys = [];
                if (wh) pidKeys.push(`${pid}__${wh}`);
                pidKeys.push(`${pid}__`);
                pidKeys.forEach((keyPid) => {
                  const prevPid = map.get(keyPid) || { ordered: 0, bought: 0 };
                  prevPid.ordered += qty;
                  if (isDelivered) prevPid.bought += qty;
                  map.set(keyPid, prevPid);
                });
              }
            });
          });

          pageLoaded = true;
          if (hasExplicitHasNext && !hasNext) {
            offset = -1;
          } else {
            offset += items.length || pageLimit;
          }
          break;
        } catch {
          if (retries < maxRetries) {
            retries += 1;
            await sleep(1000 * retries);
            continue;
          }
          pushDiag(endpoint, -1, `error page:${page + 1}`);
        }
        break;
        }
        if (pageLoaded) break;
      }
      if (!pageLoaded || offset < 0) {
        break;
      }
    }
  }
  pushDiag(
    "postings_summary",
    200,
    `postingsSeen:${totalPostingsSeen}; nonCancelledProductLines:${totalPostingsUsed}; productsSeen:${totalProductsSeen}; productsUsed:${totalProductsUsed}; statuses:${[...statusCounts.entries()]
      .slice(0, 20)
      .map(([k, v]) => `${k}:${v}`)
      .join(",") || "-"}`
  );

  return {
    map,
    totalOrdered,
    totalBought,
    diag,
    source: map.size || totalOrdered > 0 || totalBought > 0 ? "postings_api_fbo_fbs" : "none",
  };
}

async function loadOzonStocksByWarehouse(clientId, apiKey, productRefs, infoMap) {
  const pidBySku = new Map();
  const pidByOffer = new Map();
  const pidByProductId = new Map();
  const knownPids = new Set();
  (productRefs || []).forEach((ref) => {
    const pid = Number(ref?.product_id || 0);
    if (!pid) return;
    knownPids.add(pid);
    pidByProductId.set(String(pid), pid);
    const info = infoMap.get(pid) || {};
    const offerId = String(ref?.offer_id || info?.offer_id || "").trim();
    if (offerId && !pidByOffer.has(offerId)) pidByOffer.set(offerId, pid);
    const cands = collectInfoSkuCandidates(info, ref);
    cands.text.forEach((sku) => {
      if (!pidBySku.has(sku)) pidBySku.set(sku, pid);
    });
    cands.numeric.forEach((skuNum) => {
      const key = String(skuNum);
      if (!pidBySku.has(key)) pidBySku.set(key, pid);
    });
  });

  const skuList = [...pidBySku.keys()];
  const offerList = [...pidByOffer.keys()];
  const productIdList = [...pidByProductId.keys()];
  if (!skuList.length && !offerList.length && !productIdList.length) return { map: new Map(), endpointStats: [] };

  const out = new Map();
  const outByKey = new Map();
  const skuPidHints = new Map();
  const endpointStats = [];
  const getStat = (ep) => {
    let stat = endpointStats.find((s) => s.endpoint === ep);
    if (!stat) {
      stat = { endpoint: ep, okCalls: 0, totalItems: 0, lastStatus: 0, sampleKeys: [], sample: null };
      endpointStats.push(stat);
    }
    return stat;
  };

  const appendWarehouseItems = (items) => {
    items.forEach((it) => {
      const pidDirect = Number(
        it?.product_id || it?.productId || it?.id || it?.item_id || it?.itemId || 0
      );
      const itemCode = String(it?.item_code || it?.itemCode || "").trim();
      const itemName = String(it?.item_name || it?.itemName || "").trim();
      const sku = String(
        it?.sku ||
          it?.fbo_sku ||
          it?.fbs_sku ||
          it?.seller_sku ||
          it?.sellerSku ||
          itemCode ||
          ""
      ).trim();
      const offerId = String(it?.offer_id || it?.offerId || it?.offer || itemCode || "").trim();
      const sellerArticle = String(
        it?.supplier_article || it?.supplierArticle || it?.seller_article || it?.sellerArticle || itemCode || itemName || ""
      ).trim();
      const nmId = String(it?.nm_id || it?.nmId || "").trim();
      const pid =
        pidDirect ||
        Number(pidBySku.get(sku) || 0) ||
        Number(pidByOffer.get(offerId) || 0) ||
        Number(pidBySku.get(itemCode) || 0) ||
        Number(pidByOffer.get(itemCode) || 0) ||
        Number(pidByProductId.get(itemCode) || 0);
      const stockRec = {
        warehouse_id:
          it?.warehouse_id || it?.warehouseId || it?.warehouseID || it?.wh_id || "",
        warehouse_name:
          it?.warehouse_name || it?.warehouseName || it?.warehouse || it?.wh_name || "",
        present: getNumber(
          it?.present ||
            it?.available_amount ||
            it?.free_to_sell_amount ||
            it?.freeToSellAmount ||
            it?.available ||
            it?.stock ||
            it?.quantity
        ),
        reserved: getNumber(it?.reserved || it?.reserved_amount || it?.reservedAmount),
        in_transit_to_warehouse: getNumber(
          it?.in_transit_to_warehouse || it?.inTransitToWarehouse || it?.coming || it?.promised_amount || it?.promisedAmount
        ),
        in_transit_from_warehouse: getNumber(
          it?.in_transit_from_warehouse || it?.inTransitFromWarehouse
        ),
      };
      if (pid && knownPids.has(pid)) {
        if (!out.has(pid)) out.set(pid, []);
        out.get(pid).push(stockRec);
        const hintKeys = [sku, offerId, itemCode, sellerArticle]
          .map((v) => String(v || "").trim().toLowerCase())
          .filter(Boolean);
        hintKeys.forEach((k) => {
          if (!skuPidHints.has(k)) skuPidHints.set(k, pid);
        });
      } else {
        const keys = [offerId, sku, sellerArticle, nmId]
          .map((v) => String(v || "").trim())
          .filter(Boolean);
        keys.forEach((key) => {
          const k = key.toLowerCase();
          if (!outByKey.has(k)) outByKey.set(k, []);
          outByKey.get(k).push(stockRec);
        });
      }
    });
  };

  const now = new Date();
  const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);
  const analyticsVariants = [
    { endpoint: "/v2/analytics/stock", body: { dir: "ASC", limit: 1000, offset: 0 } },
    {
      endpoint: "/v2/analytics/stock",
      body: { dir: "ASC", filter: { since: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.000Z` }, limit: 1000, offset: 0 },
    },
    { endpoint: "/v1/analytics/stocks", body: {} },
    { endpoint: "/v1/analytics/stocks", body: { date_from: fromDate, date_to: toDate } },
    { endpoint: "/v1/analytics/stocks", body: { from_date: fromDate, to_date: toDate } },
    { endpoint: "/v1/analytics/stocks", body: { limit: 1000, offset: 0 } },
    { endpoint: "/v2/analytics/stock_on_warehouses", body: { limit: 1000, offset: 0, warehouse_type: "ALL" } },
    { endpoint: "/v1/analytics/stock_on_warehouses", body: { limit: 1000, offset: 0, warehouse_type: "ALL" } },
    { endpoint: "/v2/analytics/stock_on_warehouses", body: { limit: 1000, offset: 0 } },
    { endpoint: "/v1/analytics/stock_on_warehouses", body: { limit: 1000, offset: 0 } },
  ];
  for (const v of analyticsVariants) {
    try {
      const res = await ozonPost(v.endpoint, clientId, apiKey, v.body);
      const stat = getStat(`${v.endpoint} (analytics)`);
      stat.lastStatus = Number(res.status || 0);
      if (!res.ok) continue;
      const items = extractItemsFromOzonResponse(res.data);
      if (items.length && !stat.sample) {
        const first = items[0] || {};
        stat.sampleKeys = Object.keys(first).slice(0, 20);
        stat.sample = {
          product_id: first?.product_id ?? first?.productId ?? first?.id ?? null,
          offer_id: first?.offer_id ?? first?.offerId ?? null,
          sku: first?.sku ?? first?.seller_sku ?? first?.sellerSku ?? null,
          warehouse_id: first?.warehouse_id ?? first?.warehouseId ?? null,
          warehouse_name: first?.warehouse_name ?? first?.warehouseName ?? first?.warehouse ?? null,
          quantity: first?.quantity ?? first?.stock ?? first?.present ?? first?.available ?? null,
        };
      }
      stat.okCalls += 1;
      stat.totalItems += items.length;
      if (items.length) appendWarehouseItems(items);
    } catch {
      const stat = getStat(`${v.endpoint} (analytics)`);
      stat.lastStatus = -1;
    }
  }

  const analyticsGetVariants = [
    `/v1/analytics/stocks?date_from=${encodeURIComponent(fromDate)}&date_to=${encodeURIComponent(toDate)}`,
    `/v1/analytics/stocks?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
    "/v1/analytics/stocks",
  ];
  for (const path of analyticsGetVariants) {
    try {
      const res = await ozonRequest("GET", path, clientId, apiKey);
      const stat = getStat(`GET ${path}`);
      stat.lastStatus = Number(res.status || 0);
      if (!res.ok) continue;
      const items = extractItemsFromOzonResponse(res.data);
      if (items.length && !stat.sample) {
        const first = items[0] || {};
        stat.sampleKeys = Object.keys(first).slice(0, 20);
        stat.sample = {
          product_id: first?.product_id ?? first?.productId ?? first?.id ?? null,
          offer_id: first?.offer_id ?? first?.offerId ?? null,
          sku: first?.sku ?? first?.seller_sku ?? first?.sellerSku ?? null,
          warehouse_id: first?.warehouse_id ?? first?.warehouseId ?? null,
          warehouse_name: first?.warehouse_name ?? first?.warehouseName ?? first?.warehouse ?? null,
          quantity: first?.quantity ?? first?.stock ?? first?.present ?? first?.available ?? null,
        };
      }
      stat.okCalls += 1;
      stat.totalItems += items.length;
      if (items.length) appendWarehouseItems(items);
    } catch {
      const stat = getStat(`GET ${path}`);
      stat.lastStatus = -1;
    }
  }

  // FBO report endpoint (stocks/availability by warehouse)
  for (let page = 1; page <= 20; page += 1) {
    const bodyVariants = [
      { page, page_size: 1000 },
      { filter: {}, page, page_size: 1000 },
      { filter: { warehouse_type: "FBO" }, page, page_size: 1000 },
    ];
    let pageHadData = false;
    for (const body of bodyVariants) {
      try {
        const res = await ozonPost("/v1/report/warehouse/item/list", clientId, apiKey, body);
        const stat = getStat("/v1/report/warehouse/item/list");
        stat.lastStatus = Number(res.status || 0);
        if (!res.ok) continue;
        const items = extractItemsFromOzonResponse(res.data);
        if (items.length && !stat.sample) {
          const first = items[0] || {};
          stat.sampleKeys = Object.keys(first).slice(0, 20);
          stat.sample = {
            product_id: first?.product_id ?? first?.productId ?? first?.id ?? null,
            offer_id: first?.offer_id ?? first?.offerId ?? null,
            sku: first?.sku ?? first?.fbo_sku ?? first?.seller_sku ?? first?.sellerSku ?? null,
            warehouse_id: first?.warehouse_id ?? first?.warehouseId ?? null,
            warehouse_name: first?.warehouse_name ?? first?.warehouseName ?? first?.warehouse ?? null,
            quantity:
              first?.available_amount ??
              first?.free_to_sell_amount ??
              first?.quantity ??
              first?.stock ??
              first?.present ??
              null,
          };
        }
        stat.okCalls += 1;
        stat.totalItems += items.length;
        if (items.length) {
          appendWarehouseItems(items);
          pageHadData = true;
        }
      } catch {
        const stat = getStat("/v1/report/warehouse/item/list");
        stat.lastStatus = -1;
      }
    }
    if (!pageHadData) break;
  }

  const endpointVariants = [
    { endpoint: "/v1/product/info/stocks-by-warehouse/fbo", field: "sku", list: skuList },
    { endpoint: "/v1/product/info/stocks-by-warehouse/fbs", field: "sku", list: skuList },
    { endpoint: "/v2/product/info/stocks-by-warehouse/fbo", field: "sku", list: skuList },
    { endpoint: "/v2/product/info/stocks-by-warehouse/fbs", field: "sku", list: skuList },
    { endpoint: "/v1/product/info/stocks-by-warehouse", field: "sku", list: skuList },
    { endpoint: "/v2/product/info/stocks-by-warehouse", field: "sku", list: skuList },
    { endpoint: "/v1/product/info/stocks-by-warehouse", field: "offer_id", list: offerList },
    { endpoint: "/v2/product/info/stocks-by-warehouse", field: "offer_id", list: offerList },
    { endpoint: "/v1/product/info/stocks-by-warehouse", field: "product_id", list: productIdList },
    { endpoint: "/v2/product/info/stocks-by-warehouse", field: "product_id", list: productIdList },
  ];

  const fbsRealFbsVariants = [];
  for (const chunk of splitChunks(skuList, 100)) {
    fbsRealFbsVariants.push({ endpoint: "/v2/product/info/stocks-by-warehouse/fbs", label: "fbs+sku", body: { sku: chunk } });
    fbsRealFbsVariants.push({
      endpoint: "/v2/product/info/stocks-by-warehouse/fbs",
      label: "fbs+filter+sku",
      body: { filter: { sku: chunk } },
    });
    fbsRealFbsVariants.push({
      endpoint: "/v2/product/info/stocks-by-warehouse/fbs",
      label: "fbs+warehouse_type",
      body: { sku: chunk, warehouse_type: "ALL" },
    });
    fbsRealFbsVariants.push({
      endpoint: "/v2/product/info/stocks-by-warehouse/fbs",
      label: "fbs+stock_type",
      body: { sku: chunk, stock_type: "ALL" },
    });
    fbsRealFbsVariants.push({
      endpoint: "/v2/product/info/stocks-by-warehouse/fbs",
      label: "fbs+schema",
      body: { sku: chunk, delivery_schema: "FBS" },
    });
    fbsRealFbsVariants.push({
      endpoint: "/v2/product/info/stocks-by-warehouse/fbs",
      label: "realfbs+schema",
      body: { sku: chunk, delivery_schema: "REAL_FBS" },
    });
  }

  for (const variant of endpointVariants) {
    const list = Array.isArray(variant.list) ? variant.list : [];
    if (!list.length) continue;
    for (const chunk of splitChunks(list, 100)) {
      try {
        const body = { [variant.field]: chunk };
        const res = await ozonPost(variant.endpoint, clientId, apiKey, body);
        const stat = getStat(`${variant.endpoint} (${variant.field})`);
        stat.lastStatus = Number(res.status || 0);
        if (!res.ok) continue;
        const items = extractItemsFromOzonResponse(res.data);
        if (items.length && !stat.sample) {
          const first = items[0] || {};
          stat.sampleKeys = Object.keys(first).slice(0, 20);
          stat.sample = {
            product_id: first?.product_id ?? first?.productId ?? first?.id ?? null,
            offer_id: first?.offer_id ?? first?.offerId ?? null,
            sku: first?.sku ?? first?.seller_sku ?? first?.sellerSku ?? null,
            warehouse_id: first?.warehouse_id ?? first?.warehouseId ?? null,
            warehouse_name: first?.warehouse_name ?? first?.warehouseName ?? first?.warehouse ?? null,
            quantity: first?.quantity ?? first?.stock ?? first?.present ?? first?.available ?? null,
          };
        }
        stat.okCalls += 1;
        stat.totalItems += items.length;
        if (items.length) appendWarehouseItems(items);
      } catch {
        const stat = getStat(`${variant.endpoint} (${variant.field})`);
        stat.lastStatus = -1;
      }
    }
  }

  for (const variant of fbsRealFbsVariants) {
    try {
      const res = await ozonPost(variant.endpoint, clientId, apiKey, variant.body);
      const stat = getStat(`${variant.endpoint} (${variant.label})`);
      stat.lastStatus = Number(res.status || 0);
      if (!res.ok) continue;
      const items = extractItemsFromOzonResponse(res.data);
      if (items.length && !stat.sample) {
        const first = items[0] || {};
        stat.sampleKeys = Object.keys(first).slice(0, 20);
        stat.sample = {
          product_id: first?.product_id ?? first?.productId ?? first?.id ?? null,
          offer_id: first?.offer_id ?? first?.offerId ?? null,
          sku: first?.sku ?? first?.seller_sku ?? first?.sellerSku ?? null,
          warehouse_id: first?.warehouse_id ?? first?.warehouseId ?? null,
          warehouse_name: first?.warehouse_name ?? first?.warehouseName ?? first?.warehouse ?? null,
          quantity: first?.quantity ?? first?.stock ?? first?.present ?? first?.available ?? null,
        };
      }
      stat.okCalls += 1;
      stat.totalItems += items.length;
      if (items.length) appendWarehouseItems(items);
    } catch {
      const stat = getStat(`${variant.endpoint} (${variant.label})`);
      stat.lastStatus = -1;
    }
  }
  return { map: out, keyMap: outByKey, skuPidHints, endpointStats };
}

function getNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normId(value) {
  return String(value || "").trim();
}

function isSchemeName(value) {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw.replace(/[\s_-]+/g, "");
  return normalized === "fbo" || normalized === "fbs" || normalized === "ozonfbo" || normalized === "ozonfbs";
}

function pickWarehouseName(warehouseId, rawName, warehouseMap) {
  const id = normId(warehouseId);
  const byMap = id ? String(warehouseMap.get(id) || "").trim() : "";
  if (byMap) return { name: byMap, source: "map", id };
  const raw = String(rawName || "").trim();
  if (raw && !isSchemeName(raw)) return { name: raw, source: "raw", id };
  if (id) return { name: `Склад ${id}`, source: "id_fallback", id };
  return { name: "Ozon склад", source: "generic_fallback", id };
}

function extractStockRecords(stockItem) {
  const nested = Array.isArray(stockItem?.stocks) ? stockItem.stocks : [];
  if (nested.length) {
    return nested.map((s) => {
      const warehouseId = String(s?.warehouse_id || s?.warehouseId || stockItem?.warehouse_id || stockItem?.warehouseId || "");
      const warehouseName = String(s?.warehouse_name || s?.warehouseName || "");
      return {
        warehouseId,
        warehouseName,
        present: getNumber(s?.present || s?.free_to_sell_amount || s?.stock || s?.quantity),
        reserved: getNumber(s?.reserved || s?.reserved_amount),
        transit:
          getNumber(s?.in_transit_to_warehouse) +
          getNumber(s?.in_transit_from_warehouse) +
          getNumber(s?.coming),
      };
    });
  }
  if (stockItem?.stocks && typeof stockItem.stocks === "object" && !Array.isArray(stockItem.stocks)) {
    const values = Object.values(stockItem.stocks).filter((v) => v && typeof v === "object");
    const out = [];
    values.forEach((s) => {
      const warehouseIds = Array.isArray(s?.warehouse_ids)
        ? s.warehouse_ids.map((id) => normId(id)).filter(Boolean)
        : [];
      const present = getNumber(s?.present || s?.free_to_sell_amount || s?.stock || s?.quantity);
      const reserved = getNumber(s?.reserved || s?.reserved_amount);
      const transit = getNumber(s?.in_transit_to_warehouse) + getNumber(s?.in_transit_from_warehouse) + getNumber(s?.coming);
      if (!warehouseIds.length) {
        out.push({
          warehouseId: "",
          warehouseName: "",
          present,
          reserved,
          transit,
        });
        return;
      }
      const part = warehouseIds.length > 0 ? 1 / warehouseIds.length : 1;
      warehouseIds.forEach((id) => {
        out.push({
          warehouseId: id,
          warehouseName: "",
          // В этом формате Ozon не дает разбиение по складам, распределяем пропорционально.
          present: present * part,
          reserved: reserved * part,
          transit: transit * part,
        });
      });
    });
    if (out.length) return out;
  }
  return [
    {
      warehouseId: String(stockItem?.warehouse_id || stockItem?.warehouseId || ""),
      warehouseName: String(stockItem?.warehouse_name || stockItem?.warehouseName || ""),
      present: getNumber(stockItem?.present || stockItem?.free_to_sell_amount || stockItem?.stock || stockItem?.quantity),
      reserved: getNumber(stockItem?.reserved || stockItem?.reserved_amount),
      transit:
        getNumber(stockItem?.in_transit_to_warehouse) +
        getNumber(stockItem?.in_transit_from_warehouse) +
        getNumber(stockItem?.coming),
    },
  ];
}

function collapseRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = `${String(row.sku || "")}__${String(row.warehouse || "")}__${String(row.size || "")}`;
    if (!map.has(key)) {
      map.set(key, { ...row });
      return;
    }
    const prev = map.get(key);
    prev.stock = Math.max(0, Math.round(getNumber(prev.stock) + getNumber(row.stock)));
    prev.inTransit = Math.max(0, Math.round(getNumber(prev.inTransit) + getNumber(row.inTransit)));
    prev.totalStock = Math.max(0, Math.round(getNumber(prev.stock) + getNumber(prev.inTransit)));
    prev.ordered = Math.max(0, Math.round(getNumber(prev.ordered) + getNumber(row.ordered)));
    prev.bought = Math.max(0, Math.round(getNumber(prev.bought) + getNumber(row.bought)));
    map.set(key, prev);
  });
  return [...map.values()].map((row) => {
    const ordered = Math.max(0, Math.round(getNumber(row.ordered)));
    const bought = Math.max(0, Math.round(getNumber(row.bought)));
    return {
      ...row,
      stock: Math.max(0, Math.round(getNumber(row.stock))),
      inTransit: Math.max(0, Math.round(getNumber(row.inTransit))),
      totalStock: Math.max(0, Math.round(getNumber(row.stock) + getNumber(row.inTransit))),
      ordered,
      bought,
      buyoutPercent: ordered > 0 ? (bought / ordered) * 100 : 0,
    };
  });
}

function extractNumericMetric(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "object") {
    const direct = [
      value.value,
      value.amount,
      value.count,
      value.qty,
      value.quantity,
      value.metric,
      value.result,
    ];
    for (const v of direct) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function metricNameOf(m) {
  if (m == null) return "";
  if (typeof m === "object") {
    return String(m.key || m.metric || m.name || m.id || "").trim().toLowerCase();
  }
  return "";
}

function metricValueByNames(metricsArr, names = []) {
  const wanted = (names || []).map((n) => String(n || "").trim().toLowerCase()).filter(Boolean);
  if (!Array.isArray(metricsArr) || !metricsArr.length) return 0;
  for (const m of metricsArr) {
    const mn = metricNameOf(m);
    if (mn && wanted.includes(mn)) return extractNumericMetric(m);
  }
  // fallback: first numeric metric
  for (const m of metricsArr) {
    const v = extractNumericMetric(typeof m === "object" ? (m.value ?? m.amount ?? m.count ?? m.qty ?? m.quantity) : m);
    if (v !== 0) return v;
  }
  return 0;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickBestMetric(item, metricsArr, directKeys = [], metricNames = []) {
  const directVals = [];
  for (const key of directKeys) {
    const v = toFiniteNumber(item?.[key]);
    if (v !== null) directVals.push(v);
  }
  const metricVal = metricValueByNames(metricsArr, metricNames);
  if (Number.isFinite(metricVal)) directVals.push(metricVal);

  // 1) Prefer any positive value.
  const positive = directVals.find((v) => v > 0);
  if (positive !== undefined) return positive;
  // 2) Otherwise return explicit zero if present.
  const zero = directVals.find((v) => v === 0);
  if (zero !== undefined) return zero;
  // 3) Otherwise no data.
  return 0;
}

function getDimensionValue(dim) {
  if (dim == null) return "";
  if (typeof dim === "string" || typeof dim === "number") return String(dim).trim();
  if (typeof dim === "object") {
    const candidates = [dim.id, dim.value, dim.name, dim.title, dim.key];
    for (const c of candidates) {
      const s = String(c || "").trim();
      if (s) return s;
    }
  }
  return "";
}

async function loadOzonOrdersSales(
  clientId,
  apiKey,
  days = 30,
  productRefs = [],
  infoMap = new Map(),
  skuPidHints = new Map()
) {
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - Math.max(1, days) * 86400000);
  const from = dateFrom.toISOString().slice(0, 10);
  const to = dateTo.toISOString().slice(0, 10);
  const diag = [];
  const metricVariants = [["ordered_units", "delivered_units"]];
  const dimVariants = [
    ["sku"],
    ["item_code"],
    ["offer_id"],
  ];

  const pidBySku = new Map();
  const pidByOffer = new Map();
  (productRefs || []).forEach((ref) => {
    const pid = Number(ref?.product_id || 0);
    if (!pid) return;
    const info = infoMap.get(pid) || {};
    const offerId = String(ref?.offer_id || info?.offer_id || "").trim();
    if (offerId) pidByOffer.set(offerId.toLowerCase(), pid);
    const cands = collectInfoSkuCandidates(info, ref);
    cands.text.forEach((s) => pidBySku.set(String(s || "").trim().toLowerCase(), pid));
    cands.numeric.forEach((n) => pidBySku.set(String(n), pid));
  });

  let best = {
    map: new Map(),
    totalOrdered: 0,
    totalBought: 0,
    matchedByPid: 0,
    unmatchedRows: 0,
    score: -1,
  };
  const metricByRequestedName = (item, metricsArr, requestedMetrics, directKeys = [], metricNames = []) => {
    for (const key of directKeys) {
      const v = toFiniteNumber(item?.[key]);
      if (v !== null) return v;
    }
    const wanted = (metricNames || []).map((n) => String(n || "").trim().toLowerCase()).filter(Boolean);
    if (!Array.isArray(metricsArr) || !metricsArr.length) return 0;
    for (const m of metricsArr) {
      const mn = metricNameOf(m);
      if (mn && wanted.includes(mn)) return extractNumericMetric(m);
    }
    const idx = (requestedMetrics || []).findIndex((m) => wanted.includes(String(m || "").trim().toLowerCase()));
    if (idx >= 0 && idx < metricsArr.length) return extractNumericMetric(metricsArr[idx]);
    return 0;
  };
  for (const metrics of metricVariants) {
    for (const dims of dimVariants) {
      const payloads = [
        { date_from: from, date_to: to, metrics, dimension: dims, limit: 1000, offset: 0 },
        { date_from: from, date_to: to, metrics, dimensions: dims, limit: 1000, offset: 0 },
      ];
      for (const bodyBase of payloads) {
        const endpoints = ["/v1/analytics/data", "/v2/analytics/data"];
        for (const analyticsEndpoint of endpoints) {
          const localMap = new Map();
          let localTotalOrdered = 0;
          let localTotalBought = 0;
          let localMatchedByPid = 0;
          let localUnmatchedRows = 0;
          const limit = Number(bodyBase.limit || 1000);
          let sawOk = false;
          for (let offset = 0, page = 1; page <= 1000; page += 1) {
            const body = { ...bodyBase, offset };
            try {
              const res = await ozonPost(analyticsEndpoint, clientId, apiKey, body);
              const items = res.ok
                ? Array.isArray(res.data?.result?.data)
                  ? res.data.result.data
                  : Array.isArray(res.data?.result?.rows)
                  ? res.data.result.rows
                  : Array.isArray(res.data?.data)
                  ? res.data.data
                  : []
                : [];
              const totals = Array.isArray(res.data?.result?.totals) ? res.data.result.totals : [];
              diag.push({
                endpoint: analyticsEndpoint,
                status: Number(res.status || 0),
                metrics: metrics.join("|"),
                dims: dims.join("|"),
                note: `page:${page}; offset:${offset}; rows:${items.length}; totals:${totals.join("|")}`,
              });
              if (!res.ok) break;
              sawOk = true;
              if (!items.length) break;
              items.forEach((item) => {
                const dimsArr = Array.isArray(item?.dimensions)
                  ? item.dimensions
                  : Array.isArray(item?.dimension)
                  ? item.dimension
                  : [];
                const metricsArr = Array.isArray(item?.metrics) ? item.metrics : [];
                const dim0 = getDimensionValue(dimsArr[0]);
                const dim1 = getDimensionValue(dimsArr[1]);
                const skuRaw = String(
                  item?.sku ||
                    item?.item_code ||
                    item?.offer_id ||
                    item?.seller_sku ||
                    item?.sellerSku ||
                    item?.supplier_article ||
                    item?.supplierArticle ||
                    dim0
                ).trim();
                const sku = skuRaw.toLowerCase();
                const warehouseRaw = String(item?.warehouse_name || item?.warehouse || dim1).trim();
                const warehouse = warehouseRaw.toLowerCase();
                if (!skuRaw) return;
                const pid =
                  Number(item?.product_id || item?.productId || 0) ||
                  Number(pidBySku.get(sku) || 0) ||
                  Number(pidByOffer.get(sku) || 0) ||
                  Number(skuPidHints.get(sku) || 0);

                const orderedRaw = metricByRequestedName(
                  item,
                  metricsArr,
                  metrics,
                  ["ordered_count", "ordered_units", "orders_count", "orders", "ordered"],
                  ["ordered_units", "ordered_count", "orders_count", "orders"]
                );
                const boughtRaw = metricByRequestedName(
                  item,
                  metricsArr,
                  metrics,
                  ["delivered_count", "delivered_units", "sales_count", "sales", "bought"],
                  ["delivered_units", "delivered_count", "sales_count", "sales", "bought"]
                );
                const ordered = Math.max(0, Math.round(extractNumericMetric(orderedRaw)));
                const bought = Math.max(0, Math.round(extractNumericMetric(boughtRaw)));
                localTotalOrdered += ordered;
                localTotalBought += bought;
                if (pid > 0) localMatchedByPid += 1;
                else localUnmatchedRows += 1;

                const keys = [`${sku}__${warehouse}`, `${sku}__`];
                if (pid > 0) {
                  keys.push(`${pid}__${warehouse}`);
                  keys.push(`${pid}__`);
                }
                keys.forEach((key) => {
                  const prev = localMap.get(key) || { ordered: 0, bought: 0 };
                  localMap.set(key, { ordered: prev.ordered + ordered, bought: prev.bought + bought });
                });
              });
              if (items.length < limit) break;
              offset += items.length;
            } catch {
              diag.push({
                endpoint: analyticsEndpoint,
                status: -1,
                metrics: metrics.join("|"),
                dims: dims.join("|"),
                note: `page:${page}; offset:${offset}`,
              });
              break;
            }
          }
          if (!sawOk) continue;
          const score = localTotalOrdered + localTotalBought;
          if (localMap.size > 0 && (score > best.score || (score === best.score && localMatchedByPid > best.matchedByPid))) {
            best = {
              map: localMap,
              totalOrdered: localTotalOrdered,
              totalBought: localTotalBought,
              matchedByPid: localMatchedByPid,
              unmatchedRows: localUnmatchedRows,
              score,
            };
          }
        }
      }
    }
  }
  return {
    map: best.map,
    diag,
    totalOrdered: best.totalOrdered,
    totalBought: best.totalBought,
    matchedByPid: best.matchedByPid,
    unmatchedRows: best.unmatchedRows,
    source: best.map.size || best.totalOrdered > 0 || best.totalBought > 0 ? "analytics_api" : "none",
  };
}

function mapOzonToRows(
  productRefs,
  infoMap,
  stocksMap,
  warehouses,
  ozonOrdersSales = new Map(),
  stocksByWarehouseMap = new Map(),
  stocksByWarehouseKeyMap = new Map()
) {
  const warehouseMap = new Map();
  (warehouses || []).forEach((w) => {
    const name = String(w.name || w.warehouse_name || w.title || "").trim();
    const ids = [normId(w.warehouse_id), normId(w.id), normId(w.warehouseId), normId(w.warehouseID)].filter(Boolean);
    ids.forEach((id) => {
      if (id && name) warehouseMap.set(id, name);
    });
  });

  const rows = [];
  const diag = {
    warehousesFromApi: (warehouses || []).length,
    mappedByWarehouseId: 0,
    usedRawWarehouseName: 0,
    usedIdFallback: 0,
    usedGenericFallback: 0,
    unknownWarehouseIds: new Set(),
    usedWarehouseStocksEndpoint: 0,
    usedWarehouseStocksByKey: 0,
  };

  function getGlobalOrdersForSku(pid, offerId, skuAlt) {
    const pidOnly = `${pid}__`;
    const skuOnly = `${offerId}__`;
    const skuOnlyLower = `${String(offerId || "").toLowerCase()}__`;
    const altOnly = `${skuAlt}__`;
    const altOnlyLower = `${String(skuAlt || "").toLowerCase()}__`;
    return (
      ozonOrdersSales.get(pidOnly) ||
      ozonOrdersSales.get(skuOnly) ||
      ozonOrdersSales.get(skuOnlyLower) ||
      ozonOrdersSales.get(altOnly) ||
      ozonOrdersSales.get(altOnlyLower) ||
      { ordered: 0, bought: 0 }
    );
  }

  for (const ref of productRefs) {
    const pid = Number(ref.product_id || 0);
    if (!pid) continue;
    const info = infoMap.get(pid) || {};
    const offerId = String(ref.offer_id || info.offer_id || info.sku || "");
    const skuAlt = String(info?.sku || "").trim();
    const name = String(info.name || info.title || info.offer_id || offerId || `Ozon #${pid}`);
    const brand = String(info.brand || info.brand_name || "—");
    const category = String(info.category_name || info.type_name || "Без категории");

    const pidStocks = stocksByWarehouseMap.get(pid) || [];
    let keyStocks = [];
    if (!pidStocks.length && stocksByWarehouseKeyMap && stocksByWarehouseKeyMap.size) {
      const keyCandidates = [
        String(offerId || "").trim().toLowerCase(),
        String(info?.offer_id || "").trim().toLowerCase(),
        String(info?.sku || "").trim().toLowerCase(),
      ].filter(Boolean);
      for (const key of keyCandidates) {
        const arr = stocksByWarehouseKeyMap.get(key);
        if (arr?.length) {
          keyStocks = arr;
          break;
        }
      }
    }

    const stockItems = pidStocks.length ? pidStocks : keyStocks.length ? keyStocks : stocksMap.get(pid) || [];
    if (pidStocks.length) diag.usedWarehouseStocksEndpoint += 1;
    else if (keyStocks.length) diag.usedWarehouseStocksByKey += 1;

    if (!stockItems.length) {
      const present = Number(info?.stocks?.present || info?.stock || 0);
      const aggOrders = getGlobalOrdersForSku(pid, offerId, skuAlt);
      rows.push({
        sku: offerId || String(pid),
        name,
        category,
        brand,
        nmId: pid,
        barcode: "",
        size: "N/A",
        warehouse: "Ozon склад",
        bought: aggOrders.bought || 0,
        ordered: aggOrders.ordered || 0,
        stock: Math.max(0, Math.round(present)),
        revenue: 0,
        inTransit: 0,
        totalStock: Math.max(0, Math.round(present)),
        buyoutPercent: 0,
      });
      continue;
    }

    const rowsForPid = [];
    stockItems.forEach((stockItem) => {
      const records = extractStockRecords(stockItem);
      records.forEach((rec) => {
        const warehouseId = normId(rec.warehouseId);
        const picked = pickWarehouseName(warehouseId, rec.warehouseName, warehouseMap);
        const warehouseName = picked.name;
        if (picked.source === "map") diag.mappedByWarehouseId += 1;
        else if (picked.source === "raw") diag.usedRawWarehouseName += 1;
        else if (picked.source === "id_fallback") {
          diag.usedIdFallback += 1;
          if (picked.id) diag.unknownWarehouseIds.add(picked.id);
        } else {
          diag.usedGenericFallback += 1;
        }

        const stock = Math.max(0, Math.round(getNumber(rec.present) + getNumber(rec.reserved)));
        const inTransit = Math.max(0, Math.round(getNumber(rec.transit)));
        const whLower = String(warehouseName || "").toLowerCase();
        const exactKey = `${offerId}__${warehouseName}`;
        const exactLowerKey = `${String(offerId || "").toLowerCase()}__${whLower}`;
        const altExact = `${skuAlt}__${warehouseName}`;
        const altExactLower = `${skuAlt.toLowerCase()}__${whLower}`;
        const pidExact = `${pid}__${whLower}`;

        const aggOrdersSpecific =
          ozonOrdersSales.get(pidExact) ||
          ozonOrdersSales.get(exactKey) ||
          ozonOrdersSales.get(exactLowerKey) ||
          ozonOrdersSales.get(altExact) ||
          ozonOrdersSales.get(altExactLower) ||
          { ordered: 0, bought: 0 };

        rowsForPid.push({
          sku: offerId || String(pid),
          name,
          category,
          brand,
          nmId: pid,
          barcode: "",
          size: "N/A",
          warehouse: warehouseName || "Ozon склад",
          bought: aggOrdersSpecific.bought || 0,
          ordered: aggOrdersSpecific.ordered || 0,
          stock,
          revenue: 0,
          inTransit,
          totalStock: stock + inTransit,
          buyoutPercent: 0,
        });
      });
    });

    if (rowsForPid.length) {
      const hasSpecific = rowsForPid.some((r) => (r.ordered || 0) > 0 || (r.bought || 0) > 0);
      if (!hasSpecific) {
        const globalOrders = getGlobalOrdersForSku(pid, offerId, skuAlt);
        const totalOrd = Math.max(0, Math.round(globalOrders.ordered || 0));
        const totalBuy = Math.max(0, Math.round(globalOrders.bought || 0));
        if (totalOrd > 0 || totalBuy > 0) {
          const totalWeight = rowsForPid.reduce((sum, r) => sum + Math.max(0, getNumber(r.stock) + getNumber(r.inTransit)), 0);
          const fallbackWeight = rowsForPid.length > 0 ? 1 / rowsForPid.length : 0;
          let ordLeft = totalOrd;
          let buyLeft = totalBuy;
          rowsForPid.forEach((r, idx) => {
            const weight =
              totalWeight > 0
                ? Math.max(0, getNumber(r.stock) + getNumber(r.inTransit)) / totalWeight
                : fallbackWeight;
            if (idx === rowsForPid.length - 1) {
              r.ordered = ordLeft;
              r.bought = buyLeft;
              return;
            }
            const partOrd = Math.max(0, Math.round(totalOrd * weight));
            const partBuy = Math.max(0, Math.round(totalBuy * weight));
            r.ordered = partOrd;
            r.bought = partBuy;
            ordLeft -= partOrd;
            buyLeft -= partBuy;
          });
        }
      }
      rows.push(...rowsForPid);
    }
  }

  return { rows, diag };
}

function readJson(req) {
  return new Promise((resolve) => {
    let chunks = "";
    const MAX_BODY_SIZE = 25 * 1024 * 1024;
    req.on("data", (chunk) => {
      chunks += chunk;
      if (chunks.length > MAX_BODY_SIZE) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(chunks ? JSON.parse(chunks) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(WEB_DIR, rel);
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res, urlObj) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/auth/exists") {
    const username = normalizeUsername(urlObj.searchParams.get("username"));
    const row = db.prepare("SELECT 1 as x FROM users WHERE username_key = ?").get(username);
    return sendJson(res, 200, { ok: true, exists: !!row });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/auth/register") {
    const payload = await readJson(req);
    const usernameRaw = String(payload.username || "").trim();
    const usernameKey = normalizeUsername(usernameRaw);
    const password = String(payload.password || "");
    if (usernameKey.length < 3 || password.length < 6) {
      return sendJson(res, 400, { ok: false, error: "invalid_credentials" });
    }
    const exists = db.prepare("SELECT 1 as x FROM users WHERE username_key = ?").get(usernameKey);
    if (exists) return sendJson(res, 409, { ok: false, error: "user_exists" });
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    db.prepare(
      "INSERT INTO users (username_key, username_display, salt, password_hash) VALUES (?, ?, ?, ?)"
    ).run(usernameKey, usernameRaw, salt, passwordHash);
    return sendJson(res, 200, { ok: true, usernameKey, username: usernameRaw });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/auth/login") {
    const payload = await readJson(req);
    const usernameKey = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const user = db
      .prepare("SELECT username_key, username_display, salt, password_hash FROM users WHERE username_key = ?")
      .get(usernameKey);
    if (!user) return sendJson(res, 404, { ok: false, error: "not_found" });
    const givenHash = hashPassword(password, user.salt);
    const ok = crypto.timingSafeEqual(Buffer.from(givenHash, "hex"), Buffer.from(user.password_hash, "hex"));
    if (!ok) return sendJson(res, 401, { ok: false, error: "invalid_password" });
    return sendJson(res, 200, { ok: true, usernameKey: user.username_key, username: user.username_display });
  }

  if (req.method === "GET" && urlObj.pathname === "/api/user-data/all") {
    const username = normalizeUsername(urlObj.searchParams.get("username"));
    if (!username) return sendJson(res, 400, { ok: false, error: "username_required" });
    const rows = db.prepare("SELECT data_key, value_json FROM user_data WHERE username_key = ?").all(username);
    const out = {};
    for (const row of rows) {
      try {
        out[row.data_key] = JSON.parse(row.value_json);
      } catch {
        out[row.data_key] = null;
      }
    }
    return sendJson(res, 200, { ok: true, data: out });
  }

  if (req.method === "PUT" && urlObj.pathname === "/api/user-data") {
    const payload = await readJson(req);
    const username = normalizeUsername(payload.username);
    const dataKey = String(payload.key || "").trim();
    if (!username || !dataKey) return sendJson(res, 400, { ok: false, error: "invalid_payload" });
    const valueJson = JSON.stringify(payload.value ?? null);
    db.prepare(
      `INSERT INTO user_data (username_key, data_key, value_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(username_key, data_key)
       DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    ).run(username, dataKey, valueJson);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/user-data/sync") {
    const payload = await readJson(req);
    const username = normalizeUsername(payload.username);
    const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
    if (!username || !pairs.length) return sendJson(res, 400, { ok: false, error: "invalid_payload" });
    const stmt = db.prepare(
      `INSERT INTO user_data (username_key, data_key, value_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(username_key, data_key)
       DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    );
    const tx = db.transaction(() => {
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const dataKey = String(pair[0] || "").trim();
        if (!dataKey) continue;
        const valueJson = JSON.stringify(pair[1] ?? null);
        stmt.run(username, dataKey, valueJson);
      }
    });
    tx();
    return sendJson(res, 200, { ok: true, saved: pairs.length });
  }

  // Создать резервную копию
  if (req.method === "POST" && urlObj.pathname === "/api/user-data/backup") {
    const payload = await readJson(req);
    const username = normalizeUsername(payload.username);
    if (!username) return sendJson(res, 400, { ok: false, error: "username_required" });
    const backupName = String(payload.name || "").trim() || new Date().toISOString().replace(/[:.]/g, "-");
    const rows = db.prepare("SELECT data_key, value_json FROM user_data WHERE username_key = ?").all(username);
    const snapshot = {};
    for (const row of rows) {
      try { snapshot[row.data_key] = JSON.parse(row.value_json); } catch { snapshot[row.data_key] = null; }
    }
    // Ограничиваем 5 резервными копиями на пользователя
    const count = db.prepare("SELECT COUNT(*) as cnt FROM user_data_backups WHERE username_key = ?").get(username);
    if (count && count.cnt >= 5) {
      db.prepare("DELETE FROM user_data_backups WHERE id = (SELECT id FROM user_data_backups WHERE username_key = ? ORDER BY created_at ASC LIMIT 1)").run(username);
    }
    db.prepare("INSERT INTO user_data_backups (username_key, backup_name, backup_json) VALUES (?, ?, ?)").run(username, backupName, JSON.stringify(snapshot));
    return sendJson(res, 200, { ok: true, name: backupName });
  }

  // Список резервных копий
  if (req.method === "GET" && urlObj.pathname === "/api/user-data/backups") {
    const username = normalizeUsername(urlObj.searchParams.get("username"));
    if (!username) return sendJson(res, 400, { ok: false, error: "username_required" });
    const rows = db.prepare("SELECT id, backup_name, created_at FROM user_data_backups WHERE username_key = ? ORDER BY created_at DESC").all(username);
    return sendJson(res, 200, { ok: true, backups: rows.map((r) => ({ id: r.id, name: r.backup_name, createdAt: r.created_at })) });
  }

  // Восстановить из резервной копии
  if (req.method === "POST" && urlObj.pathname === "/api/user-data/restore") {
    const payload = await readJson(req);
    const username = normalizeUsername(payload.username);
    const backupId = Number(payload.backupId);
    if (!username || !backupId) return sendJson(res, 400, { ok: false, error: "invalid_payload" });
    const backup = db.prepare("SELECT backup_json FROM user_data_backups WHERE id = ? AND username_key = ?").get(backupId, username);
    if (!backup) return sendJson(res, 404, { ok: false, error: "backup_not_found" });
    let snapshot;
    try { snapshot = JSON.parse(backup.backup_json); } catch { return sendJson(res, 500, { ok: false, error: "corrupt_backup" }); }
    const stmt = db.prepare(
      `INSERT INTO user_data (username_key, data_key, value_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(username_key, data_key)
       DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    );
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(snapshot)) {
        stmt.run(username, key, JSON.stringify(value ?? null));
      }
    });
    tx();
    return sendJson(res, 200, { ok: true, restored: Object.keys(snapshot).length });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/migrate/local-profile") {
    const payload = await readJson(req);
    const user = payload?.user || {};
    const usernameKey = normalizeUsername(user.usernameKey || user.username_key || user.username);
    const usernameDisplay = String(user.username || user.username_display || usernameKey).trim() || usernameKey;
    const salt = String(user.salt || "").trim();
    const passwordHash = String(user.passwordHash || user.password_hash || "").trim();
    if (!usernameKey || !salt || !passwordHash) {
      return sendJson(res, 400, { ok: false, error: "invalid_user_payload" });
    }

    const existing = db.prepare("SELECT 1 as x FROM users WHERE username_key = ?").get(usernameKey);
    if (!existing) {
      db.prepare(
        "INSERT INTO users (username_key, username_display, salt, password_hash) VALUES (?, ?, ?, ?)"
      ).run(usernameKey, usernameDisplay, salt, passwordHash);
    } else {
      db.prepare(
        "UPDATE users SET username_display = ?, salt = ?, password_hash = ? WHERE username_key = ?"
      ).run(usernameDisplay, salt, passwordHash, usernameKey);
    }

    const userData = payload?.userData && typeof payload.userData === "object" ? payload.userData : {};
    for (const [key, value] of Object.entries(userData)) {
      const valueJson = JSON.stringify(value ?? null);
      db.prepare(
        `INSERT INTO user_data (username_key, data_key, value_json, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(username_key, data_key)
         DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).run(usernameKey, key, valueJson);
    }
    return sendJson(res, 200, { ok: true, usernameKey });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/ozon/test") {
    return sendJson(res, 200, {
      ok: true,
      detail: "Ozon API отключён. Используйте загрузку отчётов (XLSX остатки + CSV заказы).",
    });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/ozon/load") {
    return sendJson(res, 200, {
      ok: false,
      error: "api_disabled",
      detail: "Ozon API отключён. Загружайте данные через отчёты: XLSX (остатки) и CSV (заказы).",
    });
  }

  return sendJson(res, 404, { ok: false, error: "not_found" });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (urlObj.pathname.startsWith("/api/")) return handleApi(req, res, urlObj);
  return serveStatic(req, res, urlObj.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`WB server started on http://${HOST}:${PORT}`);
});

