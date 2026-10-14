const crypto = require("crypto");
const https = require("https");

const SANDBOX_BASE_URL = "https://api.test.sandbox.pesepay.com/payments-engine";
const LIVE_BASE_URL = "https://api.pesepay.com/api/payments-engine";

const ECOCASH_USD_CODE = "PZW211";
const PAID_STATUSES = new Set(["SUCCESS", "PAID", "DELIVERED", "AWAITING_DELIVERY"]);
const FAILED_STATUSES = new Set(["FAILED", "CANCELLED", "CANCELED", "EXPIRED", "DECLINED", "ERROR"]);

const pesepayBaseUrl = () =>
  String(process.env.PESEPAY_MODE || "sandbox").toLowerCase() === "live"
    ? LIVE_BASE_URL
    : SANDBOX_BASE_URL;

const getPublicBaseUrl = (req) =>
  String(
    process.env.PESEPAY_PUBLIC_BASE_URL ||
      process.env.PAYNOW_PUBLIC_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");

const encryptPayload = (data, encryptionKey) => {
  const key = Buffer.from(encryptionKey, "utf8");
  const iv = key.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]).toString("base64");
};

const decryptPayload = (payload, encryptionKey) => {
  const key = Buffer.from(encryptionKey, "utf8");
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted);
};

const requestJson = (method, url, { headers = {}, body = null } = {}) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : "";
    const request = https.request(
      {
        method,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        insecureHTTPParser: true,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch (error) {
            return reject(new Error(`PesePay returned invalid JSON: ${raw.slice(0, 250)}`));
          }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new Error(`PesePay HTTP ${response.statusCode}: ${raw.slice(0, 500)}`));
          }
          resolve(json);
        });
      }
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });

const decodeResponse = (response, encryptionKey) =>
  response && response.payload ? decryptPayload(response.payload, encryptionKey) : response;

const postEncrypted = async ({ url, payload, integrationKey, encryptionKey }) => {
  const response = await requestJson("POST", url, {
    headers: { authorization: integrationKey },
    body: { payload: encryptPayload(payload, encryptionKey) },
  });
  return decodeResponse(response, encryptionKey);
};

const makeConfig = ({ integrationKey, encryptionKey, req }) => {
  const baseUrl = pesepayBaseUrl();
  const publicBaseUrl = getPublicBaseUrl(req);
  return {
    integrationKey,
    encryptionKey,
    initiateUrl: `${baseUrl}/v1/payments/initiate`,
    seamlessUrl:
      baseUrl === LIVE_BASE_URL
        ? `${baseUrl}/v2/payments/make-payment`
        : `${baseUrl}/v1/payments/make-payment`,
    checkPaymentUrl: `${baseUrl}/v1/payments/check-payment`,
    resultUrl: `${publicBaseUrl}/api/tenda-demo/payment/result`,
    returnUrl: `${publicBaseUrl}/api/tenda-demo/payment/return`,
  };
};

const makeEcocashPayment = ({ config, amount, phone, customerName, customerEmail, merchantReference, returnUrl }) =>
  postEncrypted({
    url: config.seamlessUrl,
    integrationKey: config.integrationKey,
    encryptionKey: config.encryptionKey,
    payload: {
      amountDetails: { amount, currencyCode: "USD" },
      merchantReference,
      reasonForPayment: `Tenda demo ticket ${merchantReference}`,
      resultUrl: config.resultUrl,
      returnUrl: returnUrl || config.returnUrl,
      paymentMethodCode: ECOCASH_USD_CODE,
      customer: {
        email: customerEmail || "payments@onhighbus.com",
        phoneNumber: phone,
        name: customerName || "Tenda Customer",
      },
      paymentMethodRequiredFields: { customerPhoneNumber: phone },
    },
  });

const initiateCardCheckout = ({ config, amount, merchantReference, returnUrl }) =>
  postEncrypted({
    url: config.initiateUrl,
    integrationKey: config.integrationKey,
    encryptionKey: config.encryptionKey,
    payload: {
      amountDetails: { amount, currencyCode: "USD" },
      merchantReference,
      reasonForPayment: `Tenda demo ticket ${merchantReference}`,
      resultUrl: config.resultUrl,
      returnUrl: returnUrl || config.returnUrl,
    },
  });

const checkPayment = async ({ config, referenceNumber }) => {
  const url = `${config.checkPaymentUrl}?referenceNumber=${encodeURIComponent(referenceNumber)}`;
  const response = await requestJson("GET", url, {
    headers: { authorization: config.integrationKey },
  });
  return decodeResponse(response, config.encryptionKey);
};

const statusText = (result) =>
  String(result?.transactionStatus || result?.status || result?.paymentStatus || "").trim();

const referenceNumber = (result) =>
  String(
    result?.referenceNumber ||
      result?.pollUrl ||
      result?.transactionReference ||
      result?.id ||
      ""
  ).trim();

const redirectUrl = (result) =>
  String(result?.redirectUrl || result?.redirect_url || result?.url || "").trim();

const isPaid = (result) => PAID_STATUSES.has(statusText(result).toUpperCase());
const isFailed = (result) => FAILED_STATUSES.has(statusText(result).toUpperCase());

module.exports = {
  decryptPayload,
  getPublicBaseUrl,
  initiateCardCheckout,
  isFailed,
  isPaid,
  makeConfig,
  makeEcocashPayment,
  referenceNumber,
  redirectUrl,
  statusText,
  checkPayment,
};
