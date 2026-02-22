const SPECIAL = '!@#$%^&*()_+-={}[]';

function randomSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createStrongPassword(prefix) {
  const safePrefix = (prefix || 'Shield').replace(/[^a-zA-Z0-9]/g, '');
  const suffix = randomSuffix().replace(/[^a-zA-Z0-9]/g, '');
  const special = SPECIAL[Math.floor(Math.random() * SPECIAL.length)];
  return `${safePrefix}Aa1${special}${suffix}`;
}

function createSocietyPayload(adminPassword) {
  const suffix = randomSuffix();
  return {
    societyName: `ShieldGuard Society ${suffix}`,
    societyAddress: `Sector ${Math.floor(Math.random() * 99) + 1}, Ahmedabad`,
    adminName: `Admin ${suffix}`,
    adminEmail: `admin.${suffix.replace(/[^0-9]/g, '')}@shieldguard.test`,
    adminPhone: '+919876543210',
    adminPassword
  };
}

module.exports = {
  randomSuffix,
  createStrongPassword,
  createSocietyPayload
};
