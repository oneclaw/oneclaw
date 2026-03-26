#!/usr/bin/env node
// 火山引擎 CDN 缓存刷新脚本
// 用法: node scripts/volcengine-cdn-refresh.js <url1> [url2] ...
// 环境变量: VOLCENGINE_ACCESS_KEY, VOLCENGINE_SECRET_KEY

const crypto = require("crypto");
const https = require("https");

const AK = process.env.VOLCENGINE_ACCESS_KEY;
const SK = process.env.VOLCENGINE_SECRET_KEY;
if (!AK || !SK) {
  console.error("Missing VOLCENGINE_ACCESS_KEY or VOLCENGINE_SECRET_KEY");
  process.exit(1);
}

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Usage: node volcengine-cdn-refresh.js <url1> [url2] ...");
  process.exit(1);
}

const Service = "CDN";
const Region = "cn-north-1";
const Host = "cdn.volcengineapi.com";
const Action = "SubmitRefreshTask";
const Version = "2021-03-01";

const body = JSON.stringify({ Type: "file", UrlList: urls });
const now = new Date();
const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const shortDate = xDate.slice(0, 8);
const xContentSha256 = crypto.createHash("sha256").update(body).digest("hex");

const signedHeaders = "content-type;host;x-content-sha256;x-date";
const canonicalRequest = [
  "POST",
  "/",
  `Action=${Action}&Version=${Version}`,
  `content-type:application/json`,
  `host:${Host}`,
  `x-content-sha256:${xContentSha256}`,
  `x-date:${xDate}`,
  "",
  signedHeaders,
  xContentSha256,
].join("\n");

const credentialScope = [shortDate, Region, Service, "request"].join("/");
const stringToSign = [
  "HMAC-SHA256",
  xDate,
  credentialScope,
  crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
].join("\n");

const hmac = (key, data) =>
  crypto.createHmac("sha256", key).update(data).digest();
const kSigning = hmac(
  hmac(hmac(hmac(SK, shortDate), Region), Service),
  "request"
);
const signature = crypto
  .createHmac("sha256", kSigning)
  .update(stringToSign)
  .digest("hex");
const auth = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

const req = https.request(
  {
    hostname: Host,
    path: `/?Action=${Action}&Version=${Version}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host,
      Authorization: auth,
      "X-Date": xDate,
      "X-Content-Sha256": xContentSha256,
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log(data);
      if (res.statusCode >= 400) {
        process.exit(1);
      }
    });
  }
);
req.on("error", (err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
req.write(body);
req.end();
