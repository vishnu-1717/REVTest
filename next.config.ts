/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  outputFileTracingIncludes: {
    '/': ['./node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node']
  }
}

module.exports = nextConfig
