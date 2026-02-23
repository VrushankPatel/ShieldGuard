const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const BILLING_PAYMENT_PATH_PREFIXES = [
  '/billing/',
  '/billing-cycles',
  '/maintenance-charges',
  '/special-assessments',
  '/invoices',
  '/payment-reminders',
  '/late-fee-rules',
  '/payments'
]

function loadOpenApiSpec(projectDir) {
  const openApiPath = path.resolve(projectDir, 'src/main/resources/openapi.yml')
  if (!fs.existsSync(openApiPath)) {
    throw new Error(`OpenAPI spec not found at ${openApiPath}`)
  }

  const raw = fs.readFileSync(openApiPath, 'utf8')
  const spec = YAML.parse(raw)
  if (!spec?.paths) {
    throw new Error(`OpenAPI spec at ${openApiPath} does not contain a paths section`)
  }

  return {
    openApiPath,
    spec
  }
}

function isBillingPaymentPath(pathValue) {
  return BILLING_PAYMENT_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) {
      return pathValue.startsWith(prefix)
    }
    return pathValue === prefix || pathValue.startsWith(`${prefix}/`)
  })
}

function discoverBillingPaymentGetSmokePaths(spec) {
  const paths = Object.entries(spec.paths || {})
    .filter(([pathValue]) => isBillingPaymentPath(pathValue))
    .filter(([pathValue, operationMap]) => {
      if (pathValue.includes('{')) {
        return false
      }

      const getOperation = operationMap?.get
      if (!getOperation) {
        return false
      }

      return Boolean(getOperation.responses?.['200'])
    })
    .map(([pathValue]) => pathValue)
    .sort()

  return [...new Set(paths)]
}

module.exports = {
  loadOpenApiSpec,
  discoverBillingPaymentGetSmokePaths
}
