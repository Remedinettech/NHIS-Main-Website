import type { NextConfig } from 'next';

// The shared workspace package ships TypeScript source (also runtime values such as the built-in site content and
// its validator), so Next must compile it.
const config: NextConfig = { poweredByHeader: false, experimental: { proxyClientMaxBodySize: '30mb' }, transpilePackages: ['@nhis/shared-types'] };
export default config;
