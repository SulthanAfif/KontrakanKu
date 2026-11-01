const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
  const pushConfigured = fs.existsSync(googleServicesFile);
  if (process.env.GOOGLE_SERVICES_JSON && !pushConfigured) throw new Error("GOOGLE_SERVICES_JSON tidak menunjuk ke file yang tersedia.");
  return {
    ...config,
    extra: { ...config.extra, pushConfigured },
    android: {
      ...config.android,
      ...(pushConfigured ? { googleServicesFile } : {}),
    },
  };
};
