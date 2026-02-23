const { execFileSync } = require('child_process')
const bcrypt = require('bcryptjs')

function toTitleProxy(proxy) {
  const normalized = String(proxy || '').toLowerCase()
  if (normalized === 'haproxy') {
    return 'HaProxy'
  }
  if (normalized === 'nginx') {
    return 'Nginx'
  }
  return proxy || 'HaProxy'
}

function composeProjectName(config) {
  return `system${config.instances}nodes${toTitleProxy(config.proxy)}`.toLowerCase()
}

function runDocker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

function detectPostgresContainer(config) {
  if (config.localPostgresContainer) {
    return config.localPostgresContainer
  }

  try {
    const lines = runDocker(['ps', '--format', '{{.Names}}\t{{.Image}}'])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) {
      return null
    }

    const expectedPrefix = `${composeProjectName(config)}-postgres-`
    const preferred = lines.find((line) => {
      const [name, image] = line.split('\t')
      return name.startsWith(expectedPrefix) && image.startsWith('postgres')
    })
    if (preferred) {
      return preferred.split('\t')[0]
    }

    const fallback = lines.find((line) => {
      const [name, image] = line.split('\t')
      return name.endsWith('-postgres-1') && image.startsWith('postgres')
    })
    return fallback ? fallback.split('\t')[0] : null
  } catch (_error) {
    return null
  }
}

function toBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64')
}

function runPsqlUpdate(config, sql) {
  const containerName = detectPostgresContainer(config)
  if (!containerName) {
    return {
      ok: false,
      reason: 'Local postgres container was not detected'
    }
  }

  try {
    const output = runDocker([
      'exec',
      containerName,
      'psql',
      '-U',
      config.postgresUser,
      '-d',
      config.postgresDb,
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql
    ])
    const match = output.match(/UPDATE\s+(\d+)/)
    const updatedRows = match ? Number.parseInt(match[1], 10) : 0
    return {
      ok: true,
      updatedRows,
      containerName
    }
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : error.message
    return {
      ok: false,
      reason: stderr || 'psql update failed'
    }
  }
}

function overrideOtpChallenge(config, challengeToken, otpCode, maxAttempts = 5) {
  const otpHash = bcrypt.hashSync(otpCode, 10)
  const metadata = `otpHash=${otpHash};attempts=0;maxAttempts=${maxAttempts}`
  const tokenB64 = toBase64(challengeToken)
  const metadataB64 = toBase64(metadata)

  const sql =
    `UPDATE auth_token ` +
    `SET metadata = convert_from(decode('${metadataB64}','base64'),'UTF8') ` +
    `WHERE token_value = convert_from(decode('${tokenB64}','base64'),'UTF8') ` +
    `AND token_type = 'LOGIN_OTP' AND consumed_at IS NULL AND deleted = false;`

  const result = runPsqlUpdate(config, sql)
  if (!result.ok) {
    return {
      ...result,
      reason: `Unable to override OTP challenge metadata: ${result.reason}`
    }
  }

  if (result.updatedRows < 1) {
    return {
      ok: false,
      reason: 'OTP challenge token was not found in auth_token table'
    }
  }

  return {
    ok: true,
    updatedRows: result.updatedRows,
    containerName: result.containerName
  }
}

function clearUserLockout(config, email) {
  const emailB64 = toBase64(String(email).toLowerCase())
  const sql =
    `UPDATE users ` +
    `SET failed_login_attempts = 0, locked_until = NULL ` +
    `WHERE lower(email) = convert_from(decode('${emailB64}','base64'),'UTF8') ` +
    `AND deleted = false;`

  const result = runPsqlUpdate(config, sql)
  if (!result.ok) {
    return {
      ...result,
      reason: `Unable to clear lockout for ${email}: ${result.reason}`
    }
  }

  if (result.updatedRows < 1) {
    return {
      ok: false,
      reason: `No user row found for ${email}`
    }
  }

  return {
    ok: true,
    updatedRows: result.updatedRows,
    containerName: result.containerName
  }
}

module.exports = {
  overrideOtpChallenge,
  clearUserLockout
}
