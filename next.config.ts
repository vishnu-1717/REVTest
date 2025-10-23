/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/.prisma/client/*.node'],
    '/dashboard': ['./node_modules/.prisma/client/*.node']
  }
}

module.exports = nextConfig
